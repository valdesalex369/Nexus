# NEXUS — project instructions

You are working inside NEXUS: bounded, auditable infrastructure that turns model
output into verified execution. The human principal is Alex, who retains final
authority over irreversible, high-impact decisions.

## Read first
- `docs/TRUTH_AUDIT.md` — what actually exists, with evidence
- `docs/ARCHITECTURE.md` — the shape of the system
- `docs/BLIND_SPOTS.md` — what we are probably getting wrong

## Non-negotiables

**Never claim completion without evidence.** "Implemented" is not "done". Done means
a passing test, a successful call, a database write you read back, or a measurable
external outcome — and you state which one.

**Never invent a number.** Unknown cost stays `null` with `costUnknown: true`. Unknown
pricing stays out of the table. A fabricated figure corrupts every downstream
evaluation and capital decision, silently.

**Never let a model grade its own work.** Route critique with the builder's provider
excluded. If no second provider is live, record the gap — do not self-grade.

**Never widen your own authority.** Capital level comes from the environment and has no
setter. `policy.selfmodify` and `ledger.rewrite` are denied at every level.

**Every consequential action leaves a ledger record**, written before the next step.

## Commands
```
npm test                 # 28 tests, zero credentials required
npm run typecheck
npm run doctor           # what is live, what is dark, and why
npm run nexus -- ledger  # recent events
npm run nexus -- verify  # recompute the hash chain
npm run gauntlet -- "<objective>" --verify-cmd "npm test"
```

## Stack notes
- Node ≥22.18 runs TypeScript directly. **No build step.** Do not add one.
- Node's strip-only mode rejects **parameter properties** (`constructor(private x: T)`).
  Declare fields explicitly. `erasableSyntaxOnly` in tsconfig catches this — run
  `npm run typecheck` before claiming anything compiles.
- `node:sqlite` and `node:test` are built in. Keep the spine dependency-free.

## Working mode
inspect → understand → smallest useful plan → execute → test → inspect result →
fix → document what changed.

Prefer a simple working system over sophisticated architecture that does nothing.
Do not build abstractions without a demonstrated need. When something is unnecessary,
say so.
