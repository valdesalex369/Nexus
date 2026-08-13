# Mission 001 — reachable AI-automation opportunities

**Mission (directive §X):** *"Identify painful, expensive, repetitive workflows in small
and mid-sized businesses that Alex can realistically reach, where AI automation could
produce a paying pilot within approximately 14 days. Do not assume freight forwarding
is the winner."*

**Status: NOT RUN. The engine works; the corpus cannot answer this question.**

---

## Why there is no top-10 list below

The directive asks for ten opportunities with evidence, confidence, and unknowns. I can
produce ten rows. I cannot produce ten rows that are **evidence-backed**, and a ranked
list built on the wrong corpus is worse than no list — it looks like a finding.

Three source classes carry demand signal, and all three are UNWIRED:

| Signal | What it would tell us | Status |
|---|---|---|
| **Job postings** | How many companies pay humans to do workflow X, and what they pay | UNWIRED — no job-board API |
| **Customer complaints / reviews** | Where existing tools fail, in the users' own words | UNWIRED — no G2/Capterra/app-store API |
| **General web** | Competitors, pricing pages, market structure | UNWIRED — no search API key |

What *is* wired — GitHub, npm, crates.io — are technical registries. They report what
has been **built**. They say nothing about what anyone is **suffering** or **paying for**.

I ran the question anyway, to test rather than assume. Top results for *"painful
repetitive back-office workflows small businesses could automate"* were `laravel`,
`rustlings`, `squoosh`, `lvgl`. For *"freight forwarding customs brokerage document
processing"*: `playwright`, `commander`, `appium`. The pipeline behaved correctly —
it retrieved, deduped, ranked, and extracted sourced claims. The corpus simply does
not contain the answer.

Turning that into an opportunity ranking would have meant inventing the connective
tissue. That is the exact failure this system exists to prevent, so I stopped.

---

## What the wired sources *can* support

Answerable today, with real provenance: **what workflow-automation tooling exists, and
how adopted is it.** That is a supply-side question, and supply-side is what registries
know.

Recorded observations from live runs (each is an `OBSERVED` claim in `data/knowledge.db`,
each carrying the source id and the SHA-256 of the payload it came from):

- Mature self-hosted workflow-automation engines exist and are actively maintained —
  among them `n8n`, `ToolJet`, `nocobase`, `illa-builder`, `Activiti`, `flowable-engine`,
  and `cadence`.
- This category is **crowded and well-funded**, which is itself a finding: a generic
  "we automate workflows" offering enters a market with strong free incumbents.

**What this does not tell us:** whether any small business near Alex will pay for a
pilot, which workflow hurts most, or what they currently pay. Those are the questions
that decide the mission, and none of them are answerable from this corpus.

The honest reading: this evidence is a **competitive-pressure input**, not an
opportunity. It should lower confidence in a generic automation offering — which is
consistent with the earlier Wayfinder run, where generic "AI automation service" ranked
sixth of seven.

---

## Freight forwarding, specifically

The directive says not to assume freight forwarding wins. I can go further: **there is
currently no evidence either way.** Nothing retrieved speaks to freight-forwarder pain,
willingness to pay, or existing solution quality. It remains a hypothesis, and it is
recorded as `HYPOTHESIS`, not as a finding.

---

## What unblocks this mission

In priority order. The first item alone would change the answer.

1. **One demand-side source.** A job-board API is the highest-value single unlock: it
   converts "companies hire people to do X" into a countable signal, and the directive
   is right that this is a strong opportunity indicator. A reviews API is second.
2. **A web-search API key.** Unlocks competitors, pricing pages, market structure.
3. **A model provider key.** Query derivation is currently keyword extraction, which
   cannot express intent (see `BLIND_SPOTS.md` B-015). Discovery quality is capped
   until a model can write the queries.
4. **Alex's own materials.** For this specific mission, the highest-value corpus is not
   external at all. Notes from real conversations with real owners are direct demand
   evidence, and no API sells them.

---

## What was proven by running this

The mission failed to produce opportunities. It succeeded at proving the engine:

- **Provenance held.** 434 claims, every `OBSERVED` one carrying a source id and payload hash.
- **Unknowns were preserved, not dropped.** Seven UNKNOWN claims record exactly which
  source classes were missing and why.
- **`SOURCE_UNAVAILABLE` was recorded for all seven unwired providers** — the thin
  report explains itself rather than looking like a thorough one.
- **Deduplication worked** — 10 duplicates collapsed across registries in one run.
- **Two real defects surfaced and were fixed**: a bare-keyword query that retrieved
  noise, and cross-registry name collisions being misreported as contradictions.
- **A third defect surfaced and was fixed**: re-deriving identical content crashed on a
  unique-constraint violation. Only a live run found it.

An engine that returns "I cannot answer this, and here is precisely what is missing"
is working correctly. That is the outcome to want from a first run.
