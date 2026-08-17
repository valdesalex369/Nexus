from __future__ import annotations

import unittest

from src.nexus.hoot_ci_evidence import normalize_github_actions_snapshot

TARGET_SHA = "a" * 40
OTHER_SHA = "b" * 40


def snapshot(**overrides):
    value = {
        "repository": "valdesalex369/Nexus",
        "workflow_name": "Hoot CI",
        "workflow_path": ".github/workflows/hoot-ci.yml",
        "run_id": 32051928548,
        "run_number": 1,
        "run_attempt": 1,
        "head_sha": TARGET_SHA,
        "head_branch": "main",
        "event": "push",
        "status": "completed",
        "conclusion": "success",
        "created_at": "2026-08-17T17:00:00Z",
        "updated_at": "2026-08-17T17:02:00Z",
        "html_url": "https://github.com/valdesalex369/Nexus/actions/runs/32051928548",
        "logs_sha256": None,
        "test_count": None,
        "failure_count": None,
        "error_count": None,
        "jobs": [
            {
                "job_id": 1,
                "name": "test",
                "status": "completed",
                "conclusion": "success",
                "steps": [
                    {"name": "Compile source/tests", "status": "completed", "conclusion": "success"},
                    {"name": "Router tests", "status": "completed", "conclusion": "success"},
                    {"name": "Sandbox tests", "status": "completed", "conclusion": "success"},
                    {"name": "Ledger tests", "status": "completed", "conclusion": "success"},
                    {"name": "Evaluator tests", "status": "completed", "conclusion": "success"},
                    {"name": "Full unittest discovery", "status": "completed", "conclusion": "success"},
                ],
            }
        ],
    }
    value.update(overrides)
    return value


class HootCIEvidenceTests(unittest.TestCase):
    def test_matching_completed_success_is_certified(self):
        decision = normalize_github_actions_snapshot(snapshot(), target_sha=TARGET_SHA)
        self.assertTrue(decision.accepted)
        self.assertTrue(decision.certifies_target)
        self.assertEqual(decision.reason_code, "CERTIFIED")

    def test_success_for_wrong_sha_is_historical_not_certifying(self):
        decision = normalize_github_actions_snapshot(snapshot(head_sha=OTHER_SHA), target_sha=TARGET_SHA)
        self.assertTrue(decision.accepted)
        self.assertFalse(decision.certifies_target)
        self.assertEqual(decision.reason_code, "HEAD_SHA_MISMATCH")

    def test_in_progress_run_is_rejected_as_pending(self):
        decision = normalize_github_actions_snapshot(snapshot(status="in_progress", conclusion=None), target_sha=TARGET_SHA)
        self.assertFalse(decision.accepted)
        self.assertFalse(decision.certifies_target)
        self.assertEqual(decision.reason_code, "RUN_NOT_COMPLETED")

    def test_failed_run_is_preserved_as_failure_evidence(self):
        decision = normalize_github_actions_snapshot(snapshot(conclusion="failure"), target_sha=TARGET_SHA)
        self.assertTrue(decision.accepted)
        self.assertFalse(decision.certifies_target)
        self.assertEqual(decision.classification, "FAILURE_EVIDENCE")

    def test_cancelled_run_is_preserved_as_non_success_evidence(self):
        decision = normalize_github_actions_snapshot(snapshot(conclusion="cancelled"), target_sha=TARGET_SHA)
        self.assertTrue(decision.accepted)
        self.assertFalse(decision.certifies_target)
        self.assertEqual(decision.reason_code, "COMPLETED_NON_SUCCESS")

    def test_missing_required_step_is_rejected(self):
        s = snapshot()
        s["jobs"][0]["steps"] = [x for x in s["jobs"][0]["steps"] if "ledger" not in x["name"].lower()]
        decision = normalize_github_actions_snapshot(s, target_sha=TARGET_SHA)
        self.assertFalse(decision.accepted)
        self.assertEqual(decision.reason_code, "MISSING_REQUIRED_STEP")
        self.assertIn("ledger", decision.evidence["missing_required_steps"])

    def test_failed_required_step_is_rejected(self):
        s = snapshot()
        s["jobs"][0]["steps"][3]["conclusion"] = "failure"
        decision = normalize_github_actions_snapshot(s, target_sha=TARGET_SHA)
        self.assertFalse(decision.accepted)
        self.assertEqual(decision.reason_code, "REQUIRED_STEP_FAILED")

    def test_missing_run_id_is_rejected(self):
        decision = normalize_github_actions_snapshot(snapshot(run_id=None), target_sha=TARGET_SHA)
        self.assertFalse(decision.accepted)
        self.assertEqual(decision.reason_code, "MISSING_RUN_ID")

    def test_missing_head_sha_is_rejected(self):
        decision = normalize_github_actions_snapshot(snapshot(head_sha=None), target_sha=TARGET_SHA)
        self.assertFalse(decision.accepted)
        self.assertEqual(decision.reason_code, "MISSING_HEAD_SHA")

    def test_retry_attempts_remain_distinguishable(self):
        first = normalize_github_actions_snapshot(snapshot(run_attempt=1, conclusion="failure"), target_sha=TARGET_SHA)
        second = normalize_github_actions_snapshot(snapshot(run_attempt=2), target_sha=TARGET_SHA)
        self.assertEqual(first.evidence["run_attempt"], 1)
        self.assertEqual(second.evidence["run_attempt"], 2)
        self.assertNotEqual(first.classification, second.classification)

    def test_unknown_test_count_remains_null(self):
        decision = normalize_github_actions_snapshot(snapshot(), target_sha=TARGET_SHA)
        self.assertIsNone(decision.evidence["test_count"])
        self.assertIsNone(decision.evidence["failure_count"])
        self.assertIsNone(decision.evidence["error_count"])

    def test_repeated_normalization_is_deterministic(self):
        s = snapshot()
        first = normalize_github_actions_snapshot(s, target_sha=TARGET_SHA)
        for _ in range(25):
            self.assertEqual(normalize_github_actions_snapshot(s, target_sha=TARGET_SHA), first)


if __name__ == "__main__":
    unittest.main()
