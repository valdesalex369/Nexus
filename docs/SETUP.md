# Morning briefing — start here

Written overnight, 2026-08-13. Everything below is built, tested and pushed.
**69/69 tests passing, typecheck clean, and it all runs with no API keys.**

---

## 1. The keys — do NOT paste them in chat

Chat messages persist in transcripts. A key pasted into a message is a key you
have to rotate.

**Right way:** Claude Code on the web → your environment's settings → **environment
variables**. Add:

```
ANTHROPIC_API_KEY   = ...
MOONSHOT_API_KEY    = ...     # KIMI — long-horizon research
OPENAI_API_KEY      = ...     # NOVA — strategy and adversarial critique
```

Then run `npm run doctor`. It will tell you exactly which providers went LIVE and
which are still dark and why. That's the whole verification step.

If a key has already been pasted into a chat window anywhere: rotate it. Treat it as burned.

**Two providers is the threshold that matters.** With one, the "adversarial critic"
is the builder reviewing its own work, and the system correctly refuses to pretend
otherwise. With two, the Gauntlet's whole premise switches on. Anthropic + either
one of the others is enough to start.

---

## 2. The data dump — where it goes

**Drop everything into `data/intake/`.** Then run:

```bash
npm run intake
```

Every file gets fingerprinted (SHA-256), classified, scanned, and recorded in the
ledger. Content never enters the ledger — only pointers and findings — so a
document can't smuggle instructions into the audit trail.

**Anything that looks like an instruction gets quarantined.** I tested this with a
hostile file; it was ingested, flagged `instruction-override, authority-grant`, and
marked so no agent treats it as a command. Data describes the world. It never grants
permission.

The scanner also catches credential-shaped strings. If `npm run intake` reports a
flag starting with `secret:`, rotate that credential and delete the file.

---

## 3. What data I actually want, in priority order

You offered to point Cowork at websites and apps. Here's where it's worth the trips.
Ranked by what unblocks the highest-scoring opportunity (see §4).

### Tier 1 — unblocks revenue this week

1. **Local business listings** for Hialeah, Miami Lakes, Medley, Doral. Per business:
   name, category, rating, review count, whether the Maps entry has a website button,
   phone, hours. This is the raw input to the 60-second qualifier.
   *Use the Google Places API if you can get a key — it's the clean route. For
   one-off lookups, Cowork browsing public Maps pages is fine. Don't have it build a
   bulk scraper; that's a terms-of-service problem you don't need.*

2. **Sunbiz records** for any business that qualifies: legal name, officers,
   incorporation date, status. This is what lets you ask for the owner by first name
   — which the playbook says beats "can I speak to the owner" by a wide margin. It's
   also what catches the "since 1990" error before it reaches a leave-behind.

3. **Your own past materials** — every mockup, leave-behind, and lead sheet you've
   already made, however rough. I need your actual format, not my guess at it. This
   is the single highest-value item for making output that sounds like you.

### Tier 2 — makes the pipeline sharper

4. **Unclaimed listing checks** — Yelp, Birdeye, Manta for candidate businesses.
   Unclaimed profiles are the strongest of the three findings because the owner
   usually doesn't know.
5. **Your notes** on past conversations with owners — especially exact quotes.
   The playbook says text yourself their exact words; if you've done that, those
   texts are the most valuable market research you own.

### Tier 3 — later

6. Job-track material (resume, applications in flight) — only if you want the job
   search instrumented too. Say so and I'll build it; I haven't assumed it.

**What I do not want:** anything with live credentials in it, customer PII beyond
what's already public on a business listing, or anything from a paid platform whose
terms you haven't checked. Ask me before pointing Cowork at something behind a login.

---

## 4. What the system says the first revenue loop is

I ran the Wayfinder scorer over seven candidates (`npm run wayfinder -- data/opportunities.json`).
Result, top three:

| # | Score | Opportunity |
|---|---|---|
| 1 | 0.897 | **Automate the prospecting motion** — qualify → research → three verified findings → mockup |
| 2 | 0.891 | Automate delivery — GBP checklist, one-page site scaffold, review QR, EN/ES copy |
| 3 | 0.644 | Missed-call text-back + review engine as the $125–150/mo retainer |

Generic "AI automation service" came sixth. ALPHABOT with live capital was **vetoed** —
severe downside, low reversibility. The scorer refuses to let upside outrank a bet you
can't undo, no matter how good the average looks.

**Why #1 wins, in one line:** it's the only candidate where distribution already
exists. You walk in doors. Everything else scores 0.8+ on distribution difficulty,
which is the thing that actually binds.

**The inputs are my estimates, and they're in `data/opportunities.json` for you to
argue with.** That's the point of the decomposed scores — if you think
`probability: 0.55` on the pipeline is optimistic, change it and re-run. A ranking
you can't dispute is worthless.

### The part that made me confident

Your agency's first rule and NEXUS's first rule are the same rule.

> *"Never state a number, name, date, or claim that hasn't been verified from a source."*

That's the identical discipline I built into the engine: unknown cost stays `null`,
never a guess. The three near-misses in your playbook — 5.0 stars when it was 4.7,
an invented lifetime warranty, "since 1990" when Sunbiz said 2009 — are exactly the
failure a verifier-gated pipeline prevents. Not by being careful. By refusing to emit
an unsourced claim at all.

**That's the first Real Loop**: research a business → every claim carries a source →
unverified claims are stripped before anything prints → you walk in with three
findings that are all true. External state changes, evidence returns, the ledger
records it.

I did not build it tonight, because building it on guesses about your format would be
the same mistake. It needs Tier-1 data first.

---

## 5. What got built while you slept

| Component | What it does |
|---|---|
| **Agent contracts** | All ten required fields, validated at load. An under-specified agent fails before it runs, not mid-flight. |
| **Grants** | Governed recursion. Authority *only ever narrows* — a child gets the intersection of its contract and its parent's remaining budget, tools, deadline and blast radius. Grants are frozen; you can't widen one by assignment. |
| **Roster** | NOVA, KIMI-RESEARCH, CLAUDE-ENGINEER, CRITIC, WAYFINDER. The critic literally cannot write, so it can never review its own work. No agent holds financial authority. |
| **Wayfinder** | Opportunity scoring with visible components and a hard veto on irreversible catastrophe. Novelty contributes zero. |
| **Intake** | Untrusted-by-default ingestion with injection and credential scanning. |

New commands: `npm run agents`, `npm run intake`, `npm run wayfinder -- <file>`.

---

## 6. First fifteen minutes when you wake up

```bash
npm run doctor          # after adding keys — confirms what's live
npm run agents          # the roster and its limits
npm run intake          # after dropping files into data/intake/
npm run wayfinder -- data/opportunities.json
```

Then tell me which Wayfinder inputs you disagree with. That's the fastest way to make
the next decision better than this one.
