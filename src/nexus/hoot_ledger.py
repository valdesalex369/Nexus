"""Deterministic append-only JSONL ledger for Hoot cycle events."""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

GENESIS_HASH = "0" * 64

_EVENT_REQUIRED_KEYS = {
    "schema_version",
    "cycle_id",
    "timestamp",
    "agent",
    "objective",
    "selected_task",
    "selection_reason",
    "success_criteria",
    "actions",
    "evidence",
    "result",
    "failure_mode",
    "lesson",
    "next_priority",
    "estimated_value",
    "human_action_required",
    "metrics",
}
_EVENT_ALLOWED_KEYS = _EVENT_REQUIRED_KEYS | {"tools_used"}
_EVIDENCE_ALLOWED_KEYS = {"source", "observation", "digest_sha256"}
_METRIC_KEYS = {
    "tool_calls",
    "failed_tool_calls",
    "estimated_compute_units",
    "estimated_cost_usd",
    "human_interventions",
}
_HASH_RE = re.compile(r"^[a-f0-9]{64}$")


class LedgerError(RuntimeError):
    """Base class for ledger failures."""


class LedgerCorruptionError(LedgerError):
    """Raised when persisted history fails deterministic verification."""


class DuplicateCycleError(LedgerError):
    """Raised when a cycle_id already exists in verified history."""


@dataclass(frozen=True)
class VerifiedLedger:
    events: tuple[dict[str, Any], ...]
    head_hash: str


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _event_hash(sequence: int, previous_hash: str, event: dict[str, Any]) -> str:
    payload = f"{sequence}\n{previous_hash}\n{_canonical_json(event)}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _nonempty_string(value: Any, field: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")


def _nonnegative_int_or_none(value: Any, field: str) -> None:
    if value is None:
        return
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{field} must be a non-negative integer or null")


def _nonnegative_number_or_none(value: Any, field: str) -> None:
    if value is None:
        return
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        raise ValueError(f"{field} must be a non-negative number or null")


def _validate_event(event: dict[str, Any]) -> None:
    if not isinstance(event, dict):
        raise ValueError("event must be an object")
    missing = sorted(_EVENT_REQUIRED_KEYS - set(event))
    if missing:
        raise ValueError(f"event missing required fields: {', '.join(missing)}")
    extras = sorted(set(event) - _EVENT_ALLOWED_KEYS)
    if extras:
        raise ValueError(f"event contains unsupported fields: {', '.join(extras)}")

    if event["schema_version"] != "0.1":
        raise ValueError("schema_version must be 0.1")
    _nonempty_string(event["cycle_id"], "cycle_id")
    _nonempty_string(event["timestamp"], "timestamp")
    try:
        parsed = datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("timestamp must be ISO-8601 date-time") from exc
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include timezone information")
    if event["agent"] != "Hoot":
        raise ValueError("agent must be Hoot")

    for field in ("objective", "selected_task", "selection_reason", "lesson", "next_priority"):
        _nonempty_string(event[field], field)

    criteria = event["success_criteria"]
    if not isinstance(criteria, list) or not criteria:
        raise ValueError("success_criteria must be a non-empty array")
    for item in criteria:
        _nonempty_string(item, "success_criteria item")

    actions = event["actions"]
    if not isinstance(actions, list):
        raise ValueError("actions must be an array")
    for item in actions:
        _nonempty_string(item, "actions item")

    tools_used = event.get("tools_used", [])
    if not isinstance(tools_used, list):
        raise ValueError("tools_used must be an array")
    for item in tools_used:
        _nonempty_string(item, "tools_used item")

    evidence = event["evidence"]
    if not isinstance(evidence, list):
        raise ValueError("evidence must be an array")
    for item in evidence:
        if not isinstance(item, dict):
            raise ValueError("evidence entries must be objects")
        if set(item) - _EVIDENCE_ALLOWED_KEYS:
            raise ValueError("evidence entry contains unsupported fields")
        if not {"source", "observation"} <= set(item):
            raise ValueError("evidence entry requires source and observation")
        _nonempty_string(item["source"], "evidence source")
        _nonempty_string(item["observation"], "evidence observation")
        digest = item.get("digest_sha256")
        if digest is not None and (not isinstance(digest, str) or not _HASH_RE.fullmatch(digest)):
            raise ValueError("digest_sha256 must be a lowercase SHA-256 hex string or null")

    if event["result"] not in {"PASS", "PARTIAL", "BLOCKED", "FAIL"}:
        raise ValueError("invalid result")
    if event["estimated_value"] not in {"LOW", "MEDIUM", "HIGH"}:
        raise ValueError("invalid estimated_value")

    failure_mode = event["failure_mode"]
    if event["result"] == "PASS":
        if not evidence:
            raise ValueError("PASS requires evidence")
        if failure_mode is not None:
            raise ValueError("PASS cannot carry failure_mode")
    else:
        _nonempty_string(failure_mode, "failure_mode")

    human_action = event["human_action_required"]
    if human_action is not None:
        _nonempty_string(human_action, "human_action_required")

    metrics = event["metrics"]
    if not isinstance(metrics, dict) or set(metrics) != _METRIC_KEYS:
        raise ValueError("metrics must contain exactly the v0.1 metric fields")
    _nonnegative_int_or_none(metrics["tool_calls"], "tool_calls")
    _nonnegative_int_or_none(metrics["failed_tool_calls"], "failed_tool_calls")
    _nonnegative_number_or_none(metrics["estimated_compute_units"], "estimated_compute_units")
    _nonnegative_number_or_none(metrics["estimated_cost_usd"], "estimated_cost_usd")
    human_interventions = metrics["human_interventions"]
    if isinstance(human_interventions, bool) or not isinstance(human_interventions, int) or human_interventions < 0:
        raise ValueError("human_interventions must be a non-negative integer")


