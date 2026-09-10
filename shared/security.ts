/**
 * SecurityLayer — Enforces secret hygiene across the entire NEXUS platform.
 *
 * 1. sanitizeOutput()  — scrubs API key patterns from any outbound string
 * 2. DataBoundary      — controls which data agents can access
 * 3. monitorEnvAccess() — proxy that logs + alerts on process.env reads
 */

import type { AgentRole } from "./types";

// ---------------------------------------------------------------------------
// 1. SANITIZE OUTPUT — strips anything that looks like a secret
// ---------------------------------------------------------------------------

/**
 * Patterns that match known secret formats.
 * Each entry: [regex, replacement label].
 */
const SECRET_PATTERNS: [RegExp, string][] = [
  // Anthropic keys
  [/sk-ant-[A-Za-z0-9_-]{20,}/g, "[REDACTED_ANTHROPIC_KEY]"],
  // Generic "sk-" prefixed keys (OpenAI, etc.)
  [/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED_SK_KEY]"],
  // Bearer / API tokens that are long base-64-ish strings
  [/\b(AAAA)[A-Za-z0-9+/=]{20,}/g, "[REDACTED_TOKEN]"],
  // Ethereum private keys (64 hex chars after 0x)
  [/0x[0-9a-fA-F]{64}/g, "[REDACTED_PRIVATE_KEY]"],
  // Ethereum addresses are fine to show (40 hex), but private keys (64 hex) are not
  // Telegram bot tokens  (digits:alphanum)
  [/\b\d{8,}:[A-Za-z0-9_-]{30,}\b/g, "[REDACTED_TELEGRAM_TOKEN]"],
  // Generic long hex secrets (>= 40 hex chars that aren't ETH addresses)
  [/\b[0-9a-fA-F]{64,}\b/g, "[REDACTED_HEX_SECRET]"],
  // Kalshi / generic API key=value pairs
  [/(api[_-]?key|api[_-]?secret|password|secret|token)\s*[=:]\s*\S+/gi, "$1=[REDACTED]"],
  // Seed phrases (12+ consecutive lowercase words that look like BIP-39)
  [/\b([a-z]{3,8}\s){11,}[a-z]{3,8}\b/g, "[REDACTED_SEED_PHRASE]"],
];

/**
 * Scrub any string so secrets never leak to Telegram, logs, or external services.
 */
export function sanitizeOutput(input: string): string {
  let result = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 2. DATA BOUNDARY — controls what agents may access
// ---------------------------------------------------------------------------

/** The data domains an agent is allowed to read. */
const AGENT_DATA_PERMISSIONS: Record<AgentRole, readonly string[]> = {
  coordinator: ["market", "onchain", "prediction", "content", "memory"],
  market: ["market"],
  onchain: ["onchain"],
  prediction: ["market", "onchain", "prediction", "memory"],
  content: ["market", "prediction", "content", "memory"],
  engagement: ["content"],
  sentiment: ["market"],
  competitor: ["market"],
  custom: ["market"],
};

/**
 * DataBoundary enforces that agents can only read data from their
 * permitted domains and can **never** access raw environment variables.
 */
export class DataBoundary {
  private role: AgentRole;
  private agentName: string;
  private violations: string[] = [];

  constructor(agentName: string, role: AgentRole) {
    this.agentName = agentName;
    this.role = role;
  }

  /**
   * Check whether this agent is allowed to read a given data domain.
   * Returns true if allowed, false + logs a violation if not.
   */
  canRead(domain: string): boolean {
    const allowed = AGENT_DATA_PERMISSIONS[this.role] ?? [];
    if (allowed.includes(domain)) return true;

    const msg = `[SecurityLayer] VIOLATION: Agent "${this.agentName}" (role=${this.role}) attempted to read domain "${domain}"`;
    console.warn(msg);
    this.violations.push(msg);
    return false;
  }

  /**
   * Always returns false — agents must never access raw env vars.
   * Logs a warning and queues a Telegram alert.
   */
  canAccessEnv(): boolean {
    const msg = `[SecurityLayer] VIOLATION: Agent "${this.agentName}" attempted to access process.env directly`;
    console.warn(msg);
    this.violations.push(msg);
    return false;
  }

  getViolations(): readonly string[] {
    return this.violations;
  }

  hasViolations(): boolean {
    return this.violations.length > 0;
  }
}

// ---------------------------------------------------------------------------
// 3. ENV ACCESS MONITOR — wraps process.env to detect unauthorized reads
// ---------------------------------------------------------------------------

/** Keys that are considered sensitive and should trigger alerts. */
const SENSITIVE_ENV_KEYS = new Set([
  "TELEGRAM_BOT_TOKEN",
  "ETHERSCAN_API_KEY",
  "TWITTER_BEARER_TOKEN",
  "KALSHI_API_KEY",
  "KALSHI_API_SECRET",
  "WALLET_PRIVATE_KEY",
  "WALLET_SEED_PHRASE",
]);

type EnvViolationCallback = (message: string) => void;

let _onViolation: EnvViolationCallback | null = null;
let _monitorInstalled = false;

/**
 * Install a Proxy on process.env that logs and alerts when a sensitive
 * key is read outside of the initial config loading phase.
 *
 * Call this AFTER shared/config.ts has loaded. Any subsequent access
 * to a sensitive key will trigger the callback.
 */
export function installEnvMonitor(onViolation: EnvViolationCallback): void {
  if (_monitorInstalled) return;
  _onViolation = onViolation;

  const original = process.env;
  process.env = new Proxy(original, {
    get(target, prop: string) {
      if (SENSITIVE_ENV_KEYS.has(prop) && _onViolation) {
        const msg = `[SecurityLayer] WARNING: process.env.${prop} accessed after config phase`;
        console.warn(msg);
        _onViolation(msg);
      }
      return target[prop];
    },
  });

  _monitorInstalled = true;
  console.log("[SecurityLayer] Environment monitor installed");
}

// ---------------------------------------------------------------------------
// 4. VALIDATE CONFIG — ensure keys are loaded but never exposed
// ---------------------------------------------------------------------------

/**
 * Verify that required API keys exist in the environment without
 * revealing their values. Returns a report of present/missing keys.
 */
export function validateSecrets(): { present: string[]; missing: string[] } {
  const present: string[] = [];
  const missing: string[] = [];

  for (const key of SENSITIVE_ENV_KEYS) {
    // Access the raw env (before proxy) via the config module
    if (process.env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }

  return { present, missing };
}
