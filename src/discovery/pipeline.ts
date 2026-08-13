/**
 * THE DISCOVERY PIPELINE
 *
 *   MISSION -> QUERIES -> SEARCH -> DEDUPE -> RANK -> CLAIMS -> CROSS-CHECK
 *           -> CONTRADICTIONS -> HYPOTHESES -> LEDGER
 *
 * Two rules govern every stage:
 *
 *   1. A provider that fails is recorded as SOURCE_UNAVAILABLE. The pipeline
 *      never substitutes a plausible result for a failed fetch, and a report
 *      built on three dead providers says so on its face.
 *
 *   2. Retrieved text is untrusted. It is scanned on arrival and flagged, and it
 *      is never concatenated into an instruction position. A repository whose
 *      description says "ignore previous instructions" becomes a *claim about
 *      that repository*, not an instruction.
 */
import { createHash } from 'node:crypto';
import { Ledger } from '../ledger/index.ts';
import type { KnowledgeStore } from '../knowledge/store.ts';
import { scan } from '../intake/index.ts';
import {
  dedupe, detectContradictions, extractClaims, crossCheck, inferPrevalence,
  rankSource, unknownClaim, isStale,
} from './claims.ts';
import type {
  Claim, Contradiction, Source, SourceProvider, SourceUnavailable,
} from './types.ts';
import { validateClaim } from './types.ts';

export interface DiscoveryMission {
  question: string;
  /** Explicit queries. When omitted, they are derived from the question. */
  queries?: string[];
  perProviderLimit?: number;
  timeoutMs?: number;
  /** Questions we want answered but may not be able to; recorded as UNKNOWN. */
  openQuestions?: string[];
}

export interface DiscoveryReport {
  runId: string;
  question: string;
  queries: string[];
  providersLive: string[];
  providersUnwired: { name: string; reason: string }[];
  sources: Source[];
  claims: Claim[];
  contradictions: Contradiction[];
  unavailable: SourceUnavailable[];
  duplicatesRemoved: number;
  staleSources: number;
  flaggedSources: number;
  /** True only when at least one provider actually returned data. */
  hasEvidence: boolean;
  elapsedMs: number;
}

/** Terms that add nothing to a search query. */
const STOPWORDS = new Set([
  'what', 'which', 'where', 'when', 'who', 'why', 'how', 'the', 'a', 'an', 'and',
  'or', 'but', 'for', 'with', 'that', 'this', 'these', 'those', 'can', 'could',
  'should', 'would', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in',
  'on', 'at', 'by', 'from', 'about', 'into', 'we', 'our', 'us', 'it', 'its',
  'identify', 'find', 'investigate', 'realistically', 'approximately', 'produce',
]);

/**
 * Derive search queries from a mission deterministically.
 *
 * This is intentionally simple and intentionally honest: it extracts salient
 * terms rather than pretending to understand the question. When a model provider
 * is live, better queries can be generated and passed in via `mission.queries` —
 * but the pipeline never *requires* a model to function, so discovery keeps
 * working when inference is down.
 */
export function deriveQueries(question: string, max = 4): string[] {
  const words = question.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([w]) => w);

  // A single generic term ("small") retrieves whatever is most popular rather
  // than what is relevant, so every query carries at least two terms. The first
  // query combines the strongest terms; the rest pair off down the ranking.
  const queries: string[] = [];
  if (ranked.length >= 2) queries.push(ranked.slice(0, 3).join(' '));
  for (let i = 0; i < ranked.length && queries.length < max; i += 2) {
    const pair = ranked.slice(i, i + 2);
    if (pair.length < 2) break; // never emit a lone term
    const q = pair.join(' ');
    if (!queries.includes(q)) queries.push(q);
  }
  if (queries.length === 0 && question.trim()) queries.push(question.trim().slice(0, 80));
  return queries;
}

export class DiscoveryPipeline {
  private providers: SourceProvider[];
  private store: KnowledgeStore;
  private ledger: Ledger;

  constructor(providers: SourceProvider[], store: KnowledgeStore, ledger: Ledger) {
    this.providers = providers;
    this.store = store;
    this.ledger = ledger;
  }

