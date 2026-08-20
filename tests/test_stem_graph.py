from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from src.nexus.stem_graph import (
    DuplicateRecordError,
    InvalidRecordError,
    StemGraphStore,
)


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def record(
    record_id: str,
    *,
    source_type: str = "PRIMARY",
    confidence: float = 0.9,
    observed_at: str = "2026-08-20T12:00:00Z",
    contradict: list[str] | None = None,
    supersedes: list[str] | None = None,
) -> dict:
    return {
        "schema_version": "0.1",
        "record_id": record_id,
        "record_type": "CLAIM",
        "observed_at": observed_at,
        "ingested_at": "2026-08-20T12:01:00Z",
        "subject": {"entity_id": "btc", "entity_type": "ASSET", "name": "Bitcoin"},
        "predicate": "TEST_PREDICATE",
        "object": f"value-{record_id}",
        "source": {
            "source_id": f"source-{record_id}",
            "source_type": source_type,
            "uri": f"https://example.com/{record_id}",
            "publisher": "Example",
            "published_at": observed_at,
        },
        "confidence": confidence,
        "status": "ACTIVE",
        "evidence": [{"kind": "DOCUMENT", "observation": "test"}],
        "supporting_record_ids": [],
        "contradicting_record_ids": contradict or [],
        "supersedes_record_ids": supersedes or [],
        "provenance": {
            "collector": "test",
            "raw_digest_sha256": sha(record_id),
            "transformation_version": "test-v1",
        },
    }


class StemGraphTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.store = StemGraphStore(Path(self.tempdir.name) / "graph.sqlite")

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_append_and_get_are_exact(self) -> None:
        expected = record("r1")
        self.store.append_record(expected)
        self.assertEqual(self.store.get_record("r1"), expected)

    def test_duplicate_record_is_rejected_without_mutation(self) -> None:
        self.store.append_record(record("r1"))
        before = self.store.integrity_digest()
        with self.assertRaises(DuplicateRecordError):
            self.store.append_record(record("r1"))
        self.assertEqual(self.store.integrity_digest(), before)

    def test_links_must_target_existing_record(self) -> None:
        with self.assertRaises(InvalidRecordError):
            self.store.append_record(record("r2", contradict=["missing"]))
        self.assertIsNone(self.store.get_record("r2"))

    def test_contradictory_records_can_coexist(self) -> None:
        self.store.append_record(record("r1"))
        self.store.append_record(record("r2", source_type="SECONDARY", contradict=["r1"]))
        self.assertEqual(len(self.store.list_by_entity("btc")), 2)
        result = self.store.current_belief("btc", "TEST_PREDICATE")
        self.assertEqual(result.record["record_id"], "r1")

    def test_supersession_changes_view_without_rewriting_history(self) -> None:
        old = record("r1", confidence=0.7)
        self.store.append_record(old)
        self.store.append_record(
            record(
                "r2",
                confidence=0.95,
                supersedes=["r1"],
                observed_at="2026-08-21T12:00:00Z",
            )
        )
        self.assertEqual(self.store.get_record("r1"), old)
        result = self.store.current_belief("btc", "TEST_PREDICATE")
        self.assertEqual(result.record["record_id"], "r2")
        self.assertIn("r1", result.excluded_record_ids)

    def test_source_quality_precedes_model_confidence(self) -> None:
        self.store.append_record(record("primary", source_type="PRIMARY", confidence=0.65))
        self.store.append_record(
            record(
                "model",
                source_type="MODEL",
                confidence=0.99,
                observed_at="2026-08-21T12:00:00Z",
            )
        )
        result = self.store.current_belief("btc", "TEST_PREDICATE")
        self.assertEqual(result.record["record_id"], "primary")

    def test_integrity_digest_is_deterministic(self) -> None:
        self.store.append_record(record("r1"))
        first = self.store.integrity_digest()
        for _ in range(5):
            self.assertEqual(self.store.integrity_digest(), first)


if __name__ == "__main__":
    unittest.main()
