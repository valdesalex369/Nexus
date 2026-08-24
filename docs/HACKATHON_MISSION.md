# NEXUS Hackathon Convergence Mission

## Objective
Turn the strongest existing Nexus branches into one demoable, falsifiable product loop instead of continuing parallel architecture work.

## Product thesis
**ULTRA INSTINCT is the intelligence layer; NEXUS is the trust/execution layer; WAYFINDER is the opportunity layer; HOOT is the first bounded operator.**

The demo must prove one closed loop:

`live source -> normalized claim/event -> contradiction/provenance check -> opportunity score -> recommended action -> bounded execution or human gate -> evidence -> ledger -> visible outcome`

## Active bottleneck
Repository fragmentation and lack of one end-to-end live demonstration.

Current useful assets exist on separate branches:
- `claude/nexus-intelligence-system-48lqp2`: TypeScript spine, ledger, policy, router, gauntlet, evaluation, agents, Wayfinder, discovery, provenance.
- `nova/ultra-instinct-graph-v0`: provenance-first STEM claim graph and belief state.
- `main`: later Hoot evidence/evaluator/revenue artifacts and Cohort 01 reality data.
- `claude/setup-react-vite-dashboard-Bxuwj`: dashboard shell, but not yet a convincing product surface.

Do not add another agent or broad schema until this loop works.

## Cheapest high-leverage experiment
Build **Opportunity Radar v0** with one live domain and free/public data.

Recommended domain for the first demo: **AI / government / infrastructure opportunity intelligence**.

Use only 2-3 sources initially, preferring primary sources with stable public interfaces. The demo should surface at most five ranked opportunities, each with:
- what changed;
- source/provenance;
- entities affected;
- contradiction / uncertainty;
- why it matters economically;
- expected value;
- reversibility;
- recommended next action;
- evidence required to close the loop.

No trading, spending, messaging, or external irreversible action.

## Hackathon acceptance criteria
A judge can clone and understand the repo in under 5 minutes.

A single command boots the system.

A single live run produces at least one source-backed event and one ranked opportunity.

Every displayed claim links to source evidence.

The system can show why an opportunity ranked above another.

At least one contradiction or uncertainty is visibly represented rather than hidden.

The system records the run in a tamper-evident ledger.

At least one bounded action reaches either VERIFIED or HUMAN_GATE.

The UI updates from real data; no fake prices, fake users, fake revenue, or simulated success presented as live truth.

Tests cover provenance, scoring, execution gating, and one end-to-end fixture.

A 90-second demo can explain: **see -> understand -> rank -> act -> verify -> learn**.

## Demo surface
Only four panels are required:

1. **Reality Delta** — the top material changes since the prior run.
2. **Opportunity Radar** — ranked opportunities with score decomposition.
3. **Evidence Graph** — source -> claim -> entity -> contradiction/support -> action.
4. **Operations** — Hoot/Nova tasks, authority level, status, evidence, human gates.

A chat bar may query the same state, but chat is not the product by itself.

## Metrics
Track:
- source freshness;
- claim precision / later correction rate;
- opportunity precision@5;
- time from source publication to surfaced signal;
- percent of recommendations with explicit evidence;
- human minutes per verified outcome;
- cost per verified outcome;
- number of false-positive alerts;
- revenue or user-value evidence when available.

## Non-goals for v0
- no 3D gallery;
- no autonomous trading;
- no wallets;
- no 20-agent society;
- no GPU purchase;
- no attempt to ingest the whole internet;
- no custom inter-agent protocol if existing standards suffice;
- no dashboard polish before the live loop works.

## Branch strategy
Use `nova/hackathon-convergence-v0` as the temporary convergence branch.

Port only capabilities that survive an evidence check. Prefer one coherent runtime over keeping both Python and TypeScript versions of the same primitive.

Before merging to `main`, require:
- clean tests;
- truthful README;
- live demo instructions;
- screenshots/demo capture;
- clear architecture diagram;
- explicit known limitations;
- one reproducible real-world run.

## Prime directive
**Do not optimize for how many components Nexus has. Optimize for how quickly it turns new reality into a verified, explainable, economically useful action.**
