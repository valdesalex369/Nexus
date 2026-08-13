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

**28/28 tests passing, typecheck clean, and the whole system runs with zero API keys.**

## Quick start

```bash
npm install
npm test                 # 28 tests, no credentials needed
npm run doctor           # what is live, what is dark, and exactly why

# Run a bounded loop whose success criterion is a real command exiting zero
npm run gauntlet -- "make the suite pass" --verify-cmd "npm test"

npm run nexus -- ledger  # what happened
npm run nexus -- verify  # prove the record wasn't altered
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

- [`docs/TRUTH_AUDIT.md`](docs/TRUTH_AUDIT.md) — what exists, what doesn't, with evidence
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the shape of the system
- [`docs/BLIND_SPOTS.md`](docs/BLIND_SPOTS.md) — what we are probably getting wrong

## Status

The spine is built and verified. **No adapter has run against a live API yet** — that
is the next step, and the highest-leverage missing piece is a second provider key, not
another component. See the 7-day sequence in the Truth Audit.
