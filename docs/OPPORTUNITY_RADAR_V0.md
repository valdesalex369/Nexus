# Opportunity Radar v0 — convergence record

Date: 2026-08-24
Branch: `nova/hackathon-convergence-v0`

## Decision

Use the existing Node 22+ / native TypeScript spine as the only runtime for this
vertical slice. Reuse its discovery claim contract, Wayfinder scoring, Nexus policy
engine, and canonical hash-chained SQLite ledger. Add only a BusAdapter, one public
source adapter, bounded orchestration, and a state-driven four-panel UI.

## Relevant branch audit

| Branch | Evidence found | Decision |
|---|---|---|
| `nova/hackathon-convergence-v0` | TypeScript spine plus the hackathon mission and Kimi handoff boundary | Canonical implementation branch |
| `claude/nexus-intelligence-system-48lqp2` | Working TypeScript policy, ledger, discovery, evaluation, and Wayfinder | Reuse in place; convergence branch is its exact runtime superset |
| `nova/ultra-instinct-graph-v0` | Strong Python claim/belief graph with provenance and contradiction semantics | Do not port now; it duplicates the selected evidence model and creates two runtimes |
| `main` | Newer Python Hoot evidence, evaluator, revenue, and cohort artifacts | Preserve for later; do not merge 71 unrelated commits into this slice |
| `nova/align-hoot-ledger-contract` | Improved Python JSONL Hoot ledger | Do not duplicate the canonical TypeScript/SQLite event ledger |
| `claude/setup-react-vite-dashboard-Bxuwj` | React/Express shell for agents, posts, and SEO on old history | Use only terminal-noir visual cues; its product/state model is unrelated |
| `codex/create-migration-truth-documentation` | Migration documentation only | Informational; no reusable runtime |
| `claude/enable-agent-teams-OIjwZ` | Agent-team expansion | Explicitly outside the mission |

## Conflicting duplicates resolved

- TypeScript discovery claims versus Python STEM graph: TypeScript controls v0.
- SQLite event ledger versus Python Hoot JSONL ledger: SQLite controls v0.
- Built-in Node dashboard versus older React/Express: built-in Node controls v0.
- GitHub bus versus Nexus history: bus messages are untrusted transport records;
  Nexus SQLite remains the canonical trust ledger.

## Closed loop

```text
FederalRegister.gov API
  → validated government document + raw/document SHA-256
  → BusAdapter (UNTRUSTED_EXTERNAL)
  → OBSERVED claim + explicit UNKNOWN claims
  → Wayfinder score with visible scenario priors
  → Argus thesis + Nova cross-examination
  → Nexus policy gate
  → local brief VERIFIED or external action HUMAN_GATE
  → append-only hash-chained ledger
  → data/runs/latest.json
  → Reality Delta / Opportunity Radar / Evidence Graph / Operations
```

## Acceptance tests

1. Fixture and live runs produce retrieval time, raw SHA-256, document SHA-256,
   document URL, and GovInfo PDF link.
2. An `OBSERVED` claim cannot survive without retrieved provenance.
3. Proposal/final-outcome uncertainty stays visible and never becomes fact.
4. BusAdapter rejects malformed recipients, secrets, and authority expansion while
   accepted content remains `UNTRUSTED_EXTERNAL`.
5. Wayfinder emits a 0–1 score with every existing component and marks commercial
   inputs `EXPERIMENT_PRIOR_NOT_FORECAST`.
6. Argus and Nova use separate evidence references; disagreement is preserved.
7. Policy permits only a reversible local artifact or stops at `HUMAN_GATE`.
8. The canonical ledger verifies its full hash chain.
9. Four dashboard panels read only generated state and label `LIVE` vs `FIXTURE`.
10. Tests, typecheck, a live `--once` run, and the state endpoint pass.

## Reproduce

```bash
npm install
npm test
npm run typecheck
npm run radar -- --once
```

Interactive dashboard:

```bash
npm run radar
```

Offline deterministic replay:

```bash
npm run radar -- --fixture test/fixtures/federal-register.json
```

## Public-source quality contract

FederalRegister.gov documents are government-operated XML/API renditions and require
no API key. The site states that these renditions are informational rather than the
official legal edition. Radar therefore requires a `www.govinfo.gov` PDF URL, displays
the caveat, retains source hashes, and makes no legal-finality claim.

The pipeline validates required fields, URL hosts, publication date, unique document
number, and relevance. It rejects feeds with no valid GovInfo-backed document. It
does not yet download and hash the PDF body.

## Authority boundary

- Allowed: public read, normalization, scoring, local artifact write, ledger append,
  and exact read-back verification.
- Human gate: publishing, sending, submitting a comment, or contacting a third party.
- Absent: wallets, trades, capital movement, credentials, destructive writes, and
  autonomous authority increases.

## Known limitations

- One query and one selected event prove the loop, not precision@5.
- First run is `BASELINE`; later runs report `NEW_DOCUMENT` or `UNCHANGED`.
- Single-source uncertainty is visible; corroboration is not implemented.
- The $300 value, 15% probability, and $50 time-cost proxy are experiment priors for
  a possible paid brief, not observed demand, revenue, or forecasts.
- Argus/Nova deliberation is deterministic and evidence-linked; no claim of live
  multi-model inference is made.
- `VERIFIED` means the local artifact was written, read back byte-for-byte, hashed,
  and ledgered. It does not mean the commercial thesis succeeded.
