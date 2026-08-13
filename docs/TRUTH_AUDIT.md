# NEXUS TRUTH AUDIT

**Date:** 2026-08-13 · **Auditor:** Claude Code (Chief Engineering Intelligence)
**Method:** Full repository inspection, git history, dependency and runtime probing, execution.

---

## 0. The headline finding

**Before this session, the repository contained nothing.**

```
$ git log --oneline --all          →  32f51d4 Initial commit   (one commit, ever)
$ git log --all --diff-filter=A --name-only | sort -u
                                   →  README.md
$ find . -type f -not -path './.git/*' | wc -l
                                   →  1
$ cat README.md
                                   →  "# Nexus
                                       Ai agents and Social media Automation"   (47 bytes)
```

That is the entire prior state: **one commit, one 47-byte README, zero lines of code.**

The Master Directive describes NOVA, HABITUS, EVO, KIMI, CODEX, ALPHABOT, WAYFINDER,
STEM, the AI Society, and a 3D AI Gallery. **None of them existed in this repository.**
There was no code to audit, no mocks to expose, no dead code to remove, and no
duplication to reconcile.

This is the single most important fact in the audit, and it changes the plan: the
directive's Phase 1 ("determine what actually exists") completed in about ninety
seconds, and the real work was Phase 2 — building the spine.

**If those components exist somewhere** — another repository, a Claude Project, a
local machine, a set of chat transcripts — they are not here, and nothing in this
repo can see them. Point me at them and I will audit them properly. Until then,
treating them as existing assets would be inventing information.

---

## 1. What exists now (built and verified this session)

| Capability | Status | Evidence |
|---|---|---|
| Event/Action Ledger (append-only, hash-chained) | **WORKING** | 6 tests; `nexus verify` → "chain intact across N records" |
| Ledger tamper-evidence | **WORKING** | Test drops the SQL triggers, edits a row, `verifyChain()` catches it at the right id |
| Ledger append-only enforcement | **WORKING** | DB triggers reject `UPDATE`/`DELETE`; test asserts both throw |
| Policy engine (bounded authority) | **WORKING** | 11 tests incl. privilege-escalation and env-clamping cases |
| Capital-level gating (L0–L5) | **WORKING** | Tests prove funds are denied at L0–L2 and never auto-approved above |
| Task Router (capability-based) | **WORKING** | Selects by capability + liveness; verified via `nexus doctor` |
| Provider adapters (Anthropic, OpenAI-compatible) | **UNWIRED** | Code complete and typechecked; **no API key present, so never executed against a live endpoint** |
| Echo adapter (offline determinism) | **WORKING** | Whole system runs end-to-end with zero credentials |
| Gauntlet loop (build→critique→verify→score) | **WORKING** | 10 tests covering every termination path |
| Gauntlet termination bounds (5 axes) | **WORKING** | Separate test per axis: iterations, budget, timeout, stall, pass-threshold |
| Evaluation engine / verifiers | **WORKING** | `CommandVerifier` ran the real test suite; Gauntlet passed on "npm exited 0" |
| CLI (`doctor`/`ledger`/`verify`/`gauntlet`) | **WORKING** | All four commands executed; output in §5 |
| Agent contracts (10 required fields, validated at load) | **WORKING** | 7 tests; malformed contracts rejected, spawn cycles rejected |
| Grants — governed recursion, authority only narrows | **WORKING** | 11 tests: tools/budget/deadline/blast-radius/depth all proven to narrow, never widen |
| Agent roster (NOVA, KIMI, CLAUDE-ENGINEER, CRITIC, WAYFINDER) | **WORKING** | Registered and validated; `nexus agents` renders it |
| Wayfinder opportunity scoring | **WORKING** | 10 tests incl. irreversible-catastrophe veto and novelty-is-not-opportunity |
| Intake (untrusted-by-default ingestion) | **WORKING** | 12 tests; hostile file quarantined in a live run, path traversal refused |
| HABITUS, EVO, CODEX, STEM, AI Society, 3D Gallery | **DOES NOT EXIST** | Not present in this repository, in any form |

**Test result: 69/69 passing. Typecheck: clean.**

---

## 2. What actually works vs. what merely exists

The directive demands this distinction, so here it is stated plainly.

- **Executed and verified end-to-end:** the ledger, the policy engine, the Gauntlet
  loop, the verifiers, and the CLI. The Gauntlet completed a real run whose success
  criterion was a *real command exiting zero*, not a model's opinion.
- **Code exists, execution unproven:** the Anthropic and OpenAI-compatible adapters.
  They compile and are typechecked, and their request shapes follow the current API
  contracts — but **no live API call has been made, because no key exists in this
  environment.** I am not going to call these "working." They are UNWIRED until a key
  turns them on and `nexus doctor` reports LIVE.
- **Not built:** everything else in the vision.

---

## 3. What is mocked, and why that is deliberate

