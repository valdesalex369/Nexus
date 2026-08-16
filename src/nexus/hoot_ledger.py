"""Deterministic append-only JSONL ledger for Hoot cycle events."""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

GENESIS_HASH = "0" * 64
LEDGER_VERSION = "0.1"


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


def _event_hash(previous_hash: str, event: dict[str, Any]) -> str:
    payload = previous_hash + "\n" + _canonical_json(event)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _validate_minimum_event(event: dict[str, Any]) -> None:
    required = {
        "cycle_id",
        "timestamp",
        "agent",
        "objective",
        "selected_task",
        "success_criteria",
        "actions",
        "evidence",
        "result",
        "lesson",
        "next_priority",
        "estimated_value",
    }
    missing = sorted(required - set(event))
    if missing:
        raise ValueError(f"event missing required fields: {', '.join(missing)}")
    if not isinstance(event["cycle_id"], str) or not event["cycle_id"].strip():
        raise ValueError("cycle_id must be a non-empty string")
    if event["result"] not in {"PASS", "PARTIAL", "BLOCKED", "FAIL"}:
        raise ValueError("invalid result")
    if event["estimated_value"] not in {"LOW", "MEDIUM", "HIGH"}:
        raise ValueError("invalid estimated_value")
    if event["result"] == "PASS":
        if not event.get("evidence"):
            raise ValueError("PASS requires evidence")
        if event.get("failure_mode") is not None:
            raise ValueError("PASS cannot carry failure_mode")
    elif not event.get("failure_mode"):
        raise ValueError("non-PASS result requires failure_mode")


def _decode_lines(lines: Iterable[str]) -> VerifiedLedger:
    events: list[dict[str, Any]] = []
    seen: set[str] = set()
    expected_previous = GENESIS_HASH

    for line_number, raw in enumerate(lines, start=1):
        if not raw.strip():
            raise LedgerCorruptionError(f"blank ledger line at {line_number}")
        try:
            envelope = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise LedgerCorruptionError(f"invalid JSON at line {line_number}") from exc
        if not isinstance(envelope, dict):
            raise LedgerCorruptionError(f"non-object envelope at line {line_number}")
        if envelope.get("ledger_version") != LEDGER_VERSION:
            raise LedgerCorruptionError(f"unsupported ledger version at line {line_number}")
        event = envelope.get("event")
        if not isinstance(event, dict):
            raise LedgerCorruptionError(f"missing event object at line {line_number}")
        try:
            _validate_minimum_event(event)
        except ValueError as exc:
            raise LedgerCorruptionError(f"invalid event at line {line_number}: {exc}") from exc
        cycle_id = event["cycle_id"]
        if cycle_id in seen:
            raise LedgerCorruptionError(f"duplicate cycle_id in history: {cycle_id}")
        if envelope.get("previous_hash") != expected_previous:
            raise LedgerCorruptionError(f"broken previous_hash at line {line_number}")
        calculated = _event_hash(expected_previous, event)
        if envelope.get("event_hash") != calculated:
            raise LedgerCorruptionError(f"hash mismatch at line {line_number}")
        seen.add(cycle_id)
        events.append(event)
        expected_previous = calculated

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
    _validate_minimum_event(event)
    ledger_path = Path(path)
    verified = verify_ledger(ledger_path)
    if any(existing["cycle_id"] == event["cycle_id"] for existing in verified.events):
        raise DuplicateCycleError(event["cycle_id"])

    event_copy = json.loads(_canonical_json(event))
    new_hash = _event_hash(verified.head_hash, event_copy)
    envelope = {
        "ledger_version": LEDGER_VERSION,
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
