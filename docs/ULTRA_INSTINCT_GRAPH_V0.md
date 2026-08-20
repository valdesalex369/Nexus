# ULTRA INSTINCT / STEM Graph v0

Status: active R&D branch

## Objective

Build a provenance-first, self-correcting decision-intelligence graph that lets Nova/STEM continuously ingest high-value public and internal data, preserve what was known when, reconcile contradictions, route questions to specialist agents/models, and improve decisions through scored outcomes.

The graph is not a dashboard and not a chatbot memory dump. It is the durable evidence layer beneath both.

## Prime invariant

Never overwrite history to make the current answer look cleaner.

Raw observations and claims are immutable. Corrections are new records that explicitly supersede, contradict, retract, or expire older records. Current belief is a computed view over the history.

## v0 graph objects

Every meaningful unit of knowledge is represented as an immutable `stem_claim_v0.1` record.

Core record types:

- OBSERVATION — directly sourced fact or measurement.
- CLAIM — normalized assertion derived from evidence.
- HYPOTHESIS — testable interpretation.
- PREDICTION — probabilistic forecast with a resolution rule.
- CORRECTION — explicit update, contradiction, retraction, or supersession.
- DECISION — chosen action tied to the evidence state available at the time.
- OUTCOME — what reality later showed.

Core entities include people, organizations, governments, countries, assets, tokens, securities, products, protocols, events, datasets, agents, and projects.

## Graph relations

Initial predicates should remain small and composable rather than becoming an uncontrolled ontology.

Examples:

- OWNS
- BUILDS
- FUNDS
- REGULATES
- ANNOUNCES
- DEPENDS_ON
- COMPETES_WITH
- PARTNERS_WITH
- AFFECTS
- SUPPORTS
- CONTRADICTS
- SUPERSEDES
- PREDICTS
- RESOLVES
- MENTIONS
- EXECUTES
- PRODUCES

Domain-specific predicates may be added only when repeated queries demonstrate a need.

## Source hierarchy

Prefer evidence in this order when the question permits it:

1. Primary official records and first-party data.
2. Direct machine-observed market/on-chain/system data.
3. High-quality independent reporting or research.
4. Social posts and community observations.
5. Model-generated interpretation.

A lower-tier source may discover a signal, but important claims should be promoted only after stronger evidence or explicit uncertainty.

Repeated copies of the same upstream report do not count as independent corroboration.

## Self-correction loop

For each new record:

1. Normalize entities and timestamps.
2. Hash and preserve raw provenance.
3. Search for graph-neighbor claims about the same subject/predicate/object.
4. Detect support, contradiction, staleness, or supersession.
5. Recompute the current belief view using source quality, freshness, independent corroboration, and direct evidence.
6. Never coerce unknown values into zero or false certainty.
7. If confidence changes materially, record the reason as a new correction edge.
8. If the claim drives a decision or prediction, attach the decision/prediction record.
9. Resolve predictions later and score calibration.

## Confidence policy

Confidence is not model swagger.

Confidence should be a reproducible function of:

- directness of evidence;
- source reliability for this domain;
- number of independent corroborating sources;
- freshness relative to the claim;
- contradiction severity;
- extraction/normalization certainty;
- whether the claim is observation vs inference.

Model consensus alone must not create high confidence.

## Agent / model routing

Nova/STEM is the governor and query router.

Hoot remains the reliability-learning execution agent.

Future role split:

- Adam — builder/operator: code, systems, automation, deployment, testing.
- Eve — discovery/research: markets, customers, policy, science, opportunity discovery.

External model adapters may be used for specialist work, but all outputs must return through a common contract:

- task_id
- model/provider
- input evidence IDs
- answer/claim records
- confidence
- citations/provenance
- disagreement notes
- cost/latency when available

Provider subscriptions are not assumed to grant API access. Direct machine-to-machine routing requires separate provider APIs or compatible tool/MCP bridges and explicit credentials/billing.

## Chat-bar contract

The future STEM chat bar should not send every question blindly to every model.

Query path:

1. Parse intent.
2. Retrieve relevant graph neighborhood and fresh sources.
3. Estimate uncertainty and stakes.
4. Choose the cheapest capable specialist first.
5. Escalate to a second model only when disagreement, uncertainty, novelty, or stakes justify it.
6. Ask a critic/verifier to challenge material conclusions.
7. Synthesize one answer with explicit evidence and uncertainty.
8. Persist only durable claims, decisions, predictions, corrections, and outcomes — not every conversational token.

## Data planes

Phase 0 sources require no paid proprietary feed:

- Nexus repository state and CI evidence.
- U.S. government primary releases and filings.
- SEC/Federal Reserve/Treasury/FRED/Federal Register/NIST/EIA/CFTC where applicable.
- Public company investor-relations material.
- Public GitHub and technical releases.
- Public market/crypto reference data that can be retrieved reliably.
- Web intelligence through approved search/retrieval tools.

Later connectors may include X, Instagram, Facebook, TikTok, ad analytics, premium financial data, exchange feeds, on-chain providers, and internal customer systems. Every new connector must declare cost, permissions, rate limits, provenance quality, and failure behavior before becoming trusted input.

## World Monitor

A World Monitor cycle should create records only for material deltas.

Materiality dimensions:

- novelty
- source quality
- strategic relevance
- likely economic impact
- change in previous belief
- decision urgency

If nothing material changed, silence is success.

## Product / R&D flywheel

Nova Agency is the paid laboratory.

Customer work should produce, where possible:

revenue -> domain data -> reusable workflow -> test cases -> agent skill -> product hypothesis -> stronger graph -> better decisions -> higher-value work

ULTRA INSTINCT should first improve our own decisions. A sellable product is earned only after repeated internal or customer evidence shows a measurable advantage.

## Capital doctrine

Do not buy compute because larger numbers feel like progress.

Increase spend only when a measured bottleneck proves that more compute/data/tooling has positive expected value.

Initial order of operations:

1. Use existing ChatGPT/Codex/GitHub/web/connector capacity fully.
2. Prove one recurring high-value workload.
3. Measure latency, token use, tool failure rate, and human intervention.
4. Buy provider API credits or cloud compute only for a named bottleneck.
5. Prefer revenue-funded upgrades over speculative infrastructure spend.

## v0 success criteria

ULTRA INSTINCT Graph v0 is not complete until:

- the claim schema validates;
- at least one ingestion path writes immutable records;
- contradictory records can coexist and be linked;
- a computed current-belief view can explain why one claim is preferred;
- every current belief can trace back to provenance;
- predictions can resolve and receive a score;
- agent outputs cite graph/source IDs;
- a chat query can retrieve a graph neighborhood and fresh evidence;
- no autonomous trade, spend, credential, or irreversible external action occurs without the established human gate.

## Immediate next build

Implement the smallest local persistent store for `stem_claim_v0.1` records using standard-library SQLite before introducing Neo4j, a vector database, or distributed graph infrastructure.

The first store must support:

- append record;
- retrieve record by ID;
- list records by entity;
- list records by predicate/status/time;
- link support/contradiction/supersession;
- derive a simple explainable current-belief view;
- preserve raw provenance hashes;
- deterministic tests for contradiction and correction behavior.

Do not build the visualization before this substrate works.
