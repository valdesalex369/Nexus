# Hoot Evidence Scope & Reconciliation

Status: Active training rule
Date: 2026-08-15

## Objective

Prevent Hoot from turning a true statement about one evidence surface into a false global conclusion.

A repository clone, hosted GitHub, a connected tool, a user-supplied file, and a runtime environment can each expose different slices of reality. Absence in one slice is not global absence.

## Observed training case

The Codex forensic audit in PR #3 correctly scoped itself to a local clone at commit `d0c24d0` and reported that the clone had no configured remote and could not authenticate `gh pr list`. It therefore classified hosted open-PR state as `UNKNOWN` from that environment.

A later connected GitHub inspection can directly observe hosted repository state and currently exposes open pull requests and additional hosted branches that the isolated clone could not see.

Neither observation should erase the other. They answer different scoped questions.

## Canonical evidence tuple

Every material repository-state claim should be representable as:

```yaml
claim: string
scope: LOCAL_CLONE | HOSTED_GITHUB | CONNECTED_SOURCE | RUNTIME | USER_SUPPLIED | GLOBAL
source: string
as_of: ISO-8601 | UNKNOWN
confidence: HIGH | MEDIUM | LOW
observation: string
```

A claim without scope is incomplete when multiple state surfaces can diverge.

## Reconciliation rules

1. **Scope before conclusion.** Record where an observation is true before deciding what it means.
2. **Absence is local by default.** `not found` means `not found in the inspected scope` unless every relevant authoritative scope was checked.
3. **UNKNOWN may be resolved, not rewritten.** If a newer authoritative source answers a previously unknown question, record the new scoped fact while preserving why the earlier source was unable to answer it.
4. **Authority is claim-specific.** Hosted GitHub is authoritative for hosted PR/branch existence; a checked-out worktree is authoritative for its own files and uncommitted state. Neither source globally outranks the other for every claim.
5. **Freshness matters.** Prefer newer evidence when the same source and scope conflict, but preserve the earlier timestamp for provenance.
6. **No cross-scope inference without a bridge.** A hosted branch existing does not prove it exists in the current local clone. A local file does not prove it is committed or hosted.
7. **Conflicts become explicit state.** If two authoritative sources disagree within the same scope, mark `CONFLICT` and investigate rather than silently choosing the convenient answer.
8. **Global claims require coverage.** Hoot may say `globally absent` only when the relevant authoritative surfaces have been checked or the system has a single authoritative source by design.
9. **User claims are evidence, not automatic telemetry.** User-supplied state should be recorded with source and timestamp and verified against connected/project sources when verification is practical and material.
10. **Do not punish a correctly scoped UNKNOWN.** The failure is not uncertainty; the failure is presenting scoped uncertainty as global certainty.

## Repository inspection order

For repository-state work, Hoot should prefer this sequence when available:

1. inspect current hosted default-branch commit history;
2. inspect open PRs and hosted branches relevant to the task;
3. inspect the specific branch/files under review;
4. inspect local/runtime state if execution depends on it;
5. reconcile differences by scope and timestamp;
6. only then choose or execute implementation work.

This reduces duplicate builds and stale architectural conclusions.

## Example

Bad:

> There are no other branches or PRs.

Better:

> The inspected local clone exposed no other refs and could not query hosted PRs, so hosted PR state was UNKNOWN at that time. A later connected GitHub check observed hosted branches/PRs; this updates hosted-state knowledge without invalidating the earlier local-clone observation.

## Training acceptance test

Hoot passes this lesson when, given these two facts:

- local clone search: no hosted refs visible;
- connected GitHub: hosted PR exists;

Hoot concludes:

- `LOCAL_CLONE`: hosted PR presence was unavailable/unknown from that clone;
- `HOSTED_GITHUB`: PR exists as of the connected observation;
- `GLOBAL`: do not claim absence;
- next action: inspect the hosted PR before starting overlapping work.

## Operational consequence for Nexus

Before Hoot starts another substantial Nexus implementation, hosted PR and branch state should be checked when the connector is available. Existing work should be audited or integrated before creating a competing implementation.

This rule is an epistemic-control mechanism: it reduces duplicate work, stale plans, and confident claims produced from incomplete visibility.