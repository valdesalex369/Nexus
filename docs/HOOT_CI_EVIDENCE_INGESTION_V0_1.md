# Hoot CI Evidence Ingestion Contract v0.1

Status: Active implementation target
Date: 2026-08-17

## Objective

Convert a completed GitHub Actions Hoot CI run into provenance-bearing machine-readable evidence without letting Hoot reinterpret logs into a more favorable result.

## Source-of-truth fields

A CI observation must preserve directly reported GitHub fields:

```yaml
provider: github_actions
repository: owner/name
workflow_name: string
workflow_path: string
run_id: integer
run_number: integer
run_attempt: integer
head_sha: string
head_branch: string
event: string
status: string
conclusion: string | null
created_at: ISO-8601
updated_at: ISO-8601
html_url: string
jobs:
  - job_id: integer
    name: string
    status: string
    conclusion: string | null
    steps:
      - name: string
        status: string
        conclusion: string | null
logs_sha256: string | null
```

Unknown fields remain null. Hoot must not infer missing test counts, costs, durations, or conclusions.

## Acceptance rules

A workflow run may be ingested as objective PASS evidence only when all of the following are true:

1. `status == completed`.
2. `conclusion == success`.
3. The run's `head_sha` exactly matches the commit being evaluated.
4. The expected workflow path is `.github/workflows/hoot-ci.yml`.
5. All required test steps are present and successful.
6. The observation includes the GitHub run ID and immutable commit SHA.
7. Any test counts quoted in the cycle event are directly recoverable from job logs; otherwise counts remain unknown.

A completed non-success run must be ingested as failure evidence, not omitted.

A run for a different commit may be useful historical evidence but must never certify the current commit.

## Required test steps for v0.1

- compile source/tests
- router tests
- sandbox tests
- ledger tests
- evaluator tests
- full unittest discovery

Step names may differ cosmetically, but the executed commands and conclusions must be inspectable.

## Integrity rules

- Never store a mutable branch name as the sole provenance identifier; always include `head_sha`.
- Never convert `queued` or `in_progress` into PASS/FAIL.
- Never treat missing workflow data as success.
- Preserve failed/cancelled/timed-out runs when they are relevant to the evaluated commit.
- Do not let a later successful retry erase the existence of an earlier failed attempt; distinguish `run_attempt`.
- If logs are captured as an artifact, hash the exact bytes with SHA-256 before referencing them from the ledger.
- CI evidence does not itself prove business value or justify autonomy promotion; it proves the tested behavior for the identified commit/environment.

## Current bootstrap evidence

The first observed Hoot CI run is GitHub Actions run `32051928548` for commit `aa0f94209ec91582b43eabafa4d749f80da55987`. GitHub reports the run as `completed` with conclusion `success`, workflow `Hoot CI`, path `.github/workflows/hoot-ci.yml`, run attempt `1`, and event `push`.

This record is a bootstrap example only. The ingestion implementation must query GitHub rather than hard-code this run.

## Definition of done for implementation

The next implementation should expose a deterministic function that accepts a GitHub Actions run/job/step snapshot and returns either:

- a normalized CI evidence object, or
- a stable rejection reason explaining why the snapshot cannot certify the target commit.

It must be provider-free to unit test: GitHub fetching and evidence normalization stay separate.

Minimum adversarial tests:

1. completed success for matching SHA accepted;
2. success for wrong SHA rejected for certification;
3. in-progress run rejected;
4. failed run preserved as failure evidence;
5. cancelled run preserved as non-success evidence;
6. missing required test step rejected;
7. failed required step rejected;
8. missing run ID rejected;
9. missing head SHA rejected;
10. retry attempts remain distinguishable;
11. unknown test count remains null;
12. deterministic repeated normalization.

## Training lesson

External execution evidence is only useful if provenance survives ingestion. Hoot must consume CI as an external judge, not rewrite CI into a story about itself.