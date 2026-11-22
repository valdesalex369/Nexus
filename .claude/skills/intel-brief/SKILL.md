---
name: intel-brief
description: Produce a sourced, actionable intelligence brief on any topic — a market move, a geopolitical event, a new data source or API, a competitor, a technology shift. Use when the user asks "research X", "what's happening with Y", or "should we integrate Z".
---

# Intel Brief — Research

Delegate to the **alpha-researcher** subagent with a tightly scoped prompt, then relay its brief. The researcher works in four phases: wide scan (5-10 sources minimum) → deep dive on primary sources → cross-domain synthesis → deliverable.

## Scoping the prompt

Always include:
- The precise question and why it matters to NEXUS/HERMES
- What decision the brief will drive (integrate? trade? avoid? monitor?)
- Relevant existing context (current data sources, existing signals, repo files)
- The output format required (below)

## Required output format

```
## [TOPIC] Intelligence Brief
**Urgency**: Immediate / This Week / This Month / Monitor
**Confidence**: High / Medium / Low

### Key Finding        ← the actionable insight, 1-2 sentences, first
### Evidence           ← sourced claims, one per line
### Implications       ← what NEXUS/HERMES should do about it
### Risks & Uncertainties ← what would make this wrong
### Sources            ← URLs
```

For API/data-source evaluations, require the researcher's API Evaluation format (coverage, cost, rate limits, auth, integration effort, edge value, INTEGRATE/EVALUATE/SKIP verdict).

## Standards

- Verdict first — the user should get the answer in the first sentence of the relay
- Every claim sourced; speculation labeled as speculation
- "No signal" is a valid, valuable finding — never pad a thin result
- If the brief recommends integration, end with the concrete next step (which agent consumes it, what the Signal mapping is)
