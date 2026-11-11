"""Fail-closed gate for high-consequence claims made by a Hive agent.

This pure function is a deterministic checkpoint, not a source of truth.
The runtime MUST supply receipts obtained independently from trusted adapters.
Never accept model-authored evidence, model-supplied current time, or a
self-asserted verified flag as the trusted receipt input. A production adapter
must authenticate its source and bind each receipt to a real observation.

The gate prevents four known classes of overclaim when all outbound assertions
of those classes are actually routed through it. It does not verify arbitrary
English or connect tools, providers, accounts, or other AI agents.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

# These are target claims, not integrations that presently exist.
CLAIM_POLICY_VERSION = "0.1"
CLAIM_POLICIES: dict[str, dict[str, Any]] = {
    "approval_visible": {
        "source": "approval_ui_adapter",
        "status": "presented",
        "max_age_seconds": 120,
    },
    "live_position": {
        "source": "position_adapter",
        "status": "success",
        "max_age_seconds": 15,
    },
    "agent_message_delivered": {
        "source": "a2a_transport_adapter",
        "status": "delivered",
        "max_age_seconds": 300,
    },
    "job_verified_complete": {
        "source": "runner_adapter",
        "status": "verified_complete",
        "max_age_seconds": 300,
    },
}


def _utc(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if result.tzinfo is None or result.utcoffset() is None:
        return None
    return result.astimezone(timezone.utc)


def _out(kind: Any, target_id: Any, code: str, receipt_id: str | None = None) -> dict[str, Any]:
    return {
        "policy_version": CLAIM_POLICY_VERSION,
        "decision": "ALLOW" if code == "SUPPORTED_BY_RECEIPT" else "BLOCK",
        "reason_code": code,
        "kind": kind,
        "target_id": target_id,
        "receipt_id": receipt_id,
    }


def evaluate_claim(
    claim: Mapping[str, Any],
    trusted_receipts: Sequence[Mapping[str, Any]],
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Determine whether a typed claim has independent, timely evidence.

    claim is untrusted model output and trusted_receipts is ONLY for
    host-verified adapter output. The host, not the agent, populates receipts.
    Passing the same model-generated data as both inputs defeats the gate.

    Required receipt fields: receipt_id, kind, target_id, source, status,
    observed_at. A live position also needs data_as_of (actual source time).
    A verified-complete job also needs artifact_hash and test_exit_code=0.
    """
    kind = claim.get("kind") if isinstance(claim, Mapping) else None
    target_id = claim.get("target_id") if isinstance(claim, Mapping) else None
    if not isinstance(kind, str) or kind not in CLAIM_POLICIES:
        return _out(kind, target_id, "UNKNOWN_CLAIM_KIND")
    if not isinstance(target_id, str) or not target_id.strip():
        return _out(kind, target_id, "INVALID_TARGET")
    if not isinstance(trusted_receipts, (list, tuple)):
        return _out(kind, target_id, "INVALID_RECEIPT_COLLECTION")

    reference = now if now is not None else datetime.now(timezone.utc)
    if reference.tzinfo is None or reference.utcoffset() is None:
        return _out(kind, target_id, "INVALID_CLOCK")
    reference = reference.astimezone(timezone.utc)
    policy = CLAIM_POLICIES[kind]

    matching = [
        r for r in trusted_receipts
        if isinstance(r, Mapping)
        and r.get("kind") == kind
        and r.get("target_id") == target_id
        and r.get("source") == policy["source"]
    ]
    if not matching:
        return _out(kind, target_id, "NO_TRUSTED_RECEIPT")

    # List ordering must not make a valid receipt disappear behind a bad one.
    saw_status = saw_time = saw_fresh = False
    for receipt in matching:
        if receipt.get("status") != policy["status"]:
            continue
        saw_status = True
        observed = _utc(receipt.get("observed_at"))
        if observed is None or observed > reference:
            continue
        saw_time = True
        if (reference - observed).total_seconds() > policy["max_age_seconds"]:
            continue
        if kind == "live_position":
            as_of = _utc(receipt.get("data_as_of"))
            # A newly retrieved old account snapshot is not live data.
            if as_of is None or as_of > observed:
                continue
            if (reference - as_of).total_seconds() > policy["max_age_seconds"]:
                continue
        if kind == "job_verified_complete":
            if not isinstance(receipt.get("artifact_hash"), str) or len(receipt["artifact_hash"]) != 64:
                continue
            if type(receipt.get("test_exit_code")) is not int or receipt["test_exit_code"] != 0:
                continue
        saw_fresh = True
        receipt_id = receipt.get("receipt_id")
        if not isinstance(receipt_id, str) or not receipt_id.strip():
            continue
        return _out(kind, target_id, "SUPPORTED_BY_RECEIPT", receipt_id)

    if not saw_status:
        return _out(kind, target_id, "WRONG_RECEIPT_STATUS")
    if not saw_time:
        return _out(kind, target_id, "BAD_RECEIPT_TIME")
    if not saw_fresh:
        return _out(kind, target_id, "STALE_OR_INCOMPLETE_EVIDENCE")
    return _out(kind, target_id, "MISSING_RECEIPT_ID")
