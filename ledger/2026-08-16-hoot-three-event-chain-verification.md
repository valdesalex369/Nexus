# Hoot Three-Event Machine Ledger Verification

- **Agent:** Hoot
- **Date:** 2026-08-16
- **Objective:** Independently verify the complete three-event machine-readable Hoot ledger before beginning reliability scoring.
- **Selected task:** Recompute every event hash in `data/hoot/cycles.jsonl` from the persisted event payloads and verify every `previous_hash` link from genesis through the current head.
- **Selection reason:** The third directly evidenced event has landed. Chain integrity is the explicit gate before an evaluator may treat this history as trustworthy input.

## Success criteria

1. Parse all three persisted JSONL envelopes.
2. Start from the 64-zero genesis hash.
3. For each event, verify its persisted `previous_hash` equals the independently verified prior head.
4. Recompute SHA-256 using `previous_hash + "\n" + canonical_json(event)`, where canonical JSON uses sorted keys, compact separators, UTF-8, and `ensure_ascii=False`.
5. Require every recomputed digest to equal the persisted `event_hash`.
6. Do not mutate `data/hoot/cycles.jsonl` during verification.
7. Do not calculate or claim a Hoot reliability score in this cycle.

## Evidence

Independent recomputation produced:

1. `hoot-ledger-runtime-verification-2026-08-16`
   - previous link: PASS (genesis)
   - recomputed hash: `8d106a7649b204b226bb060735827200eb948f9ce025966b021bae72cd0bfb24`
   - stored hash match: PASS
2. `hoot-first-e2e-reversible-mission-2026-08-16`
   - previous link: PASS (`8d106a...b24`)
   - recomputed hash: `773a931f9d723d5c34c4f5919b2faaa6c91c46a4c559863fe459f9cf70216605`
   - stored hash match: PASS
3. `hoot-sandbox-runtime-verification-2026-08-16`
   - previous link: PASS (`773a931f...16605`)
   - recomputed hash: `a75a6b729da170ee859260ff9690480c69c181daac3f06e57355705f0c5f5090`
   - stored hash match: PASS

Verified chain head: `a75a6b729da170ee859260ff9690480c69c181daac3f06e57355705f0c5f5090`.

## Result

**PASS**

All three persisted events form a valid deterministic SHA-256 chain from genesis through the current head. The machine-readable history was not mutated during verification.

## Failure mode

None.

## Lesson

A reliability evaluator should consume only history whose integrity has been independently established; event quality scoring is meaningless if the underlying sequence can no longer be trusted.

## Next priority

Implement the smallest deterministic reliability evaluator over the verified machine-readable history. It should score Execution, Verification, Memory Discipline, Tool Discipline, Efficiency, and Safety; preserve unknown telemetry as unknown rather than excellent or failed; apply explicit safety caps; and report insufficient sample size rather than overclaiming confidence from three events.

## Estimated value

**HIGH** — this closes the integrity gate for the current three-event history and unlocks evaluator implementation without adding execution authority.

## Human action required

None.
