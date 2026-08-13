/**
 * OpenAI-compatible adapter.
 *
 * Moonshot (KIMI), OpenAI, DeepSeek and Groq all expose the same
 * `/chat/completions` contract, so one adapter covers them; only the base URL,
 * key, and model names differ. Raw HTTP is used deliberately — these are not
 * Anthropic endpoints, and pulling a vendor SDK per provider would trade a
 * dependency for nothing.
 *
 * Pricing is intentionally EMPTY by default. NEXUS records an unknown cost as
 * unknown rather than inventing a number, because a fabricated price would
 * silently corrupt the evaluation engine and every budget decision built on it.
 * Supply verified prices via NEXUS_PRICES_JSON to switch cost tracking on.
 */
import type { Adapter, Capability, InferRequest, InferResponse, Price } from '../types.ts';
import { priceOf } from '../types.ts';

export interface OpenAICompatConfig {
  name: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
  defaultBaseUrl: string;
  capabilities: readonly Capability[];
  modelByCapability: Partial<Record<Capability, string>>;
  fallbackModel: string;
}

/**
 * Operator-supplied pricing, e.g.
 *   NEXUS_PRICES_JSON='{"kimi-k2":{"inputPerMTok":0.6,"outputPerMTok":2.5,"source":"moonshot docs 2026-08"}}'
 */
function loadOperatorPrices(): Record<string, Price> {
  const raw = process.env.NEXUS_PRICES_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Price>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // A malformed price table must not fabricate prices, and must not crash
    // the router. Fall back to "unknown" and let `doctor` report it.
    return {};
  }
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenAICompatAdapter implements Adapter {
  readonly name: string;
  readonly capabilities: readonly Capability[];

  private cfg: OpenAICompatConfig;

  constructor(cfg: OpenAICompatConfig) {
    this.cfg = cfg;
    this.name = cfg.name;
    this.capabilities = cfg.capabilities;
  }

  isLive(): boolean { return Boolean(process.env[this.cfg.apiKeyEnv]); }

  darkReason(): string | null {
    return this.isLive() ? null : `${this.cfg.apiKeyEnv} is not set`;
  }

  modelFor(capability: Capability): string {
    return this.cfg.modelByCapability[capability] ?? this.cfg.fallbackModel;
  }

  private baseUrl(): string {
    return process.env[this.cfg.baseUrlEnv] || this.cfg.defaultBaseUrl;
  }

  async complete(req: InferRequest): Promise<InferResponse> {
    if (!this.isLive()) throw new Error(`${this.name} adapter is dark: ${this.darkReason()}`);
    const model = req.model ?? this.modelFor(req.capability);
    const started = Date.now();

    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(`${this.baseUrl().replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env[this.cfg.apiKeyEnv]}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: req.maxTokens ?? 8_000 }),
      signal: AbortSignal.timeout(req.timeoutMs ?? 180_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${this.name} HTTP ${res.status}: ${body.slice(0, 400)}`);
    }

    const json = (await res.json()) as ChatCompletionResponse;
    if (json.error) throw new Error(`${this.name} error: ${json.error.message ?? 'unknown'}`);

    const latencyMs = Date.now() - started;
    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;
    const { costUsd, costUnknown } = priceOf(loadOperatorPrices(), model, inputTokens, outputTokens);

    return {
      text: json.choices?.[0]?.message?.content ?? '',
      provider: this.name, model, inputTokens, outputTokens,
      costUsd, costUnknown, latencyMs,
      stopReason: json.choices?.[0]?.finish_reason,
    };
  }
}

/** KIMI — long-horizon research and document intelligence. */
export const moonshot = new OpenAICompatAdapter({
  name: 'moonshot',
  apiKeyEnv: 'MOONSHOT_API_KEY',
  baseUrlEnv: 'MOONSHOT_BASE_URL',
  defaultBaseUrl: 'https://api.moonshot.ai/v1',
  capabilities: ['research.long', 'strategy', 'critique'],
  modelByCapability: { 'research.long': 'kimi-k2-0711-preview' },
  fallbackModel: 'kimi-k2-0711-preview',
});

/** NOVA's default substrate — strategic reasoning and adversarial critique. */
export const openai = new OpenAICompatAdapter({
  name: 'openai',
  apiKeyEnv: 'OPENAI_API_KEY',
  baseUrlEnv: 'OPENAI_BASE_URL',
  defaultBaseUrl: 'https://api.openai.com/v1',
  capabilities: ['strategy', 'critique', 'classify', 'research.long'],
  modelByCapability: {},
  fallbackModel: 'gpt-5',
});
