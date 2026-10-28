# NEXUS Signal Gate v1 — October 28, 2026

## Decision

Signal quality is a separate dimension from processing success. A signed-off local research brief is not automatically alpha, a customer signal, or a deployable action.

This patch extends existing Opportunity Radar v0 (branch `codex/opportunity-radar-v0`), without introducing another agent, database, wallet, trading capability, external messaging action, or runtime.

## Outputs

- `SUPPRESS`: repeated, old, future-dated, malformed, or unproven provenance. Not an alert.
- `RESEARCH_ONLY`: plausible research observation, but uncertain outcome, single-source evidence, experimental economics, fixture or low score. Not a customer or market recommendation.
- `HUMAN_REVIEW`: necessary input checks pass; a human may investigate. This is **not** approval to trade, publish, spend, or contact anyone.

The decision is recorded in the existing SQLite hash-chained event ledger, included in `data/runs/latest.json`, displayed on the Opportunity Radar panel, and emitted by `npm run radar -- --once`.

## Current v0 truth

The Federal Register pipeline is single-source; commercial assumptions are explicit experiments; the result includes unresolved UNKNOWN claims. Therefore its best possible state is `RESEARCH_ONLY`. Fixture runs can never promote. An unchanged or stale selected document yields `SUPPRESS`, even if the previous research artifact was successfully written and verified. **This module does not prevent local artifact creation; it controls signal promotion metadata for consumers.**

## Four-stage law

1. Source: valid HTTPS source metadata, parseable document date, provenance-linked observation, SHA-256-shaped source identifier.
2. Cross-check: independent source IDs must be explicitly provided and audited; same-original-source republications do not count.
3. Falsify: unresolved outcomes, experimental buyer economics, opportunity veto, and low score block promotion.
4. Act / log: persist the decision and rationale. No external act is authorized.

## Reproduce

```sh
npm install
npm test
npm run typecheck
npm run radar -- --fixture test/fixtures/federal-register.json --once
```

Focused checks run with Node 22+:

```sh
node --test --disable-warning=ExperimentalWarning test/signal-gate.test.ts
```

## Boundary and known limits

- The checks validate the hash *format*, not the corresponding source bytes. This depends on Radar's existing ingestion/provenance implementation.
- The `independentSourceIds` and `validatedBuyerEvidenceRefs` arguments are **unverified evidence references** in v1; real corroboration and buyer-receipt validation are not implemented. An implementer must not mark these as verified simply to achieve `HUMAN_REVIEW`.
- `HUMAN_REVIEW` is intentionally weaker than validated economic value.
- No persistence or feedback score for forecast outcomes exists yet. This is a signal routing gate, not self-learning or sentience.
- Static fixture and unit tests do not establish production operation.
- Market prices, returns, probability of profit, business demand and consumer attention are outside this module.

## Follow-up acceptance gates

Before claiming *learning*, establish immutable precommitted predictions, outcome timestamps, resolution evidence, and leakage-free Brier-scored calibration against a baseline.

Before claiming *commercial ROI*, record consenting customer evaluation, alert relevance, time saved, error rates, and at least one verified payment.
