/**
 * TASK ROUTER — capability contracts.
 *
 * Work is routed by *capability*, never by provider name. A capability is a
 * claim about what a task needs; an adapter is a claim about what a provider
 * can supply. Swapping providers is then a registry edit, not a rewrite.
 */

export type Capability =
  /** Long-horizon research, document synthesis, broad discovery. (KIMI's lane.) */
  | 'research.long'
  /** Architecture, implementation, debugging, repository work. (CLAUDE's lane.) */
  | 'engineering.build'
  /** Adversarial critique and review of someone else's output. */
  | 'critique'
  /** Strategic reasoning, decision framing, synthesis. (NOVA's lane.) */
  | 'strategy'
  /** High-volume, low-stakes classification and extraction. Cost matters most. */
  | 'classify';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface InferRequest {
  capability: Capability;
  system?: string;
  messages: Message[];
  maxTokens?: number;
  /** Depth/spend hint. Adapters map this onto whatever their provider supports. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Force a specific model, bypassing capability routing. Used by the Gauntlet
   *  when it deliberately wants a different model than the builder's. */
  model?: string;
  timeoutMs?: number;
}

export interface InferResponse {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * Cost in USD, or `null` when this deployment has no verified price for the
   * model. Null is deliberate: a fabricated cost would silently corrupt every
   * downstream evaluation and budget decision. Unknown must stay unknown.
   */
  costUsd: number | null;
  latencyMs: number;
  stopReason?: string;
  /** True when cost could not be computed; surfaced in the ledger and doctor. */
  costUnknown: boolean;
}

/** Per-million-token pricing. Only populate from a verified source. */
export interface Price {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Where this number came from, so staleness is auditable. */
  source: string;
}

export interface Adapter {
  readonly name: string;
  readonly capabilities: readonly Capability[];
  /** The model this adapter uses for a given capability. */
  modelFor(capability: Capability): string;
  /** True when the credentials this adapter needs are actually present. */
  isLive(): boolean;
  /** Human-readable reason the adapter is dark, when it is. */
  darkReason(): string | null;
  complete(req: InferRequest): Promise<InferResponse>;
}

export function priceOf(
  table: Record<string, Price>, model: string, inTok: number, outTok: number,
): { costUsd: number | null; costUnknown: boolean } {
  const p = table[model];
  if (!p) return { costUsd: null, costUnknown: true };
  const cost = (inTok / 1_000_000) * p.inputPerMTok + (outTok / 1_000_000) * p.outputPerMTok;
  return { costUsd: cost, costUnknown: false };
}
