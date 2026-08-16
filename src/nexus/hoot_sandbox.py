"""Sandbox-only reversible executor for Hoot L1.

This executor intentionally supports one mutation: writing a UTF-8 artifact
inside an explicitly supplied sandbox root. It requires a prior router ALLOW,
rejects path escape attempts, records before/after state, hashes written bytes,
and can roll the mutation back to the exact pre-execution state.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any, Mapping


class SandboxExecutionError(RuntimeError):
    """Raised when bounded sandbox execution cannot proceed safely."""


@dataclass(frozen=True)
class ExecutionReceipt:
    mission_id: str | None
    relative_path: str
    absolute_path: str
    existed_before: bool
    before_bytes: bytes | None
    after_sha256: str
    bytes_written: int


def _confined_path(root: Path, relative_path: str) -> Path:
    root = root.resolve()
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise SandboxExecutionError("DENY_PATH_ESCAPE") from exc
    if candidate == root:
        raise SandboxExecutionError("DENY_INVALID_TARGET")
    return candidate


def execute_sandbox_write(
    mission: Mapping[str, Any],
    route_result: Mapping[str, Any],
    *,
    sandbox_root: str | Path,
    relative_path: str,
    content: str,
) -> ExecutionReceipt:
    """Write one UTF-8 artifact after deterministic authorization.

    This function does not infer authorization. The caller must provide the
    router result produced for the same mission. No write occurs unless the
    decision is ALLOW and the mission requests `write_sandbox_artifact`.
    """

    if route_result.get("decision") != "ALLOW":
        raise SandboxExecutionError("DENY_ROUTER_DECISION")
    if route_result.get("mission_id") != mission.get("mission_id"):
        raise SandboxExecutionError("DENY_ROUTE_MISSION_MISMATCH")
    if route_result.get("agent") != mission.get("agent"):
        raise SandboxExecutionError("DENY_ROUTE_AGENT_MISMATCH")
    if "write_sandbox_artifact" not in mission.get("requested_capabilities", []):
        raise SandboxExecutionError("DENY_CAPABILITY")

    root = Path(sandbox_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    target = _confined_path(root, relative_path)

    existed_before = target.exists()
    if existed_before and not target.is_file():
        raise SandboxExecutionError("DENY_NON_FILE_TARGET")
    before_bytes = target.read_bytes() if existed_before else None

    payload = content.encode("utf-8")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)

    written = target.read_bytes()
    if written != payload:
        rollback_sandbox_write(
            ExecutionReceipt(
                mission_id=mission.get("mission_id"),
                relative_path=relative_path,
                absolute_path=str(target),
                existed_before=existed_before,
                before_bytes=before_bytes,
                after_sha256=sha256(written).hexdigest(),
                bytes_written=len(written),
            ),
            sandbox_root=root,
        )
        raise SandboxExecutionError("VERIFY_WRITE_MISMATCH")

    return ExecutionReceipt(
        mission_id=mission.get("mission_id"),
        relative_path=relative_path,
        absolute_path=str(target),
        existed_before=existed_before,
        before_bytes=before_bytes,
        after_sha256=sha256(written).hexdigest(),
        bytes_written=len(written),
    )


def rollback_sandbox_write(
    receipt: ExecutionReceipt,
    *,
    sandbox_root: str | Path,
) -> None:
    """Restore the exact pre-write file state represented by a receipt."""

    root = Path(sandbox_root).resolve()
    target = _confined_path(root, receipt.relative_path)
    if str(target) != receipt.absolute_path:
        raise SandboxExecutionError("DENY_RECEIPT_PATH_MISMATCH")

    if receipt.existed_before:
        if receipt.before_bytes is None:
            raise SandboxExecutionError("DENY_INVALID_RECEIPT")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(receipt.before_bytes)
    elif target.exists():
        if not target.is_file():
            raise SandboxExecutionError("DENY_NON_FILE_TARGET")
        target.unlink()
