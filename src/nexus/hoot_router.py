"""Deterministic authorization router for Hoot L1 missions.

This module does not execute missions. It only decides whether a structurally
loaded mission is permitted by the active Hoot contract and returns stable
reason codes. JSON Schema validation remains a caller responsibility until the
runtime adds a schema validator.
"""

from __future__ import annotations

from typing import Any, Mapping


ALLOW = "ALLOW"

MISSION_TO_CONTRACT_CAPABILITY = {
    "inspect_internal_state": "READ_PROJECT_STATE",
    "read_internal_artifact": "ANALYZE_INTERNAL_ARTIFACTS",
    "write_sandbox_artifact": "CREATE_INTERNAL_ARTIFACT",
    "hash_artifact": "RUN_DETERMINISTIC_CHECK",
    "append_internal_ledger": "APPEND_INTERNAL_LEDGER",
    "evaluate_internal_cycle": "RUN_DETERMINISTIC_CHECK",
    "query_internal_reliability": "RUN_DETERMINISTIC_CHECK",
}

DENIAL_ORDER = (
    "DENY_SCHEMA_INVALID",
    "DENY_AGENT_MISMATCH",
    "DENY_AUTHORITY_CLASS",
    "DENY_CAPABILITY",
    "DENY_STEP_BUDGET",
    "DENY_TOOL_BUDGET",
    "DENY_RECURSION_BUDGET",
    "DENY_COST_BUDGET",
    "DENY_HUMAN_GATE",
    "DENY_EVIDENCE_REQUIREMENT",
)


def _result(mission: Mapping[str, Any], codes: list[str]) -> dict[str, Any]:
    ordered = [code for code in DENIAL_ORDER if code in codes]
    return {
        "decision": "DENY" if ordered else ALLOW,
        "primary_code": ordered[0] if ordered else ALLOW,
        "secondary_codes": ordered[1:],
        "mission_id": mission.get("mission_id"),
        "agent": mission.get("agent"),
    }


def route_hoot_mission(
    mission: Mapping[str, Any],
    contract: Mapping[str, Any],
    *,
    schema_valid: bool = True,
    human_gate_required: bool = False,
    evidence_possible: bool = True,
) -> dict[str, Any]:
    """Return a deterministic ALLOW/DENY decision without side effects.

    `schema_valid`, `human_gate_required`, and `evidence_possible` are explicit
    inputs so this router never guesses about validation, side effects, or
    evidence. The same inputs always produce the same output.
    """

    codes: list[str] = []

    if not schema_valid:
        codes.append("DENY_SCHEMA_INVALID")

    if mission.get("agent") != contract.get("agent"):
        codes.append("DENY_AGENT_MISMATCH")

    authority = mission.get("authority_class")
    if authority not in set(contract.get("authority_classes", [])):
        codes.append("DENY_AUTHORITY_CLASS")

    allowed = set(contract.get("allowed_capabilities", []))
    requested = mission.get("requested_capabilities", [])
    mapped_requested = [MISSION_TO_CONTRACT_CAPABILITY.get(item) for item in requested]
    if any(item is None or item not in allowed for item in mapped_requested):
        codes.append("DENY_CAPABILITY")

    mission_limits = mission.get("limits", {})
    contract_limits = contract.get("limits", {})

    if mission_limits.get("max_steps", 0) > contract_limits.get("max_steps", -1):
        codes.append("DENY_STEP_BUDGET")

    if mission_limits.get("max_tool_calls", 0) > contract_limits.get("max_tool_calls", -1):
        codes.append("DENY_TOOL_BUDGET")

    if mission_limits.get("max_recursion_depth", 0) > contract_limits.get("max_recursion_depth", -1):
        codes.append("DENY_RECURSION_BUDGET")

    estimated_cost = mission_limits.get("estimated_cost_usd")
    max_cost = contract_limits.get("max_cost_usd")
    if estimated_cost is not None and max_cost is not None and estimated_cost > max_cost:
        codes.append("DENY_COST_BUDGET")

    if human_gate_required:
        codes.append("DENY_HUMAN_GATE")

    if not evidence_possible:
        codes.append("DENY_EVIDENCE_REQUIREMENT")

    return _result(mission, codes)
