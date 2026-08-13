/**
 * Anthropic adapter — engineering, critique, and cheap classification.
 *
 * Uses the official SDK. Notes that are easy to get wrong on the Claude 5 family
 * and are load-bearing here:
 *   - `temperature` / `top_p` / `top_k` are rejected with a 400. We send none.
 *   - `budget_tokens` is gone; depth is `output_config.effort`.
 *   - Thinking is on by default on Opus 5, and `max_tokens` caps thinking *plus*
 *     response text — so max_tokens is sized with headroom.
 *   - Streaming is used because high max_tokens on a non-streaming request
 *     risks an HTTP timeout.
 *   - `stop_reason: "refusal"` arrives as a normal 200 with possibly-empty
 *     content, so it is checked before reading blocks.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Adapter, Capability, InferRequest, InferResponse, Price } from '../types.ts';
import { priceOf } from '../types.ts';

/** Verified against the Anthropic pricing table (USD per million tokens). */
const PRICES: Record<string, Price> = {
  'claude-opus-5': { inputPerMTok: 5, outputPerMTok: 25, source: 'anthropic-pricing' },
  'claude-fable-5': { inputPerMTok: 10, outputPerMTok: 50, source: 'anthropic-pricing' },
  'claude-sonnet-5': { inputPerMTok: 3, outputPerMTok: 15, source: 'anthropic-pricing' },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5, source: 'anthropic-pricing' },
};

const MODEL_BY_CAPABILITY: Record<Capability, string> = {
  'engineering.build': 'claude-opus-5',
  'critique': 'claude-opus-5',
  'strategy': 'claude-opus-5',
  'research.long': 'claude-opus-5',
  'classify': 'claude-haiku-4-5',
};

export class AnthropicAdapter implements Adapter {
  readonly name = 'anthropic';
  readonly capabilities = [
    'engineering.build', 'critique', 'strategy', 'classify',
  ] as const satisfies readonly Capability[];

  private client: Anthropic | null = null;

  isLive(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  }

  darkReason(): string | null {
    return this.isLive() ? null : 'ANTHROPIC_API_KEY is not set';
  }

  modelFor(capability: Capability): string {
    return MODEL_BY_CAPABILITY[capability] ?? 'claude-opus-5';
  }

  private sdk(): Anthropic {
    if (!this.client) this.client = new Anthropic();
    return this.client;
  }

  async complete(req: InferRequest): Promise<InferResponse> {
    if (!this.isLive()) throw new Error(`anthropic adapter is dark: ${this.darkReason()}`);
    const model = req.model ?? this.modelFor(req.capability);
    const started = Date.now();

    const stream = this.sdk().messages.stream({
      model,
      // Headroom: on Opus 5 this ceiling covers thinking and response together.
      max_tokens: req.maxTokens ?? 16_000,
      ...(req.system ? { system: req.system } : {}),
      output_config: { effort: req.effort ?? 'high' },
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const msg = await stream.finalMessage();
    const latencyMs = Date.now() - started;

    if (msg.stop_reason === 'refusal') {
      const category = msg.stop_details?.type === 'refusal'
        ? msg.stop_details.category ?? 'unspecified' : 'unspecified';
      throw new Error(`anthropic declined this request (category: ${category})`);
    }

    const text = msg.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text).join('');

    const inputTokens = msg.usage.input_tokens
      + (msg.usage.cache_read_input_tokens ?? 0)
      + (msg.usage.cache_creation_input_tokens ?? 0);
    const outputTokens = msg.usage.output_tokens;
    const { costUsd, costUnknown } = priceOf(PRICES, model, inputTokens, outputTokens);

    return {
      text, provider: this.name, model, inputTokens, outputTokens,
      costUsd, costUnknown, latencyMs, stopReason: msg.stop_reason ?? undefined,
    };
  }
}
