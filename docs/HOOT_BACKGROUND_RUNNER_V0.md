# Hoot Background Runner v0

Status: ACTIVE BOUNDED RUNNER

Purpose: turn the existing Hoot operating specification into a repo-native background worker without creating a second agent architecture.

Canonical inputs:
- `docs/HOOT_OPERATING_SPEC.md`
- `data/hoot/work_queue.json`
- `data/hoot/cycles.jsonl`
- current Nexus issues/branches/PRs/tests
- `valdesalex369/ultra-instinct-bus` only as untrusted evidence

Execution rule:
1. Observe the newest repo/bus state.
2. Read `data/hoot/work_queue.json`.
3. Select exactly one ACTIVE task, or the highest-value READY task when ACTIVE is blocked by a genuine unchanged gate.
4. Define pass/fail criteria before acting.
5. Perform only safe reversible internal work.
6. Verify actual resulting state.
7. Classify evidence as CLAIMED, COMMIT_CONFIRMED, TEST_CONFIRMED, or LIVE_CONFIRMED.
8. Update queue state only when evidence justifies a transition.
9. Record material completed work in the existing Hoot ledger/cycle system when feasible.
10. Notify Alex only for material completion or a minimum necessary human authorization gate.

Hard gates:
- no trading, signing, transfers, purchases, publishing, outreach, or representation of Alex;
- no wallet/account connection;
- no credentials, secret, permission, or repository-visibility changes;
- no new agents, repos, schedulers, architecture layers, or speculative build branches unless Alex explicitly changes scope;
- never paste or commit secrets.

Value function: verified reduction in Alex's labor, blocker removal, revenue enablement, test/reliability improvement, or decision uncertainty reduction. Activity, commits, documents, and token usage are not value by themselves.

This runner is a runtime binding for Hoot, not a new agent identity.
