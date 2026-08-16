"""Adversarial tests for Hoot's append-only hash-chained ledger."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from src.nexus.hoot_ledger import (
    DuplicateCycleError,
    LedgerCorruptionError,
    append_event,
    get_cycle,
    get_recent_cycles,
    verify_ledger,
)


def event(cycle_id: str, *, result: str = "PASS") -> dict:
    failure_mode = None if result == "PASS" else "TOOL_ERROR"
    return {
        "cycle_id": cycle_id,
        "timestamp": "2026-08-16T15:51:21Z",
        "agent": "Hoot",
        "objective": "Test deterministic ledger persistence",
        "selected_task": "Append one bounded test event",
        "success_criteria": ["Event is persisted and verifiable"],
        "actions": ["Run ledger fixture"],
        "evidence": [{"source": "test", "observation": "fixture evidence"}],
        "result": result,
        "failure_mode": failure_mode,
        "lesson": "Persistence must remain independently verifiable.",
        "next_priority": "Continue only after integrity passes.",
        "estimated_value": "MEDIUM",
        "human_action_required": None,
        "metrics": {
            "tool_calls": None,
            "failed_tool_calls": None,
            "estimated_compute_units": None,
            "estimated_cost_usd": None,
            "human_interventions": 0,
        },
    }


class HootLedgerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.path = Path(self.tempdir.name) / "cycles.jsonl"

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def _lines(self) -> list[str]:
        return self.path.read_text(encoding="utf-8").splitlines()

    def _rewrite(self, envelopes: list[dict]) -> None:
        self.path.write_text(
            "".join(json.dumps(x, sort_keys=True, separators=(",", ":")) + "\n" for x in envelopes),
            encoding="utf-8",
        )

    def test_genesis_append_succeeds(self) -> None:
        head = append_event(self.path, event("cycle-001"))
        verified = verify_ledger(self.path)
        self.assertEqual(verified.head_hash, head)
        self.assertEqual([x["cycle_id"] for x in verified.events], ["cycle-001"])

    def test_second_append_links_to_first_hash(self) -> None:
        first_hash = append_event(self.path, event("cycle-001"))
        append_event(self.path, event("cycle-002"))
        second = json.loads(self._lines()[1])
        self.assertEqual(second["previous_hash"], first_hash)

    def test_duplicate_cycle_id_is_rejected_without_mutation(self) -> None:
        append_event(self.path, event("cycle-001"))
        before = self.path.read_bytes()
        with self.assertRaises(DuplicateCycleError):
            append_event(self.path, event("cycle-001"))
        self.assertEqual(self.path.read_bytes(), before)

    def test_malformed_json_is_surfaced(self) -> None:
        self.path.write_text("{not-json}\n", encoding="utf-8")
        with self.assertRaises(LedgerCorruptionError):
            verify_ledger(self.path)

    def test_blank_line_is_surfaced(self) -> None:
        self.path.write_text("\n", encoding="utf-8")
        with self.assertRaises(LedgerCorruptionError):
            verify_ledger(self.path)

    def test_altered_historical_event_is_detected(self) -> None:
        append_event(self.path, event("cycle-001"))
        envelope = json.loads(self._lines()[0])
        envelope["event"]["lesson"] = "tampered"
        self._rewrite([envelope])
        with self.assertRaises(LedgerCorruptionError):
            verify_ledger(self.path)

    def test_altered_previous_hash_is_detected(self) -> None:
        append_event(self.path, event("cycle-001"))
        append_event(self.path, event("cycle-002"))
        envelopes = [json.loads(line) for line in self._lines()]
        envelopes[1]["previous_hash"] = "f" * 64
        self._rewrite(envelopes)
        with self.assertRaises(LedgerCorruptionError):
            verify_ledger(self.path)

    def test_schema_invalid_incoming_event_rejected_before_write(self) -> None:
        bad = event("cycle-001")
        bad["result"] = "PASS"
        bad["evidence"] = []
        with self.assertRaises(ValueError):
            append_event(self.path, bad)
        self.assertFalse(self.path.exists())

    def test_failed_append_after_corruption_leaves_bytes_unchanged(self) -> None:
        append_event(self.path, event("cycle-001"))
        raw = self.path.read_text(encoding="utf-8") + "{broken}\n"
        self.path.write_text(raw, encoding="utf-8")
        before = self.path.read_bytes()
        with self.assertRaises(LedgerCorruptionError):
            append_event(self.path, event("cycle-002"))
        self.assertEqual(self.path.read_bytes(), before)

    def test_lookup_returns_exact_persisted_event(self) -> None:
        expected = event("cycle-001")
        append_event(self.path, expected)
        self.assertEqual(get_cycle(self.path, "cycle-001"), expected)

    def test_recent_cycles_preserve_order(self) -> None:
        for i in range(1, 5):
            append_event(self.path, event(f"cycle-{i:03d}"))
        recent = get_recent_cycles(self.path, 2)
        self.assertEqual([x["cycle_id"] for x in recent], ["cycle-003", "cycle-004"])

    def test_repeated_verification_is_deterministic(self) -> None:
        append_event(self.path, event("cycle-001"))
        first = verify_ledger(self.path)
        for _ in range(25):
            self.assertEqual(verify_ledger(self.path), first)

    def test_unknown_telemetry_remains_null(self) -> None:
        expected = event("cycle-001")
        append_event(self.path, expected)
        persisted = get_cycle(self.path, "cycle-001")
        self.assertIsNone(persisted["metrics"]["estimated_cost_usd"])
        self.assertIsNone(persisted["metrics"]["estimated_compute_units"])
        self.assertIsNone(persisted["metrics"]["tool_calls"])

    def test_post_write_event_is_readable_and_linked(self) -> None:
        first = append_event(self.path, event("cycle-001"))
        second = append_event(self.path, event("cycle-002"))
        verified = verify_ledger(self.path)
        self.assertEqual(verified.head_hash, second)
        envelopes = [json.loads(line) for line in self._lines()]
        self.assertEqual(envelopes[1]["previous_hash"], first)
        self.assertEqual(verified.events[-1]["cycle_id"], "cycle-002")


if __name__ == "__main__":
    unittest.main()
