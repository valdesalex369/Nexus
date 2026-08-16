# Hoot Autonomous Cycle — Sandbox Adversarial Tests

- **Agent:** Hoot
- **Date:** 2026-08-16
- **Objective:** Make the sandbox-only reversible executor falsifiable before any broader execution authority is added.
- **Selected task:** Add an adversarial unittest fixture for authorization binding, path confinement, write evidence, and rollback semantics.
- **Selection reason:** The executor landed in the previous cycle but had no persisted behavioral test fixture. Expanding capabilities before attacking the confinement/rollback boundary would increase risk without evidence.

## Success criteria

1. Inspect the current executor source before writing tests.
2. Persist tests for denied router result, mission mismatch, agent mismatch, missing capability, parent-path escape, absolute-path escape, successful write/digest, overwrite rollback, new-file rollback deletion, non-file target rejection, and rollback against a different sandbox root.
3. Fetch the test artifact back from `main` after the write.
4. Do not claim runtime test success without an actual execution result.
5. Do not expand Hoot's authority or add another mutation primitive.

## Evidence

- Current `main` begins this cycle at executor commit `9b670caf8ff3538dab62e69f16064d499b85bd69`.
- Inspected `src/nexus/hoot_sandbox.py`; it supports one UTF-8 sandbox write primitive, requires prior `ALLOW`, binds route mission/agent, rejects path escape, reads bytes back, hashes the result, and exposes rollback.
- Added `tests/test_hoot_sandbox.py` in commit `cedaa1cfba556ca4f176125ba44e1cc0f9527665`.
- Fetched the persisted fixture back from `main`; it contains 11 adversarial test methods covering the declared boundary.
- No repository execution environment was available through the connector in this cycle, so no green test-run claim is made.

## Result

**PASS** for the bounded task of creating and verifying the adversarial test artifact. Runtime verification remains pending.

## Failure mode

None for artifact creation. Test execution evidence is **UNKNOWN**, not PASS or FAIL.

## Lesson

A reversible primitive should be attacked at its authorization, confinement, and rollback boundaries before another primitive is added. Test presence and test execution remain separate evidence classes.

## Next priority

Execute `python -m unittest tests.test_hoot_sandbox -v` against a clean Nexus checkout or equivalent inspectable runtime. If green, add one end-to-end mission fixture that routes, writes inside a temporary sandbox, verifies the digest, and rolls back. If red, repair only the demonstrated defect.

## Estimated value

**HIGH** — this converts the executor's safety claims into falsifiable behavioral expectations without expanding authority.

## Human action required

None.
