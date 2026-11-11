"""Regression cases derived from actual Hive overclaim failure modes.

Receipts here are SYNTHETIC. These tests do not imply live adapters exist.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import unittest

from src.nexus.claim_gate import evaluate_claim

NOW = datetime(2026, 11, 11, 23, 35, tzinfo=timezone.utc)


def receipt(kind, target, source, status, *, seconds_ago=1, **extra):
    record = {
        "receipt_id": "test-receipt-001", "kind": kind,
        "target_id": target, "source": source, "status": status,
        "observed_at": (NOW - timedelta(seconds=seconds_ago)).isoformat(),
    }
    record.update(extra)
    return record


class ClaimGateTests(unittest.TestCase):
    def gate(self, kind, target, receipts):
        return evaluate_claim({"kind": kind, "target_id": target}, receipts, now=NOW)

    def assert_blocked(self, response, reason):
        self.assertEqual(response["decision"], "BLOCK")
        self.assertEqual(response["reason_code"], reason)
        self.assertIsNone(response["receipt_id"])

    def test_nonexistent_approval_button_blocked(self):
        self.assert_blocked(self.gate("approval_visible", "hive-approval-001", []), "NO_TRUSTED_RECEIPT")

    def test_queued_approval_is_not_visible_approval(self):
        proof = receipt("approval_visible", "hive-approval-001", "approval_ui_adapter", "queued")
        self.assert_blocked(self.gate("approval_visible", "hive-approval-001", [proof]), "WRONG_RECEIPT_STATUS")

    def test_confirmed_ui_approval_visible(self):
        proof = receipt("approval_visible", "hive-approval-001", "approval_ui_adapter", "presented")
        self.assertEqual(self.gate("approval_visible", "hive-approval-001", [proof])["decision"], "ALLOW")

    def test_model_authored_claim_cannot_supply_its_own_evidence(self):
        model_claim = {"kind": "approval_visible", "target_id": "x", "proof": "button there"}
        self.assert_blocked(evaluate_claim(model_claim, [], now=NOW), "NO_TRUSTED_RECEIPT")

    def test_old_kraken_snapshot_not_live_even_if_retrieved_now(self):
        proof = receipt("live_position", "kraken-position-A", "position_adapter", "success",
                        data_as_of=(NOW - timedelta(days=30)).isoformat())
        self.assert_blocked(self.gate("live_position", "kraken-position-A", [proof]), "STALE_OR_INCOMPLETE_EVIDENCE")

    def test_fresh_position_requires_fresh_exchange_observation(self):
        proof = receipt("live_position", "kraken-position-A", "position_adapter", "success",
                        data_as_of=(NOW - timedelta(seconds=3)).isoformat())
        self.assertEqual(self.gate("live_position", "kraken-position-A", [proof])["decision"], "ALLOW")

    def test_wrong_account_never_matches(self):
        proof = receipt("live_position", "other-account", "position_adapter", "success",
                        data_as_of=(NOW - timedelta(seconds=3)).isoformat())
        self.assert_blocked(self.gate("live_position", "kraken-position-A", [proof]), "NO_TRUSTED_RECEIPT")

    def test_unsent_agent_request_not_delivery(self):
        proof = receipt("agent_message_delivered", "to-muse-001", "a2a_transport_adapter", "queued")
        self.assert_blocked(self.gate("agent_message_delivered", "to-muse-001", [proof]), "WRONG_RECEIPT_STATUS")

    def test_agent_delivery_requires_transport_receipt(self):
        proof = receipt("agent_message_delivered", "to-muse-001", "a2a_transport_adapter", "delivered")
        self.assertEqual(self.gate("agent_message_delivered", "to-muse-001", [proof])["decision"], "ALLOW")

    def test_model_says_jobs_finished_but_no_tests_blocked(self):
        proof = receipt("job_verified_complete", "cycle-001", "runner_adapter", "verified_complete")
        self.assert_blocked(self.gate("job_verified_complete", "cycle-001", [proof]), "STALE_OR_INCOMPLETE_EVIDENCE")

    def test_tested_job_has_artifact_and_command_result(self):
        proof = receipt("job_verified_complete", "cycle-001", "runner_adapter", "verified_complete",
                        artifact_hash="a" * 64, test_exit_code=0)
        self.assertEqual(self.gate("job_verified_complete", "cycle-001", [proof])["decision"], "ALLOW")

    def test_missing_target_and_unknown_kind(self):
        self.assert_blocked(self.gate("unproven_kind", "X", []), "UNKNOWN_CLAIM_KIND")
        self.assert_blocked(self.gate("live_position", "", []), "INVALID_TARGET")

    def test_bad_timestamp_and_future_time(self):
        proof = receipt("approval_visible", "x", "approval_ui_adapter", "presented",
                        observed_at="2026-11-11T23:35:00")
        self.assert_blocked(self.gate("approval_visible", "x", [proof]), "BAD_RECEIPT_TIME")
        proof["observed_at"] = (NOW + timedelta(seconds=1)).isoformat()
        self.assert_blocked(self.gate("approval_visible", "x", [proof]), "BAD_RECEIPT_TIME")

    def test_stale_receipt(self):
        proof = receipt("approval_visible", "x", "approval_ui_adapter", "presented", seconds_ago=400)
        self.assert_blocked(self.gate("approval_visible", "x", [proof]), "STALE_OR_INCOMPLETE_EVIDENCE")

    def test_invalid_source_and_list_order(self):
        bogus = receipt("approval_visible", "x", "model_made_it_up", "presented")
        good = receipt("approval_visible", "x", "approval_ui_adapter", "presented")
        old = receipt("approval_visible", "x", "approval_ui_adapter", "presented", seconds_ago=500)
        self.assert_blocked(self.gate("approval_visible", "x", [bogus]), "NO_TRUSTED_RECEIPT")
        self.assertEqual(self.gate("approval_visible", "x", [old, good])["decision"], "ALLOW")
        self.assertEqual(self.gate("approval_visible", "x", [good, old])["decision"], "ALLOW")


if __name__ == "__main__":
    unittest.main()
