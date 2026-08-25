import { randomUUID } from 'node:crypto';
import type { Ledger } from '../ledger/index.ts';
import type { Policy } from '../policy/index.ts';
import type { BusMessage, IngestedBusEvent } from './types.ts';

export class BusValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'BusValidationError'; }
}

export class BusAuthorityError extends Error {
  constructor(message: string) { super(message); this.name = 'BusAuthorityError'; }
}

const SECRET_PATTERNS = [
  /\b(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i,
  /\b(?:sk|ghp|github_pat)[_-]?[A-Za-z0-9_]{12,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

const AUTHORITY_PATTERNS = [
  /\b(?:bypass|disable|ignore|override)\b.{0,40}\b(?:policy|guardrail|gate|authorization)\b/i,
  /\b(?:raise|increase|set)\b.{0,25}\bcapital\s+level\b/i,
  /\bgrant\b.{0,30}\b(?:permission|authority|capability)\b/i,
];

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BusValidationError('bus message must be an object');
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BusValidationError(`${field} must be a non-empty string`);
  return value;
}

function parseMessage(raw: unknown): BusMessage {
  const value = object(raw);
  if (value.schemaVersion !== 'nexus.bus.v1') throw new BusValidationError('unsupported bus schemaVersion');
  nonEmptyString(value.id, 'id');
  nonEmptyString(value.sender, 'sender');
  const recipients = value.recipients;
  if (!Array.isArray(recipients) || recipients.length === 0 || recipients.some((r) => typeof r !== 'string')) {
    throw new BusValidationError('recipients must be a non-empty string array');
  }
  if (!recipients.some((r) => r.toLowerCase() === 'nova' || r.toLowerCase() === 'hoot')) {
    throw new BusValidationError('message is not addressed to Nova or Hoot');
  }
  const timestamp = nonEmptyString(value.timestamp, 'timestamp');
  if (Number.isNaN(Date.parse(timestamp))) throw new BusValidationError('timestamp must be ISO-8601 compatible');
  if (!['source.event', 'deliberation', 'response'].includes(String(value.kind))) {
    throw new BusValidationError('unsupported message kind');
  }
  const references = value.references;
  if (!Array.isArray(references) || references.length === 0) throw new BusValidationError('at least one reference is required');
  for (const ref of references) {
    const candidate = object(ref);
    const url = nonEmptyString(candidate.url, 'reference.url');
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new BusValidationError('reference URL must use HTTP(S)');
  }
  const capabilities = value.requestedCapabilities;
  if (capabilities !== undefined && (!Array.isArray(capabilities) || capabilities.some((c) => typeof c !== 'string'))) {
    throw new BusValidationError('requestedCapabilities must be a string array');
  }
  if (value.requestedCapitalLevel !== undefined && typeof value.requestedCapitalLevel !== 'number') {
    throw new BusValidationError('requestedCapitalLevel must be numeric');
  }
  return value as unknown as BusMessage;
}

export class BusAdapter {
  private readonly ledger: Ledger;
  private readonly runId: string;

  constructor(ledger: Ledger, runId: string) {
    this.ledger = ledger;
    this.runId = runId;
  }

  private deny(messageId: string, reason: string): never {
    this.ledger.append({
      runId: this.runId,
      kind: 'policy.deny',
      actor: 'nexus.bus-adapter',
      task: 'reject untrusted bus message',
      payload: { messageId },
      error: reason,
    });
    throw new BusAuthorityError(reason);
  }

  ingest(raw: unknown): IngestedBusEvent {
    const message = parseMessage(raw);
    const duplicate = this.ledger.raw().prepare(
      "SELECT 1 AS found FROM events WHERE actor = ? AND json_extract(payload, '$.messageId') = ? LIMIT 1",
    ).get('nexus.bus-adapter', message.id) as { found: number } | undefined;
    if (duplicate) throw new BusValidationError(`message '${message.id}' was already processed`);
    const serialized = JSON.stringify(message);
    if (SECRET_PATTERNS.some((pattern) => pattern.test(serialized))) {
      return this.deny(message.id, 'secret-shaped content is forbidden on the bus');
    }
    const requestsCapabilities = (message.requestedCapabilities?.length ?? 0) > 0;
    const requestsCapital = (message.requestedCapitalLevel ?? 0) > 0;
    if (requestsCapabilities || requestsCapital || AUTHORITY_PATTERNS.some((pattern) => pattern.test(serialized))) {
      return this.deny(message.id, 'bus content attempted to widen authority');
    }
    const ingested: IngestedBusEvent = {
      message,
      trust: 'UNTRUSTED_EXTERNAL',
      authorityWideningDenied: false,
    };
    this.ledger.append({
      runId: this.runId,
      kind: 'discovery',
      actor: 'nexus.bus-adapter',
      task: 'ingest untrusted external bus message',
      inputRef: message.references[0]?.url,
      payload: {
        messageId: message.id,
        sender: message.sender,
        recipients: message.recipients,
        timestamp: message.timestamp,
        kind: message.kind,
        trust: ingested.trust,
      },
      evidence: { references: message.references },
    });
    return ingested;
  }

  createResponse(inbound: IngestedBusEvent, payload: unknown, policy: Policy, explicitlyAllowed: boolean): BusMessage {
    if (!explicitlyAllowed) throw new BusAuthorityError('response writing was not explicitly allowed');
    const ruling = policy.rule({
      capability: 'bus.respond', actor: 'nexus.bus-adapter', blastRadius: 'external',
      summary: `respond to ${inbound.message.id}`, reversible: true,
    });
    if (ruling.decision !== 'allow') throw new BusAuthorityError(`response blocked by policy: ${ruling.reason}`);
    const response: BusMessage = {
      schemaVersion: 'nexus.bus.v1', id: `bus_${randomUUID()}`, sender: 'nova',
      recipients: [inbound.message.sender], timestamp: new Date().toISOString(), kind: 'response',
      payload, references: inbound.message.references,
    };
    const serialized = JSON.stringify(response);
    if (SECRET_PATTERNS.some((pattern) => pattern.test(serialized))) {
      throw new BusAuthorityError('response contains secret-shaped content');
    }
    this.ledger.append({
      runId: this.runId, kind: 'action', actor: 'nexus.bus-adapter',
      task: 'write explicitly authorized bus response', payload: { messageId: response.id },
      evidence: { inReplyTo: inbound.message.id },
    });
    return response;
  }
}
