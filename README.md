# NEXUS

An intelligence operating system: bounded, auditable infrastructure that turns model
output into **verified execution**.

Not a chatbot. The design premise is that intelligence and execution are different
things, and the gap between them is evidence — action, verification, persistence,
measurable outcome.

## What works today

| | |
|---|---|
| **Event Ledger** | Append-only, hash-chained. Tamper-evident: `verifyChain()` names the first altered record. `UPDATE`/`DELETE` rejected by the database itself. |
| **Policy Engine** | Rules every action `allow`/`require_approval`/`deny` across capital levels 0–5 and six blast-radius tiers. The system cannot promote itself. |
| **Task Router** | Routes by capability, not provider. Adapters light up when their keys appear. |
| **Gauntlet** | `build → critique → verify → score → revise`, bounded on five independent axes. The builder never critiques its own output. |
| **Evaluation** | Verifiers produce real evidence — command exit codes, output — not model opinions. Subjective-only passes escalate instead of passing. |
| **Agent Contracts** | Ten required fields, validated at load. Grants make recursion safe: authority only ever narrows. |
| **Wayfinder** | Opportunity scoring with visible components and a hard veto on irreversible catastrophe. Novelty scores zero. |
| **Intake** | Untrusted-by-default ingestion. Injection- and credential-shaped content is quarantined, never obeyed. |
| **Operations Loop** | Public Federal Register source → normalized claims → provenance/contradictions → fail-closed opportunity score → human gate → ledger → local UI. |
| **Operations MCP** | Three local stdio tools expose only ledger-verified state; no model, wallet, trading, or external-action surface. |

The deterministic test suite and typecheck run with zero API keys.

## Quick start

```bash
npm install
npm test                 # 28 tests, no credentials needed
npm run doctor           # what is live, what is dark, and exactly why

# Run a bounded loop whose success criterion is a real command exiting zero
npm run gauntlet -- "make the suite pass" --verify-cmd "npm test"

npm run nexus -- ledger  # what happened
npm run nexus -- verify  # prove the record wasn't altered

# Produce a local verified snapshot, then expose it to an MCP host
npm run operations:live -- --once --fixture test/fixtures/federal-register.json
npm run mcp:operations
```

Copy `.env.example` to `.env` and add keys. Nothing is required to boot — providers
light up as their keys appear, and `doctor` reports exactly which are dark and why.

## Design decisions worth knowing

- **Unknown cost stays unknown.** Only verified pricing enters the table. Everything
  else records `costUnknown: true`, and the Gauntlet escalates rather than looping
  without an enforceable budget. A fabricated price corrupts every decision built on it.
- **A model may not grade its own work.** Critique routes with the builder's provider
  excluded. With one provider live, the gap is recorded — never papered over.
- **Termination is measurable.** Iterations, budget, timeout, pass threshold, stall.
  Infinite improvement, not infinite execution.
- **No build step.** Node ≥22.18 runs TypeScript natively; `node:sqlite` and `node:test`
  are built in. The spine has zero runtime dependencies.

## Docs

- [`docs/SETUP.md`](docs/SETUP.md) — **start here**: keys, data intake, and the first revenue loop
- [`docs/MCP_OPERATIONS.md`](docs/MCP_OPERATIONS.md) — local read-only MCP and safe operator modes

- [`docs/TRUTH_AUDIT.md`](docs/TRUTH_AUDIT.md) — what exists, what doesn't, with evidence
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the shape of the system
- [`docs/BLIND_SPOTS.md`](docs/BLIND_SPOTS.md) — what we are probably getting wrong

## Status

The Operations loop has completed a real Federal Register cycle and a deterministic
fixture cycle. Model providers, wallet observation, wallet signing, and trading remain
disconnected or unimplemented; their absence is reported rather than simulated.
