"""SQLite-backed provenance graph for ULTRA INSTINCT / STEM claim records."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SOURCE_RANK = {
    "PRIMARY": 5,
    "MARKET": 4,
    "ONCHAIN": 4,
    "INTERNAL": 4,
    "SECONDARY": 3,
    "SOCIAL": 2,
    "MODEL": 1,
}
RECORD_TYPES = {
    "OBSERVATION", "CLAIM", "HYPOTHESIS", "PREDICTION",
    "CORRECTION", "DECISION", "OUTCOME",
}
STATUSES = {"ACTIVE", "DISPUTED", "SUPERSEDED", "RETRACTED", "EXPIRED"}


class GraphError(RuntimeError):
    """Base graph-store error."""


class DuplicateRecordError(GraphError):
    """Raised when an immutable record_id already exists."""


class InvalidRecordError(GraphError):
    """Raised when a record violates the v0 persistence contract."""


@dataclass(frozen=True)
class BeliefResult:
    record: dict[str, Any] | None
    candidate_count: int
    excluded_record_ids: tuple[str, ...]
    explanation: tuple[str, ...]


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _validate_record(record: dict[str, Any]) -> None:
    required = {
        "schema_version", "record_id", "record_type", "observed_at", "ingested_at",
        "subject", "predicate", "object", "source", "confidence", "status",
        "evidence", "provenance",
    }
    missing = sorted(required - set(record))
    if missing:
        raise InvalidRecordError(f"missing required fields: {', '.join(missing)}")
    if record["schema_version"] != "0.1":
        raise InvalidRecordError("schema_version must be 0.1")
    if not isinstance(record["record_id"], str) or not record["record_id"].strip():
        raise InvalidRecordError("record_id must be a non-empty string")
    if record["record_type"] not in RECORD_TYPES:
        raise InvalidRecordError("invalid record_type")
    if record["status"] not in STATUSES:
        raise InvalidRecordError("invalid status")
    confidence = record["confidence"]
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        raise InvalidRecordError("confidence must be between 0 and 1")
    subject = record["subject"]
    if not isinstance(subject, dict) or not subject.get("entity_id") or not subject.get("name"):
        raise InvalidRecordError("subject must contain entity_id and name")
    if not isinstance(record["predicate"], str) or not record["predicate"].strip():
        raise InvalidRecordError("predicate must be a non-empty string")
    source = record["source"]
    if not isinstance(source, dict) or source.get("source_type") not in SOURCE_RANK:
        raise InvalidRecordError("source must contain a supported source_type")
    provenance = record["provenance"]
    digest = provenance.get("raw_digest_sha256") if isinstance(provenance, dict) else None
    if not isinstance(digest, str) or len(digest) != 64:
        raise InvalidRecordError("provenance.raw_digest_sha256 must be a 64-char SHA-256 hex string")
    try:
        int(digest, 16)
    except ValueError as exc:
        raise InvalidRecordError("provenance.raw_digest_sha256 must be hexadecimal") from exc
    for field in ("supporting_record_ids", "contradicting_record_ids", "supersedes_record_ids"):
        value = record.get(field, [])
        if not isinstance(value, list) or any(not isinstance(x, str) or not x for x in value):
            raise InvalidRecordError(f"{field} must be an array of record IDs")


class StemGraphStore:
    """Small deterministic SQLite store for immutable STEM graph records."""

    def __init__(self, path: str | Path):
        self.path = str(path)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _initialize(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS records (
                    record_id TEXT PRIMARY KEY,
                    record_type TEXT NOT NULL,
                    observed_at TEXT NOT NULL,
                    ingested_at TEXT NOT NULL,
                    subject_id TEXT NOT NULL,
                    subject_type TEXT,
                    subject_name TEXT NOT NULL,
                    predicate TEXT NOT NULL,
                    object_json TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id TEXT,
                    confidence REAL NOT NULL,
                    status TEXT NOT NULL,
                    provenance_digest TEXT NOT NULL,
                    record_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_records_subject
                    ON records(subject_id, predicate, observed_at);
                CREATE INDEX IF NOT EXISTS idx_records_predicate_status
                    ON records(predicate, status, observed_at);
                CREATE TABLE IF NOT EXISTS links (
                    from_record_id TEXT NOT NULL,
                    relation TEXT NOT NULL,
                    to_record_id TEXT NOT NULL,
                    PRIMARY KEY (from_record_id, relation, to_record_id),
                    FOREIGN KEY (from_record_id) REFERENCES records(record_id),
                    FOREIGN KEY (to_record_id) REFERENCES records(record_id)
                );
                """
            )

    def append_record(self, record: dict[str, Any]) -> str:
        """Append one immutable record and links to already-known records."""
        _validate_record(record)
        record_copy = json.loads(_canonical_json(record))
        record_id = record_copy["record_id"]
        with self._connect() as conn:
            if conn.execute("SELECT 1 FROM records WHERE record_id = ?", (record_id,)).fetchone():
                raise DuplicateRecordError(record_id)

            link_fields = {
                "supporting_record_ids": "SUPPORTS",
                "contradicting_record_ids": "CONTRADICTS",
                "supersedes_record_ids": "SUPERSEDES",
            }
            for field in link_fields:
                for target in record_copy.get(field, []):
                    if not conn.execute("SELECT 1 FROM records WHERE record_id = ?", (target,)).fetchone():
                        raise InvalidRecordError(f"{field} references unknown record_id: {target}")

            subject = record_copy["subject"]
            source = record_copy["source"]
            conn.execute(
                "INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    record_id,
                    record_copy["record_type"],
                    record_copy["observed_at"],
                    record_copy["ingested_at"],
                    subject["entity_id"],
                    subject.get("entity_type"),
                    subject["name"],
                    record_copy["predicate"],
                    _canonical_json(record_copy["object"]),
                    source["source_type"],
                    source.get("source_id"),
                    float(record_copy["confidence"]),
                    record_copy["status"],
                    record_copy["provenance"]["raw_digest_sha256"],
                    _canonical_json(record_copy),
                ),
            )
            for field, relation in link_fields.items():
                for target in record_copy.get(field, []):
                    conn.execute(
                        "INSERT INTO links VALUES (?, ?, ?)",
                        (record_id, relation, target),
                    )
        return record_id

    def get_record(self, record_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT record_json FROM records WHERE record_id = ?", (record_id,)
            ).fetchone()
        return json.loads(row["record_json"]) if row else None

    def list_by_entity(self, entity_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT record_json FROM records WHERE subject_id = ? ORDER BY observed_at, record_id",
                (entity_id,),
            ).fetchall()
        return [json.loads(row["record_json"]) for row in rows]

    def current_belief(self, subject_id: str, predicate: str) -> BeliefResult:
        """Return the explainably preferred current claim for one graph slot."""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT record_json, source_type, confidence, observed_at
                FROM records
                WHERE subject_id = ? AND predicate = ?
                  AND record_type IN ('OBSERVATION','CLAIM','HYPOTHESIS','PREDICTION')
                  AND status IN ('ACTIVE','DISPUTED')
                """,
                (subject_id, predicate),
            ).fetchall()
            superseded = {
                row["to_record_id"]
                for row in conn.execute("SELECT to_record_id FROM links WHERE relation = 'SUPERSEDES'")
            }

        candidates: list[tuple[tuple[Any, ...], dict[str, Any], str]] = []
        for row in rows:
            record = json.loads(row["record_json"])
            if record["record_id"] in superseded:
                continue
            key = (
                SOURCE_RANK.get(row["source_type"], 0),
                float(row["confidence"]),
                row["observed_at"],
                record["record_id"],
            )
            candidates.append((key, record, row["source_type"]))

        candidates.sort(key=lambda item: item[0], reverse=True)
        if not candidates:
            return BeliefResult(None, 0, tuple(sorted(superseded)), ("No eligible active candidates.",))

        key, winner, source_type = candidates[0]
        explanation = [
            f"Selected {winner['record_id']} using source tier {source_type} "
            f"(rank {key[0]}), confidence {key[1]:.3f}, then recency as deterministic tie-breakers."
        ]
        if superseded:
            explanation.append(
                "Excluded records targeted by SUPERSEDES: " + ", ".join(sorted(superseded))
            )
        if len(candidates) > 1:
            explanation.append(
                f"Compared {len(candidates)} eligible candidates for the same subject/predicate."
            )
        return BeliefResult(
            winner,
            len(candidates),
            tuple(sorted(superseded)),
            tuple(explanation),
        )

    def integrity_digest(self) -> str:
        """Return a deterministic digest of immutable record and link state."""
        with self._connect() as conn:
            records = [
                row["record_json"]
                for row in conn.execute("SELECT record_json FROM records ORDER BY record_id")
            ]
            links = [
                [row["from_record_id"], row["relation"], row["to_record_id"]]
                for row in conn.execute(
                    "SELECT from_record_id, relation, to_record_id FROM links "
                    "ORDER BY from_record_id, relation, to_record_id"
                )
            ]
        payload = _canonical_json({"records": records, "links": links})
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()
