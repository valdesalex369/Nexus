# Hoot Sandbox Executor Runtime Verification Gate

Status: Active
Date: 2026-08-16

## Purpose

Hoot's sandbox executor and its adversarial unittest fixture are persisted on `main`, but persisted test code is not runtime evidence. This gate prevents Hoot from treating the executor as trusted merely because the implementation and tests look correct under inspection.

## Required command

Run from a clean Nexus checkout at the commit under evaluation:

```bash
python -m unittest tests.test_hoot_sandbox -v
```

## Required evidence

A runtime-verification record must capture:

- exact Nexus commit SHA tested;
- execution source/environment;
- UTC timestamp;
- command executed;
- process exit code;
- number of tests run;
- failures;
- errors;
- skips;
- full or inspectable unittest output;
- any environment anomaly that could affect interpretation.

## Promotion rule

The sandbox executor is runtime-verified only if:

1. exit code is `0`;
2. all persisted sandbox tests execute;
3. failures = `0`;
4. errors = `0`;
5. no test is silently omitted;
6. the tested source corresponds to the recorded commit SHA.

Until those conditions are met:

- Hoot remains L1;
- no additional mutation primitive should be added;
- the executor must be described as implemented/test-specified, not runtime-verified;
- a later cycle should prefer obtaining execution evidence over expanding capability.

## Required adversarial coverage

The current fixture is expected to prove at minimum:

- a denied router decision cannot mutate;
- mission mismatch cannot mutate;
- agent mismatch cannot mutate;
- missing capability cannot mutate;
- `..` path traversal is rejected;
- absolute-path escape is rejected;
- successful writes are read back and SHA-256 recorded;
- overwrite rollback restores exact prior bytes;
- new-file rollback deletes the created artifact;
- non-file targets are rejected;
- rollback under a different sandbox root is rejected.

## Failure handling

If the runtime test fails, do not add execution capability. Record the exact demonstrated failure and repair only that failure or the smallest root cause that explains it. Re-run the same gate after the implementation changes.

## Next milestone after a clean run

Only after this gate passes should Hoot execute one end-to-end reversible mission:

`route -> sandbox write -> verify digest -> rollback -> verify exact restoration`

That mission must itself produce evidence before any broader executor capability is considered.