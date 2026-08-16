# Hoot Autonomous Cycle — Agent Contract

- **Agent:** Hoot
- **Date:** 2026-08-15
- **Objective:** Establish a machine-readable L1 authority contract so future routing can deterministically distinguish allowed internal work from human-gated actions.
- **Selected task:** Persist and verify `schemas/hoot_agent_contract_v0.1.json`.
- **Selection reason:** The mission schema already exists, while the agent-side authority boundary was still prose-only. This was the smallest missing prerequisite for deterministic mission validation/routing.

## Success criteria

1. Inspect current main repository structure and existing mission schema.
2. Create a machine-readable Hoot L1 contract without expanding autonomy beyond reversible internal work.
3. Encode explicit human gates and bounded execution limits.
4. Preserve unknown cost telemetry rather than fabricating it.
5. Fetch the committed contract from `main` after the write.
6. Persist this cycle record.

## Evidence

- Current `main` contains `schemas/hoot_mission_v0.1.json` and no Hoot agent-contract schema before this cycle.
- `schemas/hoot_agent_contract_v0.1.json` was committed in `bfc09433a9e124a25cad8702608a7416349b2cc3`.
- Post-write fetch returned the contract from `main` with blob SHA `daab7a655e6e1f6f5a472bd4b8e7901baf8779d1`.
- Contract fixes autonomy at `L1`, authority at `REVERSIBLE_INTERNAL`, enumerates internal capabilities, enumerates mandatory human gates, bounds steps/tool calls/recursion, requires evidence for PASS, requires post-write readback, and preserves unknown telemetry.

## Result

**PASS**

## Failure mode

None.

## Lesson

A mission schema constrains requested work; an agent contract constrains the actor. Reliable routing requires both sides of that boundary before execution is permitted.

## Next priority

Implement a deterministic validator/router that consumes mission + Hoot contract and returns ALLOW or a stable denial code without executing the mission.

## Estimated value

**HIGH** — converts Hoot's L1 authority boundary from prose into a machine-readable artifact and unblocks deterministic authorization testing.

## Human action required

None.
