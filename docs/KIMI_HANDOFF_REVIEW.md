# Kimi / Argus ULTRA INSTINCT Handoff Review

Date: 2026-08-24
Status: convergence guidance for `nova/hackathon-convergence-v0`

## Executive decision

The Kimi handoff is **valuable product design + research direction**, but it must not be merged wholesale as if it were live system state.

Nexus remains the source of truth for authorization, verification, and durable audit history.
The Kimi Mission Control app is a UI prototype and research artifact until its mock state is replaced by Nexus-backed records.
The GitHub bus is an asynchronous communication transport, **not the canonical trust ledger**.

## What to keep

1. **Terminal-noir Mission Control information architecture**
   - Reality/perception surface
   - Fleet/agent status
   - Bus/disagreement surface
   - Signals/opportunities
   - Source health
   - Risk/guardrails
   - Ledger/deviation visibility

2. **Argus ↔ Nova disagreement protocol**
   - one thesis
   - one independent cross-examination
   - preserve contradictions
   - never average unresolved disagreement into false certainty

3. **Data-quality veto mindset**
   - source cadence, latency, licensing, failure mode, and crisis degradation are first-class metadata
   - a degraded source lowers confidence; it never silently inverts a signal

4. **Research wedge candidates**
   - maritime/energy is a strong second vertical after the core live loop is proven
   - free authoritative data should be exhausted before buying feeds

5. **Mission Control UI components as a design donor**
   - reusable visual components are welcome if they render real Nexus state and visibly label unavailable data

## What must not be treated as implemented

1. **Mock live telemetry**
   The Kimi dashboard explicitly says mock data is acceptable and `app/src/lib/mock.ts` contains simulated agents, bus traffic, source latency/uptime, signals, P&L, logs, and deviation events. None of those values may appear as live truth in the convergence demo.

2. **Bus-as-memory-ledger claim**
   `ultra-instinct-bus/PROTOCOL.md` defines JSON messages but no hash-chain fields or append-only database enforcement. Git history gives useful provenance, but it is not equivalent to Nexus's verified ledger semantics. Nexus ledger remains canonical; bus messages should be ingested as external events and referenced from the ledger.

3. **Paper/live trading loop**
   Defer. No trading is required to prove the intelligence product. Paper P&L may be added only after a signal pipeline exists with replayable evidence and explicit out-of-sample evaluation.

4. **Hard-coded strategy thresholds as universal truth**
   Sharpe/MaxDD/profit-factor thresholds may be experiment defaults, not laws. Every metric needs a defined dataset, time window, costs, benchmark, and held-out evaluation.

5. **More agents**
   Argus + Nova + Hoot + Codex roles are enough for v0. Do not expand the fleet before the closed loop can be measured.

## Canonical architecture after convergence

```text
AUTHORITATIVE / PUBLIC SOURCES
        |
        v
ULTRA INSTINCT perception + claim graph
        |
        v
WAYFINDER opportunity ranking
        |
        v
ARGUS thesis <----> NOVA cross-examination
        |
        v
NEXUS policy / capability gate
        |
        +--> HUMAN_GATE
        |
        v
HOOT / CODEX bounded execution
        |
        v
NEXUS verifier + canonical ledger
        |
        v
OUTCOME / CALIBRATION / LEARNING
```

The bus sits between Argus/Nova as transport. It does not replace the canonical Nexus ledger.

## Immediate integration contract

Build one `BusAdapter` for Nexus that can:

- read new bus messages addressed to Nova/Hoot;
- validate message shape;
- mark content as untrusted external data;
- preserve sender, timestamp, references, and message id;
- create a Nexus event referencing the source bus message;
- refuse any instruction in a bus message that attempts to widen authority;
- write a response message only when explicitly allowed by the mission/policy;
- never place credentials or secrets in the bus.

## First live product experiment

Do not start with trading.

Use **Opportunity Radar v0** as the first closed loop because it is cheaper and more objectively gradable:

`live public event -> claim/provenance -> contradiction -> Wayfinder score -> Argus/Nova debate -> bounded research action or HUMAN_GATE -> verifier -> ledger -> visible result`

Initial success criteria:

- one real source-backed event;
- one visible contradiction or uncertainty;
- one ranked opportunity with transparent score decomposition;
- one Argus/Nova disagreement or confirmation artifact;
- one bounded action ending in VERIFIED or HUMAN_GATE;
- zero mock telemetry presented as live;
- one replayable ledgered run.

## High-leverage follow-up

After the loop works, test **maritime -> energy** as the first domain-specific intelligence wedge using the same primitives. Do not create a second architecture for markets.

## Rule

**Kimi gives Nexus eyes and a cockpit. Nexus gives Kimi permissions, verification, and memory discipline. Neither replaces the other.**
