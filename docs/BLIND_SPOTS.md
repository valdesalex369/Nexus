# BLIND SPOTS

What we are probably getting wrong. Updated continuously. A blind spot that gets
resolved moves to the bottom with its resolution; it is not deleted, because the
record of what we were wrong about is itself data.

---

## Open

### B-001 · Verifier gaming is the main reward-hacking surface
The Gauntlet optimizes toward whatever the verifier measures. `ContainsVerifier` is
trivially gameable — a builder can emit the required marker inside a comment and pass.
`CommandVerifier` is much harder to game, but a builder that can edit the test suite
can still make `npm test` pass by weakening the tests.
**Mitigation so far:** subjective passes escalate rather than pass.
**Not yet mitigated:** verifier integrity itself. A verifier the builder can modify is
not a verifier.
**Next:** hash the verifier's inputs, or run verification from a source the builder
cannot write to.

### B-002 · Cost is unknown for every non-Anthropic provider
Only Anthropic pricing is verified. Everything else records `costUnknown: true`.
Budget enforcement is therefore *partial* — the Gauntlet escalates rather than looping
blind, which is the safe failure, but it means the spend ceiling silently does not
apply to unpriced providers until `NEXUS_PRICES_JSON` is populated.
**Risk:** a long run on an unpriced provider is bounded by iterations and time, not money.

### B-003 · Single-provider critique is theater
With one provider live, "adversarial critique" is a model reviewing itself. The system
now refuses to do this and records the gap — but the *deeper* issue is that even two
providers may share failure modes (similar training data, similar blind spots). Two
models agreeing is weaker evidence than it feels.
**Next:** weight critique by provider diversity; treat unanimous agreement with suspicion.

### B-004 · Ledger cost figures are self-reported
`costUsd` comes from token counts the provider returns, multiplied by a price table we
maintain. Neither is independently audited. A provider changing prices, or a stale
table, produces confidently wrong accounting.
**Next:** reconcile ledger totals against actual provider invoices monthly. Until that
reconciliation runs once, treat all cost data as an estimate.

### B-005 · No component has run against a live API
Every adapter is UNWIRED. Request shapes follow the current documented contracts, but
"typechecks correctly" and "works against the real endpoint" are different claims. The
first live call will find something.
**Next:** first live run is a *test*, not a deployment. Expect it to fail.

### B-006 · Evidence of a passing test is not evidence of a working feature
`CommandVerifier` proves a command exited zero. It does not prove the command tested
anything meaningful. 28 passing tests written by the same agent that wrote the code is
weaker evidence than it looks — I may have tested what I built rather than what was needed.
**Next:** an independent reviewer, or tests derived from the directive rather than from
the implementation.

### B-007 · The directive's vision may be larger than its evidence base
NOVA, HABITUS, EVO, STEM, AI Society and the 3D Gallery are described with confidence
but do not exist. There is a risk of building elaborate infrastructure for components
that were never specified beyond a name — and a matching risk that they *do* exist
elsewhere and this repo is duplicating them.
**Open question for Alex:** do these exist anywhere I can inspect?

### B-008 · "Impressive architecture that does nothing" is the standing failure mode
This session produced a spine with no live loop attached. That is the right order — but
if the next session adds more infrastructure instead of the first Real Loop, the system
becomes exactly what the directive warns against. The gate is external effect, not
component count.

---

## Resolved

*(none yet — this file is one session old)*
