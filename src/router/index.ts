/**
 * TASK ROUTER
 *
 * Chooses an adapter by capability, preferring adapters whose credentials are
 * actually present. Providers light up when their key appears; nothing else in
 * NEXUS changes.
 *
 * The `echo` adapter is not a toy. It is a deterministic, zero-credential
 * provider that lets the Gauntlet, ledger, and evaluation engine be exercised
 * end-to-end before a single API key exists — which is the state the system
 * boots in. It is always ranked last, and it labels its own output so no
 * evaluation can mistake it for real inference.
 */
import type { Adapter, Capability, InferRequest, InferResponse } from './types.ts';
import { AnthropicAdapter } from './adapters/anthropic.ts';
import { moonshot, openai } from './adapters/openai-compat.ts';

export * from './types.ts';

/** Deterministic offline stand-in. Never billed, never mistaken for real output. */
export class EchoAdapter implements Adapter {
  readonly name = 'echo';
  readonly capabilities = [
    'research.long', 'engineering.build', 'critique', 'strategy', 'classify',
  ] as const satisfies readonly Capability[];

  isLive(): boolean { return true; }
  darkReason(): string | null { return null; }
  modelFor(): string { return 'echo-deterministic'; }

  async complete(req: InferRequest): Promise<InferResponse> {
    const last = req.messages.at(-1)?.content ?? '';
    return {
      text: `[echo:${req.capability}] no live provider configured; received ${last.length} chars`,
      provider: this.name,
      model: 'echo-deterministic',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      costUnknown: false,
      latencyMs: 0,
      stopReason: 'end_turn',
    };
  }
}

/**
 * Preference order per capability. First live adapter wins. This encodes the
 * directive's routing intent: research to KIMI, engineering to CLAUDE,
 * strategy and critique to a different model than the one that built the work.
 */
const PREFERENCE: Record<Capability, string[]> = {
  'research.long': ['moonshot', 'openai', 'anthropic'],
  'engineering.build': ['anthropic', 'openai'],
  'strategy': ['openai', 'anthropic', 'moonshot'],
  'critique': ['openai', 'moonshot', 'anthropic'],
  'classify': ['anthropic', 'openai'],
};

export class Router {
  private adapters: Adapter[];

  constructor(adapters?: Adapter[]) {
    this.adapters = adapters ?? [new AnthropicAdapter(), moonshot, openai, new EchoAdapter()];
  }

  all(): Adapter[] { return [...this.adapters]; }

  live(): Adapter[] { return this.adapters.filter((a) => a.isLive()); }

  /** Adapter selected for a capability, honoring preference order. */
  select(capability: Capability, excludeProviders: string[] = []): Adapter {
    const eligible = this.adapters.filter(
      (a) => a.capabilities.includes(capability)
        && a.isLive()
        && !excludeProviders.includes(a.name),
    );
    if (eligible.length === 0) {
      throw new Error(`no live adapter supports capability '${capability}'`);
    }
    const order = PREFERENCE[capability] ?? [];
    eligible.sort((a, b) => {
      // Echo always sorts last so a real provider is never passed over.
      if (a.name === 'echo') return 1;
      if (b.name === 'echo') return -1;
      const ai = order.indexOf(a.name), bi = order.indexOf(b.name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return eligible[0]!;
  }

  async route(req: InferRequest, excludeProviders: string[] = []): Promise<InferResponse> {
    return this.select(req.capability, excludeProviders).complete(req);
  }

  /** Diagnostic view: which providers are live, which are dark, and why. */
  report(): { name: string; live: boolean; reason: string | null; capabilities: string[] }[] {
    return this.adapters.map((a) => ({
      name: a.name,
      live: a.isLive(),
      reason: a.darkReason(),
      capabilities: [...a.capabilities],
    }));
  }
}
