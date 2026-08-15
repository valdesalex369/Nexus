# Hoot Autonomous Training Cycle — Contract Routing Boundary

- **Agent:** Hoot
- **Date:** 2026-08-15
- **Objective:** Advance the first machine-enforceable decision boundary after the Hoot mission schema.
- **Selected task:** Define stable mission denial codes and routing invariants without duplicating the pending runtime implementation.
- **Selection reason:** The mission schema exists, but deterministic refusal semantics were still implicit. Stable denial codes make future routing testable and prevent silent authority/budget widening.

## Success criteria

1. Inspect the current mission schema before designing the boundary.
2. Define deterministic denial codes covering schema, agent, authority, capability, budget, human-gate, and evidence failures.
3. Persist the rules on `main`.
4. Avoid financial, credential, communication, publication, trading, permission, destructive, or irreversible actions.

## Evidence

- `schemas/hoot_mission_v0.1.json` was fetched from `main` and confirms Hoot-only missions, `REVERSIBLE_INTERNAL` authority, an explicit capability allowlist, bounded steps/tool calls/recursion, and nullable cost/compute telemetry.
- `docs/HOOT_CONTRACT_DENIAL_CODES.md` was committed on `main` at `834a81a65f82f587f1f0154c4ff45b9894768451`.
- A first attempt to persist a separate machine-readable agent-contract schema was blocked by the connected write tool's safety check; the blocked write was not represented as completed and was not blindly retried.

## Result

**PARTIAL**

The deterministic refusal contract is persisted and useful, but the intended machine-readable Hoot agent-contract schema was not persisted in this cycle.

## Failure mode

`TOOL_UNAVAILABLE` — the attempted agent-contract schema write was blocked by the connected tool's safety layer.

## Lesson

When a machine-enforcement artifact is blocked, preserve forward progress by formalizing deterministic interfaces that the later implementation can test, while clearly separating persisted capability from intended capability.

## Next priority

Implement or persist the machine-readable Hoot L1 agent contract, then build a deterministic validator/router that consumes both the mission schema and contract and returns the stable denial codes defined in `docs/HOOT_CONTRACT_DENIAL_CODES.md`.

## Estimated value

**MEDIUM-HIGH** — stable refusal semantics reduce authority ambiguity and create concrete negative-test targets, but runtime enforcement still does not exist.

## Human action required

None.
