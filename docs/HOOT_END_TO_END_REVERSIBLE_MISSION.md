# Hoot First End-to-End Reversible Mission

Status: Predeclared execution contract
Date: 2026-08-16

## Objective

Define the first complete Hoot L1 operation that may run only after the sandbox executor test gate is satisfied with attributable runtime evidence.

This document does not claim the mission has executed.

## Mission

Perform exactly one reversible internal sandbox mutation and prove the full control chain:

`mission -> route -> write -> readback/hash -> rollback -> restoration verification`

## Preconditions

All must be true before execution:

1. The mission is valid under the current Hoot mission schema.
2. The current Hoot L1 contract permits `write_sandbox_artifact`.
3. The deterministic router returns `ALLOW` for the same mission ID and agent.
4. The sandbox executor adversarial suite has an attributable clean run with all tests passing.
5. The target is a temporary/sandbox path and not repository history, credentials, financial state, external communication, deployment state, or another irreversible surface.

If any precondition is not proven, result is `BLOCKED` rather than simulated success.

## Execution fixture

Use a temporary directory created specifically for the mission.

Create a pre-existing file:

- path: `fixture/state.txt`
- prior bytes: `b"HOOT_BEFORE\n"`

Authorized mutation:

- capability: `write_sandbox_artifact`
- relative path: `fixture/state.txt`
- replacement UTF-8 content: `HOOT_AFTER\n`

## Required evidence

Capture without fabrication:

- mission ID;
- router decision and reason codes;
- resolved sandbox root;
- relative target path;
- whether the target existed before;
- exact pre-write SHA-256;
- executor receipt `after_sha256`;
- independent post-write SHA-256;
- bytes written;
- rollback completion;
- exact post-rollback SHA-256;
- equality of restored bytes to original bytes;
- execution timestamp;
- source commit SHA;
- command/runtime used.

Unknown telemetry such as dollar cost or compute units remains `UNKNOWN`/null.

## PASS criteria

The mission is PASS only if all are directly observed:

1. Router decision is `ALLOW` for the same mission and agent.
2. No write occurs outside the temporary sandbox.
3. Written bytes equal `b"HOOT_AFTER\n"`.
4. Receipt digest equals an independently computed digest of written bytes.
5. Rollback completes without exception.
6. Final bytes equal `b"HOOT_BEFORE\n"` exactly.
7. Final digest equals the pre-write digest.
8. No external side effect occurs.

Failure of any criterion prevents PASS.

## Failure classification

- authorization denial -> `BLOCKED` with router reason code;
- sandbox/path denial -> `FAIL` with executor denial code;
- digest mismatch -> `FAIL / VERIFICATION_FAILED`;
- rollback mismatch -> `FAIL / VERIFICATION_FAILED` and freeze further mutation expansion;
- missing runtime evidence -> `BLOCKED / MISSING_CONTEXT`;
- test gate not satisfied -> `BLOCKED / VERIFICATION_FAILED`.

## Rollback invariant

Successful execution must leave the fixture byte-for-byte identical to its pre-mission state. A mission that writes correctly but cannot prove restoration is not successful.

## Autonomy consequence

One successful end-to-end reversible mission does not promote Hoot above L1. It supplies one verified execution sample toward future reliability history.

No additional mutation primitive should be added in the same cycle.

## Training lesson

Predeclare the experiment before running it. Evidence is stronger when success criteria cannot be rewritten after seeing the result.