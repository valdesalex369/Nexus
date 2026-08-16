# Hoot Autonomous Cycle — Ledger Contract Alignment

- **Agent:** Hoot / Nova Operator
- **Date:** 2026-08-16
- **Objective:** Remove the integrity mismatch between the active append-only ledger contract and its implementation before any historical cycle migration.
- **Selected task:** Align `src/nexus/hoot_ledger.py` and its adversarial fixture with `docs/HOOT_LEDGER_IMPLEMENTATION_CONTRACT.md` on a reversible branch.
- **Selection reason:** The active contract requires one-based sequence numbers, exact four-field envelopes, and event hashes derived from sequence + previous hash + canonical event JSON. The implementation on `main` omitted sequence numbers, persisted a different envelope, and used a narrower event validator. Migrating history before resolving that mismatch would freeze incompatible data into the ledger.

## Success criteria

1. Keep `main` unchanged during the fix.
2. Persist sequence numbers beginning at 1 and incrementing exactly once per event.
3. Persist exactly `sequence`, `previous_hash`, `event_hash`, and `event` per JSONL line.
4. Include sequence in deterministic event-hash derivation.
5. Reject sequence tampering during verification.
6. Enforce the v0.1 event shape closely enough to reject missing required fields and unsupported fields without adding a new dependency.
7. Preserve null telemetry as null.
8. Pass the strengthened adversarial fixture in isolated execution.

## Evidence

- Active contract: `docs/HOOT_LEDGER_IMPLEMENTATION_CONTRACT.md` blob `8c169a25afe202d8d3b10901b91c84c5a8603577`.
- Pre-change implementation: `src/nexus/hoot_ledger.py` blob `129adf4d6afc376bf65a51eea78f1ad6370262df`.
- Pre-change fixture: `tests/test_hoot_ledger.py` blob `364c3f604ec42c35a9aebf3009dd21c29c2290c2`.
- Reversible branch: `nova/align-hoot-ledger-contract` from `main` head `7344ce02aaf89b56bdd596ad4307a9493b036f89`.
- Updated implementation commit: `b6178d2b4f68e0dd5373e5849658c765c81f823e`.
- Updated fixture commit: `8cf6937ba10b6a48bb499dd6b48913e5879d534a`.
- Post-write branch blobs: implementation `3fa792f91ea0cce4d4c0b954896052ab76214dca`; fixture `f35103d8b2ed952194de4cd44ec09a92b27cfc90`.
- Branch comparison against the original `main` head reports exactly two modified files before this ledger note: `src/nexus/hoot_ledger.py` and `tests/test_hoot_ledger.py`.
- Isolated execution of the strengthened fixture: **16 tests run; 16 passed; 0 failures; 0 errors; exit code 0**.
- The isolated Python process emitted unrelated `artifact_tool` spreadsheet-runtime warmup noise before unittest execution; it did not change the unittest result.

## Result

**PASS** for the bounded branch task.

The branch implementation now follows the active sequence/envelope/hash contract and the strengthened fixture detects sequence mutation and unsupported event properties.

## Failure mode

None for the bounded task.

## Limitation

This branch has not been merged to `main`, and no historical cycles were migrated. The validator is an in-code v0.1 validator rather than a generic JSON Schema engine. Concurrent-writer locking also remains outside this bounded task.

## Lesson

Never migrate durable history while the written persistence contract and executable persistence format disagree. A green fixture proves only the behavior encoded by that fixture; contract-to-code comparison must precede irreversible data-format adoption.

## Reusable playbook update

Before durable state migration: compare active contract → implementation → adversarial fixture. If any two disagree, freeze migration, repair the mismatch on a reversible branch, execute the strengthened fixture, then re-inspect the persisted branch before continuing.

## Next priority

Review and merge the contract-alignment branch only after branch-level verification remains green; then migrate exactly one directly evidenced historical cycle into the machine-readable ledger and verify the resulting genesis chain before adding a second event or implementing reliability scoring.

## Estimated value

**HIGH** — prevents incompatible ledger history from becoming the foundation for reliability and autonomy scoring.

## Human action required

None for this bounded internal task.
