# Hoot Append-Only Ledger Implementation Contract

Status: Active implementation gate
Date: 2026-08-16

## Objective

Convert machine-readable Hoot cycle events into persistent reliability history without rewriting historical Markdown evidence or inventing telemetry.

## Required behavior

The first event store must remain local, provider-free, deterministic, and JSONL-based. It must support append, full verification, lookup by cycle ID, recent-cycle retrieval, and a compact integrity report.

Each physical JSONL line must contain exactly:

- `sequence`: one-based monotonically increasing integer;
- `previous_hash`: SHA-256 hash of the prior entry, or 64 zeroes for genesis;
- `event_hash`: deterministic SHA-256 of sequence + previous_hash + canonical event JSON;
- `event`: one complete object conforming to `schemas/hoot_cycle_event_v0.1.json`.

Canonical JSON means UTF-8, sorted keys, compact separators, and no fabricated values.

## Append rules

Before every append:

1. read and verify the complete existing ledger;
2. reject malformed JSON explicitly;
3. reject sequence gaps or reordering;
4. reject a broken previous-hash link;
5. recompute and reject altered event hashes;
6. reject duplicate `cycle_id` values;
7. validate the incoming cycle event against the current cycle-event schema;
8. derive the new sequence and previous hash from verified history;
9. append exactly one newline-terminated JSON object;
10. read the ledger back and verify the new head before reporting success.

Historical entries are never edited in place. Corrections are new superseding events.

## Stable failure classes

At minimum, failures must be distinguishable as:

- `EVENT_SCHEMA_INVALID`
- `CYCLE_ID_REQUIRED`
- `DUPLICATE_CYCLE_ID`
- `MALFORMED_JSON`
- `BLANK_LINE`
- `SEQUENCE_MISMATCH`
- `CHAIN_LINK_MISMATCH`
- `EVENT_HASH_MISMATCH`
- `LEDGER_WRITE_FAILED`
- `POST_WRITE_VERIFY_FAILED`

Do not silently skip corrupt lines.

## Unknown telemetry rule

`null` remains `null`. Missing cost, compute, duration, or tool telemetry must never be converted to zero merely to simplify scoring. Unknown is neither excellence nor failure.

## Migration rule

Existing Markdown cycle records remain immutable historical evidence. Only migrate a historical cycle into machine-readable form when its required fields can be supported by direct repository evidence. Unknown telemetry remains null. Do not reconstruct missing Cycle 002 or any other cycle from memory alone.

## Acceptance tests

The ledger implementation is not trusted until tests prove:

1. genesis append succeeds;
2. second append links to the first hash;
3. duplicate cycle ID is rejected;
4. malformed JSON is surfaced;
5. blank lines are surfaced;
6. altered historical event content is detected;
7. altered `previous_hash` is detected;
8. sequence mutation is detected;
9. schema-invalid incoming events are rejected before write;
10. a failed append leaves prior bytes unchanged;
11. lookup returns the exact persisted event;
12. recent-cycle retrieval preserves order;
13. repeated verification of unchanged history returns the same head hash;
14. post-write verification confirms the newly appended event is actually readable and linked.

## Autonomy consequence

Implementing this store does not promote Hoot. A passing ledger merely makes reliability history queryable. Autonomy promotion remains dependent on verified execution quality, safety, and the separate evaluator criteria.

## Next implementation step

Implement the smallest module satisfying this contract, then run its adversarial fixture before migrating any historical cycle into the machine-readable ledger.