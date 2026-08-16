"""Provider-free behavioral tests for the Hoot L1 authorization router.

These tests intentionally use only the Python standard library. They exercise
authorization behavior, boundary conditions, denial ordering, unknown-cost
neutrality, human gates, evidence requirements, and repeated-input determinism.
"""

from __future__ import annotations

import copy
import unittest

from src.nexus.hoot_router import ALLOW, route_hoot_mission


BASE_CONTRACT = {
    "agent": "Hoot",
    "authority_classes": ["REVERSIBLE_INTERNAL"],
    "allowed_capabilities": [
        "READ_PROJECT_STATE",
        "ANALYZE_INTERNAL_ARTIFACTS",
        "CREATE_INTERNAL_ARTIFACT",
        "CREATE_TEST_FIXTURE",
        "RUN_DETERMINISTIC_CHECK",
        "APPEND_INTERNAL_LEDGER",
        "UPDATE_INTERNAL_DOCUMENTATION",
    ],
    "limits": {
        "max_steps": 20,
        "max_tool_calls": 40,
        "max_recursion_depth": 2,
        "max_cost_usd": 1.0,
    },
}

BASE_MISSION = {
    "schema_version": "0.1",
    "mission_id": "router-test-001",
    "agent": "Hoot",
    "objective": "Exercise the deterministic authorization boundary.",
    "selected_task": "Run a provider-free router fixture.",
    "success_criteria": ["Router returns the expected deterministic decision."],
    "requested_capabilities": ["inspect_internal_state", "hash_artifact"],
    "authority_class": "REVERSIBLE_INTERNAL",
    "limits": {
        "max_steps": 5,
        "max_tool_calls": 8,
        "max_recursion_depth": 1,
        "estimated_cost_usd": 0.0,
        "estimated_compute_units": None,
    },
}


class HootRouterTests(unittest.TestCase):
    def route(self, mission=None, contract=None, **kwargs):
        return route_hoot_mission(
            copy.deepcopy(mission or BASE_MISSION),
            copy.deepcopy(contract or BASE_CONTRACT),
            **kwargs,
        )

    def assert_denied(self, result, primary_code):
        self.assertEqual(result["decision"], "DENY")
        self.assertEqual(result["primary_code"], primary_code)

    def test_clean_mission_is_allowed(self):
        result = self.route()
        self.assertEqual(result["decision"], ALLOW)
        self.assertEqual(result["primary_code"], ALLOW)
        self.assertEqual(result["secondary_codes"], [])

    def test_schema_invalid_is_denied_first(self):
        result = self.route(schema_valid=False)
        self.assert_denied(result, "DENY_SCHEMA_INVALID")

    def test_agent_mismatch(self):
        mission = copy.deepcopy(BASE_MISSION)
        mission["agent"] = "Nova"
        self.assert_denied(self.route(mission), "DENY_AGENT_MISMATCH")

    def test_authority_class_violation(self):
        mission = copy.deepcopy(BASE_MISSION)
        mission["authority_class"] = "EXTERNAL_WRITE"
        self.assert_denied(self.route(mission), "DENY_AUTHORITY_CLASS")

    def test_unknown_capability(self):
        mission = copy.deepcopy(BASE_MISSION)
        mission["requested_capabilities"] = ["send_external_message"]
        self.assert_denied(self.route(mission), "DENY_CAPABILITY")

    def test_step_budget_boundary_allows_equal_and_denies_above(self):
        mission = copy.deepcopy(BASE_MISSION)
        mission["limits"]["max_steps"] = BASE_CONTRACT["limits"]["max_steps"]
        self.assertEqual(self.route(mission)["decision"], ALLOW)
        mission["limits"]["max_steps"] += 1
        self.assert_denied(self.route(mission), "DENY_STEP_BUDGET")

    def test_tool_budget_boundary_allows_equal_and_denies_above(self):
        mission = copy.deepcopy(BASE_MISSION)
        mission["limits"]["max_tool_calls"] = BASE_CONTRACT["limits"]["max_tool_calls"]
        self.assertEqual(self.route(mission)["decision"], ALLOW)
        mission["limits"]["max_tool_calls"] += 1
        self.assert_denied(self.route(mission), "DENY_TOOL_BUDGET")

    def test_recursion_budget_boundary_allows_equal_and_denies_above(self):
        mission = copy.deepcopy(BASE_MISSION)
        mission["limits"]["max_recursion_depth"] = BASE_CONTRACT["limits"]["max_recursion_depth"]
        self.assertEqual(self.route(mission)["decision"], ALLOW)
        mission["limits"]["max_recursion_depth"] += 1
        self.assert_denied(self.route(mission), "DENY_RECURSION_BUDGET")

    def test_cost_boundary_allows_equal_and_denies_above(self):
        mission = copy.deepcopy(BASE_MISSION)
        mission["limits"]["estimated_cost_usd"] = BASE_CONTRACT["limits"]["max_cost_usd"]
        self.assertEqual(self.route(mission)["decision"], ALLOW)
        mission["limits"]["estimated_cost_usd"] = 1.01
        self.assert_denied(self.route(mission), "DENY_COST_BUDGET")

    def test_unknown_cost_is_neutral_not_free_excellence_or_denial(self):
        mission = copy.deepcopy(BASE_MISSION)
        mission["limits"]["estimated_cost_usd"] = None
        result = self.route(mission)
        self.assertEqual(result["decision"], ALLOW)
        self.assertNotIn("DENY_COST_BUDGET", result["secondary_codes"])

    def test_human_gate_denies(self):
        self.assert_denied(self.route(human_gate_required=True), "DENY_HUMAN_GATE")

    def test_evidence_impossible_denies(self):
        self.assert_denied(self.route(evidence_possible=False), "DENY_EVIDENCE_REQUIREMENT")

    def test_multiple_denials_have_stable_priority(self):
        mission = copy.deepcopy(BASE_MISSION)
        mission["agent"] = "Nova"
        mission["authority_class"] = "EXTERNAL_WRITE"
        mission["requested_capabilities"] = ["send_external_message"]
        mission["limits"]["max_steps"] = 999
        result = self.route(
            mission,
            schema_valid=False,
            human_gate_required=True,
            evidence_possible=False,
        )
        self.assertEqual(result["primary_code"], "DENY_SCHEMA_INVALID")
        self.assertEqual(
            result["secondary_codes"],
            [
                "DENY_AGENT_MISMATCH",
                "DENY_AUTHORITY_CLASS",
                "DENY_CAPABILITY",
                "DENY_STEP_BUDGET",
                "DENY_HUMAN_GATE",
                "DENY_EVIDENCE_REQUIREMENT",
            ],
        )

    def test_same_inputs_produce_identical_output(self):
        first = self.route()
        for _ in range(25):
            self.assertEqual(self.route(), first)


if __name__ == "__main__":
    unittest.main()
