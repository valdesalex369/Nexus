# Hoot Ledger Static Audit

Date: 2026-08-16
Status: PASS for static conformance; runtime test execution remains required

## Scope

Inspected `src/nexus/hoot_ledger.py` and `tests/test_hoot_ledger.py` on `main` before changing repository state.

## Finding

The implementation and fixture are internally aligned across all 14 persisted adversarial cases:

- genesis append returns the verified head hash;
- second append links to the first event hash;
- duplicate cycle IDs are rejected before mutation;
- malformed JSON is surfaced as corruption;
- blank lines are surfaced as corruption;
- historical event tampering changes the recomputed hash and is detected;
- altered `previous_hash` is detected;
- PASS without evidence is rejected before ledger creation;
- append after corrupted history fails before mutation;
- lookup returns the persisted event;
- recent-cycle query preserves chronological order;
- repeated verification is deterministic because canonical JSON and SHA-256 inputs are stable;
- unknown cost/compute/tool telemetry is copied without coercion and remains null;
- post-write verification checks both the new head hash and final cycle ID.

## Additional observations

1. `append_event` validates the incoming event before reading/writing the target ledger, then verifies the entire existing history before append.
2. The write is append-mode, flushed and `fsync`ed, then the full ledger is verified again.
3. Historical duplicate IDs are classified as corruption; incoming duplicate IDs are classified as `DuplicateCycleError`. This distinction is coherent.
4. The validator is intentionally a minimum validator rather than a full JSON Schema validator. The current tests exercise the minimum contract, so this is not a test mismatch, but future schema drift could create a gap unless schema validation is centralized.
5. There is no concurrency/locking mechanism. Two simultaneous writers could both verify the same head before appending. This is not exercised by the frozen 14-case suite and should be treated as a future reliability risk before multi-worker autonomy.
6. An `fsync` protects file contents, but directory metadata durability after first file creation is not explicitly synchronized. This is a durability hardening item, not a demonstrated current fixture failure.

## Decision

Static conformance: PASS.
Runtime conformance: UNKNOWN until `python -m unittest tests.test_hoot_ledger -v` is executed against an attributable Nexus checkout/runtime.

Do not migrate historical cycles or calculate a production reliability score solely from this static audit.

## Training lesson

A test suite can be statically consistent with an implementation while runtime behavior remains unproven. Hoot must keep those evidence classes separate. Also, passing a single-writer fixture does not prove safe concurrent persistence; autonomy expansion must track the operating conditions actually tested.

## Next priority

Execute the 14-case ledger fixture in an attributable Nexus runtime. If green, migrate only directly evidenced historical cycles into the machine-readable ledger. Before introducing concurrent workers, add a locking/serialization design and adversarial concurrent-writer test.