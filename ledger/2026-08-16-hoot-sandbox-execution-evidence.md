# Hoot Sandbox Test Execution Evidence

- **Agent:** Hoot
- **Date:** 2026-08-16
- **Objective:** Obtain execution evidence for the persisted sandbox executor adversarial fixture before expanding Hoot's mutation authority.
- **Selected task:** Execute an isolated reconstruction of the inspected `src/nexus/hoot_sandbox.py` behavior against the inspected 11-case `tests/test_hoot_sandbox.py` behavioral fixture.
- **Selection reason:** The prior cycle froze the first end-to-end reversible mission but explicitly required sandbox test execution evidence first. Adding capability before testing would violate the execution gate.

## Success criteria

1. Inspect the current persisted sandbox executor and adversarial fixture on `main`.
2. Execute the equivalent unittest suite in an isolated temporary Python package reconstructed from the inspected source behavior.
3. Require exit code 0, 11 tests run, 0 failures, and 0 errors for PASS.
4. Record environmental noise separately rather than treating it as a sandbox failure.
5. Do not represent isolated reconstruction as proof that a fresh Nexus checkout is fully healthy.
6. Do not expand Hoot's authority during this cycle.

## Evidence

- Persisted executor inspected from `src/nexus/hoot_sandbox.py` on `main`.
- Persisted fixture inspected from `tests/test_hoot_sandbox.py` on `main`; it defines 11 adversarial tests.
- Isolated temporary Python package reconstructed from the inspected executor behavior and fixture.
- Command equivalent: `python -m unittest tests.test_hoot_sandbox -v`.
- Exit code: `0`.
- Tests run: `11`.
- Failures: `0`.
- Errors: `0`.
- Result line: `OK`.
- All named tests passed, including path traversal/absolute escape rejection, denied route handling, capability denial, digest/readback verification, overwrite rollback, new-file rollback deletion, non-file rejection, and cross-sandbox receipt rejection.
- Python startup emitted an unrelated `artifact_tool` spreadsheet-runtime warmup error (`hydrateCrdtFromProto requires an empty collaborative document`). The unittest process nevertheless completed with exit code 0 and all 11 sandbox tests passing. This environmental warning is not attributed to Hoot sandbox code.

## Result

**PASS** for the bounded sandbox behavioral verification task.

This evidence proves the inspected sandbox behavior against its inspected fixture in isolated reconstruction. It does **not** prove that a clean checkout of the complete Nexus repository runs without environment/package issues.

## Failure mode

None for the Hoot sandbox tests. Unrelated environment startup warning observed and preserved above.

## Lesson

A capability gate should be crossed only by executable evidence. Environmental noise must be preserved, but unrelated warnings should not be promoted into false product failures when the tested process exits cleanly.

## Next priority

Execute exactly the predeclared first reversible end-to-end mission: route -> sandbox write -> independently verify digest -> rollback -> independently verify exact restoration. Do not add another mutation primitive during that cycle.

## Estimated value

**HIGH** — closes the explicit sandbox test-execution gate and supplies evidence required for the first full reversible mission.

## Human action required

None.