One mock exists: the **echo adapter**. It is not an attempt to look finished.
It exists so the loop mechanics, ledger, and evaluation engine can be exercised
before a single credential exists — which is exactly the state the system boots in.

Three properties keep it honest:
1. It labels its own output (`[echo:capability] no live provider configured`).
2. It always sorts **last** in routing, so a real provider is never passed over.
3. `nexus doctor` says loudly when it is the only thing running.

---

## 4. What is dangerous

Ranked by how much damage the mistake would do.

1. **Fabricated cost data would silently corrupt everything downstream.** The
   evaluation engine, the budget ceilings, and every future capital decision are all
   built on cost numbers. I have verified pricing for Anthropic models only. For every
   other provider, cost is recorded as `null` / `costUnknown: true` rather than guessed,
   and the Gauntlet **escalates instead of looping** when it cannot price its own spend.
   Set `NEXUS_PRICES_JSON` with verified numbers to switch enforcement on.
2. **Single-provider critique is self-grading.** With one provider live, the "adversarial
   critic" would be the builder reviewing its own work — worse than no critique, because
   it looks like review. The Gauntlet refuses to do this, records the gap as an
   escalation, and `doctor` warns about it.
3. **Subjective pass criteria are reward hacking waiting to happen.** A model scoring its
   own output is not evidence. `ModelVerifier` is flagged `subjective: true` and a
   subjective-only pass returns `escalated.subjective-only`, never `passed`.
4. **Capital authority must never be self-granted.** Capital level is read from the
   environment and has no setter. A test asserts that assigning to it throws.
5. **The ledger is tamper-*evident*, not tamper-*proof*.** Anyone with write access to the
   database file can drop the triggers and rewrite history — but they cannot make
   `verifyChain()` pass afterward. Run `nexus verify` on a schedule; treat a broken chain
   as an incident.

---

## 5. Evidence log

```
$ npm test
# tests 69   # pass 69   # fail 0

$ npx tsc --noEmit
(clean)

$ nexus doctor
  [DARK] anthropic   ANTHROPIC_API_KEY is not set
  [DARK] moonshot    MOONSHOT_API_KEY is not set
  [DARK] openai      OPENAI_API_KEY is not set
  [LIVE] echo
  0 real provider(s) live.
  capital level : 0 — read-only intelligence
  chain         : intact

$ nexus gauntlet 'make the suite pass' --verify-cmd 'npm test' --max-iterations 1
status : passed
reason : verified by npm test: npm exited 0
score  : 1.00

$ nexus verify
Ledger chain intact across 8 records.

$ nexus intake          # with a deliberately hostile file present
  QUARANTINED document  fa2ec953c4ca  hostile-sample.md
                flags: instruction-override, authority-grant

$ nexus wayfinder -- data/opportunities.json
#1  0.897  Automate the agency prospecting motion (...)
#7  vetoed  ALPHABOT trading real capital — downside severe and hard to reverse
```

---

## 6. Highest-leverage missing capability

**A second live model provider.**

Not a feature — a credential. Every distinctive property of this system depends on
more than one model being reachable: adversarial critique, the Gauntlet's core
premise, cross-model verification, and the routing that sends research to KIMI and
engineering to Claude. With one provider, NEXUS degrades into a single model talking
to itself with extra logging. With two, the entire design switches on.

Everything needed to consume those keys is built and tested. The bottleneck is the keys.

---

## 7. What to build in the next 7 days

Ordered so each step makes the next cheaper. Do not start step *n+1* until step *n*
produces evidence.

| Day | Build | Done when |
|---|---|---|
| 1 | Add API keys; run `nexus doctor` | ≥2 providers report LIVE |
| 1 | First real Gauntlet run against a live provider | A run passes on `CommandVerifier` evidence, ledgered |
| 2 | Verified pricing for every live provider in `NEXUS_PRICES_JSON` | `costComplete: true` on a real run |
| ~~2–3~~ | ~~Agent contract schema + registry~~ | **DONE** — contracts, grants, roster, 18 tests |
| 3–4 | **First Real Loop** — one narrow external workflow, end to end | External state changed, result returned, evaluation ledgered |
| 5 | Discovery Loop v0 — scheduled, writes `discovery` events, proposes nothing it cannot verify | Ranked opportunities in the ledger |
| 6 | Wayfinder scoring over discovery events (EV, cost, reversibility, downside) | A ranked list Alex disagrees with usefully |
| 7 | Review: chain verify, cost report, what the evidence changed | This audit updated with real numbers |

**Explicitly deferred:** the 3D AI Gallery, autonomous capital, recursive agent spawning.
None of them should be built before the Real Loop produces evidence. The Gallery in
particular is a visualization of state that does not exist yet.

---

## 8. Recommended smallest implementation sequence

```
keys → verified pricing → agent contracts → FIRST REAL LOOP
     → measure → first revenue loop → capital permission model
```

The gate between "impressive" and "real" is the Real Loop. Everything before it is
infrastructure; everything after it is compounding. Build the smallest loop that
changes something outside this process and reports back.
