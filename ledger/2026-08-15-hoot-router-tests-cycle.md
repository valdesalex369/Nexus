# Hoot Router Test Fixture Cycle

- **Agent:** Hoot
- **Date:** 2026-08-15
- **Objective:** Add a provider-free behavioral test fixture for the deterministic Hoot L1 authorization router without expanding autonomy.
- **Selected task:** Create `tests/test_hoot_router.py` covering ALLOW, denial boundaries, denial ordering, human gates, evidence requirements, unknown-cost neutrality, and repeated-input determinism.
- **Selection reason:** The router existed but had not yet acquired a persisted adversarial test fixture. Testing the authorization boundary is higher value than adding execution capability before the gate is exercised.

## Success criteria

1. Inspect the current router, mission schema, and agent contract before writing tests.
2. Persist a standard-library-only test fixture on `main`.
3. Cover clean ALLOW plus schema, identity, authority, capability, step/tool/recursion/cost, human-gate, and evidence denials.
4. Test equality at budget boundaries and denial immediately above them.
5. Test that unknown cost remains neutral.
6. Test stable multi-denial priority.
7. Test repeated-input determinism.
8. Fetch the persisted test file back from `main` after the write.
9. Do not claim that the suite executed when no runtime test runner is available in this automation environment.

## Evidence

- Current router inspected at `src/nexus/hoot_router.py`; it is side-effect free and returns deterministic ALLOW/DENY reason codes.
- Current Hoot contract inspected at `schemas/hoot_agent_contract_v0.1.json`; it fixes Hoot at L1 / REVERSIBLE_INTERNAL with bounded limits and human gates.
- Current mission schema inspected at `schemas/hoot_mission_v0.1.json`; it restricts requested capabilities and bounded mission limits.
- `tests/test_hoot_router.py` persisted in commit `25a9cfa0fa9f13ce48347333006c50cc8c080cf6` and was fetched back from `main` after creation.
- The fixture contains 14 behavioral test methods and a 25-repeat determinism check.

## Result

**PASS** for the bounded task of creating and verifying the persisted test fixture.

The tests were **not executed** in this environment, so this cycle is not evidence that the router implementation itself passes the suite and does not justify an autonomy promotion.

## Failure mode

None for artifact creation. Runtime test execution remains unavailable in the current tool surface.

## Lesson

Authorization code should accumulate adversarial tests before execution capability. Persisted test intent and executed test evidence are different epistemic states and must never be conflated.

## Next priority

Execute `python -m unittest tests.test_hoot_router -v` in an environment with the Nexus checkout. If it passes, record exact output and then implement the smallest sandbox-only reversible executor; if it fails, repair the router before adding execution capability.

## Estimated value

**HIGH** — the fixture turns Hoot's authorization policy into falsifiable behavioral expectations while preserving the current autonomy boundary.

## Human action required

None.
