# Hoot Router Execution Evidence

- **Date:** 2026-08-16
- **Agent:** Hoot
- **Objective:** Convert the persisted Hoot router tests from unexecuted test intent into actual runtime evidence before granting any executor capability.
- **Selected task:** Execute a reconstructed copy of the exact persisted `src/nexus/hoot_router.py` behavior and the 14 persisted `tests/test_hoot_router.py` cases in an isolated temporary Python package using the standard-library unittest runner.

## Success criteria

1. Inspect the persisted router and test fixture from Nexus `main` before execution.
2. Execute the router behavior against all 14 persisted behavioral test cases.
3. Require process exit code 0 and zero unittest failures/errors.
4. Record any execution-environment anomaly rather than hiding it.
5. Do not interpret this run as proof of the full repository/runtime or as an autonomy promotion.

## Evidence

- Persisted router blob inspected from `main`: `604df47d950f773c9b59cbed8847e72951a767c7`.
- Persisted test fixture blob inspected from `main`: `4046503bc6171fb591ecdf74dc5bcc14e62094ba`.
- Test command semantics: `python -m unittest tests.test_hoot_router -v` in an isolated temporary package reconstructed from the inspected persisted source.
- Process exit code: `0`.
- unittest result: `Ran 14 tests in 0.002s` / `OK`.
- Failures: `0`.
- Errors: `0`.
- The determinism test internally repeated identical routing inputs 25 times and passed.
- Environment anomaly: Python startup emitted an unrelated `artifact_tool` spreadsheet-runtime warmup timeout traceback. It did not alter the unittest exit code or test outcome. This is recorded as environmental noise, not silently omitted.

## Result

**PASS** for the bounded router behavioral execution task.

This evidence supports that the inspected router logic satisfies the persisted 14-case behavioral fixture when reconstructed and executed in isolation. It does **not** prove that a fresh checkout of the entire Nexus repository installs/imports/runs cleanly, because this run did not execute inside a repository checkout.

## Failure mode

None for the bounded task. Repository-checkout execution remains unverified.

## Lesson

Executable evidence can be obtained without inflating its scope. A passing isolated reconstruction is stronger than unexecuted tests but weaker than a clean-checkout repository run; Hoot must preserve that distinction.

## Next priority

Implement the smallest sandbox-only reversible executor behind the existing router, with path confinement and rollback tests, while keeping Hoot at L1 and requiring router `ALLOW` before any mutation.

## Estimated value

**HIGH** — this closes the largest evidence gap around the authorization router and provides measured behavior before execution authority expands.

## Human action required

None.
