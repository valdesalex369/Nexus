# Hoot Autonomous Cycle — Deterministic Router Boundary

- **Agent:** Hoot
- **Date:** 2026-08-15
- **Objective:** Convert the existing mission schema, L1 agent contract, and denial-code specification into the first machine-enforced authorization decision boundary.
- **Selected task:** Implement a side-effect-free deterministic Hoot mission router that returns `ALLOW` or stable denial codes without executing the mission.
- **Selection reason:** This was the recorded next priority and is the smallest implementation that turns Hoot's authority rules from documentation into executable logic.

## Success criteria

1. Inspect current mission schema, agent contract, and denial-code specification before implementation.
2. Persist a router on `main` that performs no mission side effects.
3. Enforce agent, authority, capability, step, tool, recursion, known-cost, human-gate, and evidence boundaries.
4. Preserve stable denial ordering from the documented contract.
5. Explicitly preserve unknown cost rather than treating it as free or as failure.
6. Fetch the persisted implementation back from GitHub as verification.
7. Do not cross a human gate.

## Evidence

- `schemas/hoot_mission_v0.1.json` inspected on `main`; it defines Hoot missions, `REVERSIBLE_INTERNAL` authority, bounded limits, and nullable cost/compute telemetry.
- `schemas/hoot_agent_contract_v0.1.json` inspected on `main`; it fixes Hoot at L1, defines allowed capabilities, human gates, budgets, verification, and logging rules.
- `docs/HOOT_CONTRACT_DENIAL_CODES.md` inspected on `main`; it defines deterministic denial precedence and the invariant that ALLOW is permission to enter bounded execution, not evidence of success.
- `src/nexus/hoot_router.py` created in commit `6411b3b361930314a2dc6cb53224216386a4015c` and fetched back successfully from `main`.
- The implementation is side-effect free and accepts explicit `schema_valid`, `human_gate_required`, and `evidence_possible` inputs rather than guessing about those states.

## Result

**PASS** for this bounded implementation task.

Important limitation: no executable test runner was available through the connected GitHub surface in this cycle, so this PASS verifies artifact persistence and inspection against the predeclared contract, not runtime execution of unit tests. The next cycle should add deterministic fixtures/tests before this router is trusted as a runtime gate.

## Failure mode

None for the bounded artifact task. Runtime test evidence remains pending.

## Lesson

Authorization logic should be pure before it is powerful. Separating decision from execution makes denial behavior deterministic, testable, and much harder to bypass accidentally.

## Next priority

Add a small provider-free test fixture suite for `route_hoot_mission` covering clean ALLOW, schema invalidity, capability denial, each budget boundary, proper human-gate denial, evidence denial, unknown-cost neutrality, and deterministic repeated results.

## Estimated value

**HIGH** — this is Hoot's first executable authorization boundary, although it must still earn runtime trust through tests.

## Human action required

None.
