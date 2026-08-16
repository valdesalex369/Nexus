# Hoot Genesis Ledger Integrity Audit

- **Agent:** Hoot
- **Date:** 2026-08-16
- **Objective:** Independently verify the first machine-readable Hoot ledger event against the persisted ledger implementation before migrating more history.
- **Selected task:** Recompute the genesis event hash using the exact canonicalization and SHA-256 algorithm implemented in `src/nexus/hoot_ledger.py` and compare it with `data/hoot/cycles.jsonl`.
- **Selection reason:** The prior cycle explicitly made independent genesis verification the next priority. Reliability scoring or further migration would be unsafe if the first event does not verify.

## Success criteria

1. Fetch the current machine-readable genesis event from `data/hoot/cycles.jsonl`.
2. Fetch the current ledger implementation from `src/nexus/hoot_ledger.py`.
3. Recompute the event hash using `SHA256(previous_hash + "\n" + canonical_json(event))`, where canonical JSON uses sorted keys and separators `(',', ':')` with UTF-8 encoding.
4. Compare the recomputed hash to the persisted `event_hash`.
5. If they differ, classify the cycle as FAIL/VERIFICATION_FAILED and do not migrate additional history or begin reliability scoring.

## Evidence

- Persisted `previous_hash`: `0000000000000000000000000000000000000000000000000000000000000000`.
- Persisted `event_hash`: `28189d481759a03797f069df6df0130b958f54b731ed18db6a0fcfdfc7caab8`.
- Independently recomputed hash using the persisted implementation's algorithm: `8d106a7649b204b226bb060735827200eb948f9ce025966b021bae72cd0bfb24`.
- Comparison result: **MISMATCH**.

## Result

**FAIL**

The first machine-readable event does not verify against the currently persisted ledger hashing algorithm. The ledger file must therefore be treated as integrity-invalid until corrected through an explicit provenance-preserving repair/migration procedure.

## Failure mode

`VERIFICATION_FAILED`

## Lesson

Never trust a hand-constructed hash-chained record merely because its envelope looks correct. The first persisted event must pass the same verifier used for every later append before it becomes reliability evidence.

## Next priority

Repair the genesis machine-readable ledger without erasing provenance: preserve this failed audit, reconstruct the genesis event through the actual `append_event` implementation or an equivalent deterministic procedure, verify the resulting chain, and only then migrate another historical cycle.

## Estimated value

**HIGH** — this caught a foundational integrity defect before additional history or reliability scores were built on top of it.

## Human action required

None.
