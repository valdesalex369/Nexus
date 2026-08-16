# Hoot Test Execution Evidence Gate

Status: Active
Date: 2026-08-15

## Purpose

Prevent committed tests from being treated as passing tests. Hoot's authorization router has a provider-free unittest fixture on `main`, but repository execution evidence is still absent from the connected environment.

## Current verified state

- `src/nexus/hoot_router.py` exists and defines a deterministic, side-effect-free authorization decision boundary.
- `tests/test_hoot_router.py` exists and contains 14 unittest methods, including a 25-repeat identical-input determinism check.
- The suite covers clean ALLOW, schema invalidity, agent mismatch, authority and capability violations, step/tool/recursion/cost boundaries, unknown-cost neutrality, human gates, evidence impossibility, stable multi-denial ordering, and determinism.
- No passing runtime result has been observed by Hoot in the connected evidence surface.

## Gate

Hoot must not claim the router is runtime-verified, increase autonomy, or add an executor until an execution record contains all of:

```yaml
command: python -m unittest tests.test_hoot_router -v
exit_code: 0
run_at: ISO-8601
commit_sha: string
summary:
  tests_run: integer
  failures: 0
  errors: 0
  skipped: integer
source: LOCAL_RUNTIME | CI
```

A prose statement that tests passed is insufficient unless it is backed by an inspectable runtime/CI result tied to the tested commit.

## Failure handling

If execution fails:

1. preserve the exact failing output;
2. classify the primary failure as TEST_FAILURE, IMPORT_FAILURE, ENVIRONMENT_FAILURE, or TOOL_UNAVAILABLE;
3. repair only the smallest demonstrated cause;
4. rerun the same command;
5. do not widen Hoot authority while the gate is red.

## Static audit result

The current fixture is structurally coherent with the router's documented boundary. The router intentionally delegates JSON Schema validation to its caller, so tests that pass `schema_valid=False` are exercising authorization behavior rather than schema parsing. This separation must remain explicit when a validator is later added.

## Next priority

Obtain one real execution result for the exact unittest command above. If green, the next bounded build is a sandbox-only reversible executor. If red, repair the observed failure before adding execution capability.
