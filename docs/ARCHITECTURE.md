# NEXUS Architecture

Current state, not aspiration. Everything below exists in `src/` and is covered by tests.

---

## The shape

```
                         objective
                             │
                    ┌────────▼────────┐
                    │    GAUNTLET     │  bounded loop, 5 termination axes
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
    ┌───────────┐     ┌────────────┐     ┌────────────┐
    │  ROUTER   │     │  VERIFIER  │     │   POLICY   │
    │ by        │     │ real       │     │ bounded    │
    │ capability│     │ evidence   │     │ authority  │
    └─────┬─────┘     └──────┬─────┘     └──────┬─────┘
          │                  │                  │
    ┌─────▼──────┐           │                  │
    │  ADAPTERS  │           │                  │
    │ anthropic  │           │                  │
    │ moonshot   │           │                  │
    │ openai     │           │                  │
    │ echo       │           │                  │
    └─────┬──────┘           │                  │
          └──────────────────┼──────────────────┘
                             ▼
                    ┌─────────────────┐
                    │     LEDGER      │  append-only, hash-chained
                    └─────────────────┘
```

Every arrow into the ledger is written **before** the next step runs, so a crashed run
still leaves a complete account of what it did.

---

## Components

### Ledger — `src/ledger/`
Append-only, hash-chained event store on `node:sqlite`. Each record commits to its
predecessor's hash, so `verifyChain()` detects any silent edit and names the first
divergent record. `UPDATE` and `DELETE` are rejected by database triggers, not by
convention. Records: actor, model, task, tools, decision, evidence, cost, latency,
confidence, errors, human approval, reversal status.

This is the memory of the organization. Nothing consequential happens without a record.

### Policy — `src/policy/`
Rules every proposed action into `allow | require_approval | deny` along two independent
axes:
- **Capital level (0–5)** — earned financial authority, read from the environment.
  There is no setter; the system cannot promote itself.
- **Blast radius** — `none → local → external → published → financial → destructive`.
  Reading a web page and force-pushing to main are both free and are not the same risk.

Some capabilities (`credentials.exfiltrate`, `policy.selfmodify`, `ledger.rewrite`,
`human.impersonate`, `security.disable`) are denied at every level, checked first.

### Router — `src/router/`
Routes by **capability**, never by provider name: `research.long`, `engineering.build`,
`critique`, `strategy`, `classify`. Adapters declare what they can do and whether their
credentials are present; the router prefers live adapters in a per-capability preference
order. Swapping providers is a registry edit.

`EchoAdapter` is a deterministic zero-credential provider so the whole system runs before
any key exists. It always sorts last and labels its own output.

### Evaluation — `src/eval/`
Verifiers turn "the model said it worked" into "here is what happened".
- `CommandVerifier` — runs a real command, reports exit code and output. Strongest
  evidence available. Arguments pass as argv, never through a shell.
- `ContainsVerifier` — objective marker check.
- `AllOfVerifier` — conjunction.
- `ModelVerifier` — for genuinely subjective criteria; always flagged `subjective: true`.

### Gauntlet — `src/gauntlet/`
`build → critique → verify → score → revise`, bounded on five independent axes:
iteration limit, spend budget, wall-clock timeout, pass threshold, and stall detection.

Two rules make it more than a retry loop:
- **The builder never critiques its own output.** The critic is routed with the builder's
  provider excluded. If no second provider exists, critique is skipped and the gap is
  recorded as an escalation — never silently self-graded.
- **A subjective-only pass is not a pass.** It returns `escalated.subjective-only`.

Terminal states: `passed`, `failed.{iterations,budget,timeout,stalled}`,
`escalated.{cost-unknown,subjective-only}`, `error`.

---

## Deliberate design decisions

**Unknown cost stays unknown.** Only Anthropic pricing is verified. Everything else
records `costUsd: null, costUnknown: true`, and the Gauntlet escalates rather than
looping without a working budget. A fabricated price would corrupt every downstream
evaluation and capital decision — the one error that compounds silently.

**Zero runtime dependencies for the spine.** `node:sqlite`, `node:test`, and native
TypeScript execution (Node ≥22.18) mean the ledger, policy, router, and Gauntlet run
with no build step and no supply chain. The only dependency is `@anthropic-ai/sdk`,
used solely by the Anthropic adapter.

**Termination is measurable, never vibes.** Every exit is a named condition with a
recorded reason. Infinite improvement, not infinite execution.

---

## Not built yet

NOVA, HABITUS, EVO, KIMI-as-a-component, CODEX, ALPHABOT, WAYFINDER, STEM, the AI
Society, and the 3D Gallery. See `TRUTH_AUDIT.md` §7 for the sequence and
`BLIND_SPOTS.md` for what that sequence assumes.