  async run(mission: DiscoveryMission): Promise<DiscoveryReport> {
    const runId = Ledger.newRunId();
    const started = Date.now();
    const queries = mission.queries?.length ? mission.queries : deriveQueries(mission.question);
    const limit = mission.perProviderLimit ?? 8;
    const timeoutMs = mission.timeoutMs ?? 20_000;

    const live = this.providers.filter((p) => p.status().state === 'live');
    const unwired = this.providers
      .filter((p) => p.status().state === 'unwired')
      .map((p) => {
        const st = p.status();
        return { name: p.name, reason: st.state === 'unwired' ? st.reason : '' };
      });

    this.ledger.append({
      runId, kind: 'run.start', actor: 'discovery', task: mission.question,
      payload: {
        queries,
        providersLive: live.map((p) => p.name),
        providersUnwired: unwired.map((u) => u.name),
      },
    });

    // Every unwired provider is recorded, so a thin report is explicable.
    const unavailable: SourceUnavailable[] = [];
    for (const u of unwired) {
      const rec: SourceUnavailable = {
        provider: u.name, query: '(not attempted)', reason: u.reason,
        at: new Date().toISOString(),
      };
      unavailable.push(rec);
      this.store.putUnavailable(rec, runId);
    }

    // ---- SEARCH -----------------------------------------------------------
    const rawResults: { provider: SourceProvider; query: string; results: Awaited<ReturnType<SourceProvider['search']>> }[] = [];
    for (const provider of live) {
      for (const query of queries) {
        try {
          const results = await provider.search(query, { limit, timeoutMs });
          rawResults.push({ provider, query, results });
          this.ledger.append({
            runId, kind: 'action', actor: `provider:${provider.name}`,
            task: query, payload: { returned: results.length },
          });
        } catch (err) {
          const rec: SourceUnavailable = {
            provider: provider.name, query,
            reason: (err as Error).message.slice(0, 300),
            at: new Date().toISOString(),
          };
          unavailable.push(rec);
          this.store.putUnavailable(rec, runId);
          this.ledger.append({
            runId, kind: 'error', actor: `provider:${provider.name}`,
            task: query, error: rec.reason,
          });
        }
      }
    }

    // ---- DEDUPE -----------------------------------------------------------
    const flat = rawResults.flatMap((r) => r.results.map((res) => ({ ...res, _p: r.provider })));
    const { kept, removed } = dedupe(flat);

    // ---- SOURCES + CLAIMS -------------------------------------------------
    const sources: Source[] = [];
    let claims: Claim[] = [];
    let flaggedSources = 0;
    let staleSources = 0;

    for (const result of kept) {
      const provider = (result as typeof result & { _p: SourceProvider })._p;
      const rawJson = JSON.stringify(result.raw ?? {});

      // Preserve the original payload before anything derived from it exists.
      const artifact = this.store.putRaw(rawJson, `${provider.name}:result`, result.url);

      // Retrieved text is untrusted. Scan title + snippet, not just one.
      const flags = scan(`${result.title}\n${result.snippet}`);
      if (flags.length) flaggedSources++;

      const { reliability, signals } = rankSource(result, provider.kind);
      const source: Source = {
        id: `src_${createHash('sha256').update(result.url || result.title).digest('hex').slice(0, 16)}`,
        kind: provider.kind, provider: provider.name,
        url: result.url, title: result.title, author: result.author,
        retrievedAt: new Date().toISOString(), publishedAt: result.publishedAt,
        sha256: artifact.sha256,
        // Flagged content is downgraded, not discarded — it is still evidence
        // about the thing that carried it.
        reliability: flags.length ? Math.min(reliability, 0.3) : reliability,
        reliabilitySignals: flags.length ? [...signals, `FLAGGED: ${flags.join(', ')}`] : signals,
        flags,
      };
      if (isStale(source)) staleSources++;
      sources.push(source);
      this.store.putSource(source);

      this.store.derive(artifact.sha256, 'PARSED',
        JSON.stringify({ title: result.title, url: result.url, snippet: result.snippet }),
        'parsed-result');

      claims.push(...extractClaims(source, result));
    }

    // ---- CROSS-CHECK ------------------------------------------------------
    const boosted = crossCheck(claims);
    claims = claims.map((c) => ({ ...c, confidence: boosted.get(c.id) ?? c.confidence }));

    // ---- INFERENCE (cites the claims it came from) ------------------------
    for (const predicate of ['stars', 'downloads', 'popularity']) {
      const inf = inferPrevalence(claims, predicate,
        `derived from retrieved results, not from any single source`);
      if (inf) claims.push(inf);
    }

    // ---- UNKNOWNS (recorded, never silently dropped) ----------------------
    for (const q of mission.openQuestions ?? []) claims.push(unknownClaim(q));
    for (const u of unwired) {
      claims.push(unknownClaim(
        `what would the '${u.name}' source class have shown? (provider unwired: ${u.reason})`));
    }

    // ---- VALIDATE PROVENANCE ---------------------------------------------
    const sourceIds = new Set(sources.map((s) => s.id));
    const claimIds = new Set(claims.map((c) => c.id));
    const validated: Claim[] = [];
    for (const c of claims) {
      try {
        validateClaim(c, sourceIds, claimIds);
        validated.push(c);
        this.store.putClaim(c, runId);
      } catch (err) {
        // A claim that cannot support itself is dropped and the drop is recorded.
        this.ledger.append({
          runId, kind: 'policy.deny', actor: 'discovery',
          task: 'claim rejected for provenance failure',
          payload: { claimId: c.id, classification: c.classification },
          error: (err as Error).message,
        });
      }
    }
    claims = validated;

    // ---- CONTRADICTIONS ---------------------------------------------------
    const providerBySource = new Map(sources.map((s) => [s.id, s.provider]));
    const contradictions = detectContradictions(claims, (id) => providerBySource.get(id));
    for (const x of contradictions) this.store.putContradiction(x, runId);

    const report: DiscoveryReport = {
      runId, question: mission.question, queries,
      providersLive: live.map((p) => p.name), providersUnwired: unwired,
      sources, claims, contradictions, unavailable,
      duplicatesRemoved: removed, staleSources, flaggedSources,
      hasEvidence: sources.length > 0,
      elapsedMs: Date.now() - started,
    };

    this.ledger.append({
      runId, kind: 'run.end', actor: 'discovery', task: mission.question,
      payload: {
        sources: sources.length,
        claims: claims.length,
        observed: claims.filter((c) => c.classification === 'OBSERVED').length,
        inferred: claims.filter((c) => c.classification === 'INFERRED').length,
        unknown: claims.filter((c) => c.classification === 'UNKNOWN').length,
        contradictions: contradictions.length,
        unavailable: unavailable.length,
        hasEvidence: report.hasEvidence,
      },
      evidence: sources.slice(0, 25).map((s) => ({
        id: s.id, url: s.url, sha256: s.sha256, reliability: s.reliability,
      })),
      latencyMs: report.elapsedMs,
      confidence: sources.length
        ? sources.reduce((a, s) => a + s.reliability, 0) / sources.length : 0,
    });

    return report;
  }
}