def _decode_lines(lines: Iterable[str]) -> VerifiedLedger:
    events: list[dict[str, Any]] = []
    seen: set[str] = set()
    expected_previous = GENESIS_HASH
    expected_sequence = 1

    for line_number, raw in enumerate(lines, start=1):
        if not raw.strip():
            raise LedgerCorruptionError(f"blank ledger line at {line_number}")
        try:
            envelope = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise LedgerCorruptionError(f"invalid JSON at line {line_number}") from exc
        if not isinstance(envelope, dict):
            raise LedgerCorruptionError(f"non-object envelope at line {line_number}")
        if set(envelope) != {"sequence", "previous_hash", "event_hash", "event"}:
            raise LedgerCorruptionError(f"invalid envelope fields at line {line_number}")
        if envelope["sequence"] != expected_sequence:
            raise LedgerCorruptionError(f"sequence mismatch at line {line_number}")
        event = envelope["event"]
        try:
            _validate_event(event)
        except ValueError as exc:
            raise LedgerCorruptionError(f"invalid event at line {line_number}: {exc}") from exc
        cycle_id = event["cycle_id"]
        if cycle_id in seen:
            raise LedgerCorruptionError(f"duplicate cycle_id in history: {cycle_id}")
        if envelope["previous_hash"] != expected_previous:
            raise LedgerCorruptionError(f"broken previous_hash at line {line_number}")
        calculated = _event_hash(expected_sequence, expected_previous, event)
        if envelope["event_hash"] != calculated:
            raise LedgerCorruptionError(f"hash mismatch at line {line_number}")
        seen.add(cycle_id)
        events.append(event)
        expected_previous = calculated
        expected_sequence += 1

    return VerifiedLedger(tuple(events), expected_previous)


def verify_ledger(path: str | Path) -> VerifiedLedger:
    ledger_path = Path(path)
    if not ledger_path.exists():
        return VerifiedLedger((), GENESIS_HASH)
    if not ledger_path.is_file():
        raise LedgerCorruptionError("ledger path is not a file")
    with ledger_path.open("r", encoding="utf-8", newline="") as handle:
        return _decode_lines(handle)


def append_event(path: str | Path, event: dict[str, Any]) -> str:
    """Verify all history, append one event, fsync, then verify/read back."""
    _validate_event(event)
    ledger_path = Path(path)
    verified = verify_ledger(ledger_path)
    if any(existing["cycle_id"] == event["cycle_id"] for existing in verified.events):
        raise DuplicateCycleError(event["cycle_id"])

    event_copy = json.loads(_canonical_json(event))
    sequence = len(verified.events) + 1
    new_hash = _event_hash(sequence, verified.head_hash, event_copy)
    envelope = {
        "sequence": sequence,
        "previous_hash": verified.head_hash,
        "event_hash": new_hash,
        "event": event_copy,
    }
    encoded = _canonical_json(envelope) + "\n"

    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    with ledger_path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())

    after = verify_ledger(ledger_path)
    if after.head_hash != new_hash or not after.events or after.events[-1]["cycle_id"] != event["cycle_id"]:
        raise LedgerCorruptionError("post-write verification failed")
    return new_hash


def get_cycle(path: str | Path, cycle_id: str) -> dict[str, Any] | None:
    verified = verify_ledger(path)
    for event in verified.events:
        if event["cycle_id"] == cycle_id:
            return event
    return None


def list_cycles(path: str | Path) -> list[dict[str, Any]]:
    return list(verify_ledger(path).events)


def get_recent_cycles(path: str | Path, limit: int) -> list[dict[str, Any]]:
    if limit < 0:
        raise ValueError("limit must be non-negative")
    events = verify_ledger(path).events
    if limit == 0:
        return []
    return list(events[-limit:])
