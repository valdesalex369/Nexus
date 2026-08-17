"""Deterministic normalization of GitHub Actions evidence for Hoot."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping

EXPECTED_WORKFLOW_PATH = ".github/workflows/hoot-ci.yml"
REQUIRED_STEP_MARKERS = (
    "compile",
    "router",
    "sandbox",
    "ledger",
    "evaluator",
    "unittest discovery",
)


@dataclass(frozen=True)
class CIEvidenceDecision:
    accepted: bool
    certifies_target: bool
    classification: str
    reason_code: str
    evidence: dict[str, Any]


def _required_step_status(jobs: Iterable[Mapping[str, Any]]) -> tuple[bool, bool, list[str]]:
    observed: list[tuple[str, str | None]] = []
    for job in jobs:
        for step in job.get("steps") or ():
            observed.append((str(step.get("name") or "").lower(), step.get("conclusion")))
    missing: list[str] = []
    failed = False
    for marker in REQUIRED_STEP_MARKERS:
        matches = [conclusion for name, conclusion in observed if marker in name]
        if not matches:
            missing.append(marker)
        elif any(conclusion != "success" for conclusion in matches):
            failed = True
    return not missing, not failed, missing


def normalize_github_actions_snapshot(
    snapshot: Mapping[str, Any], *, target_sha: str
) -> CIEvidenceDecision:
    """Normalize a pre-fetched GitHub Actions snapshot without network access.

    This function never executes GitHub calls and never infers missing test counts.
    It preserves completed non-success runs as evidence while refusing to certify
    queued/in-progress runs, wrong commits, wrong workflows, or incomplete test gates.
    """
    run_id = snapshot.get("run_id")
    head_sha = snapshot.get("head_sha")
    status = snapshot.get("status")
    conclusion = snapshot.get("conclusion")
    workflow_path = snapshot.get("workflow_path")
    jobs = list(snapshot.get("jobs") or ())

    evidence = {
        "provider": "github_actions",
        "repository": snapshot.get("repository"),
        "workflow_name": snapshot.get("workflow_name"),
        "workflow_path": workflow_path,
        "run_id": run_id,
        "run_number": snapshot.get("run_number"),
        "run_attempt": snapshot.get("run_attempt"),
        "head_sha": head_sha,
        "head_branch": snapshot.get("head_branch"),
        "event": snapshot.get("event"),
        "status": status,
        "conclusion": conclusion,
        "created_at": snapshot.get("created_at"),
        "updated_at": snapshot.get("updated_at"),
        "html_url": snapshot.get("html_url"),
        "jobs": jobs,
        "logs_sha256": snapshot.get("logs_sha256"),
        "test_count": snapshot.get("test_count"),
        "failure_count": snapshot.get("failure_count"),
        "error_count": snapshot.get("error_count"),
    }

    if run_id is None:
        return CIEvidenceDecision(False, False, "REJECTED", "MISSING_RUN_ID", evidence)
    if not head_sha:
        return CIEvidenceDecision(False, False, "REJECTED", "MISSING_HEAD_SHA", evidence)
    if status != "completed":
        return CIEvidenceDecision(False, False, "PENDING", "RUN_NOT_COMPLETED", evidence)

    # Completed non-success executions are retained as objective negative evidence.
    if conclusion != "success":
        return CIEvidenceDecision(True, False, "FAILURE_EVIDENCE", "COMPLETED_NON_SUCCESS", evidence)

    if workflow_path != EXPECTED_WORKFLOW_PATH:
        return CIEvidenceDecision(False, False, "REJECTED", "WRONG_WORKFLOW", evidence)
    if head_sha != target_sha:
        return CIEvidenceDecision(True, False, "HISTORICAL_SUCCESS", "HEAD_SHA_MISMATCH", evidence)

    complete, successful, missing = _required_step_status(jobs)
    if not complete:
        evidence["missing_required_steps"] = missing
        return CIEvidenceDecision(False, False, "REJECTED", "MISSING_REQUIRED_STEP", evidence)
    if not successful:
        return CIEvidenceDecision(False, False, "REJECTED", "REQUIRED_STEP_FAILED", evidence)

    return CIEvidenceDecision(True, True, "PASS_EVIDENCE", "CERTIFIED", evidence)
