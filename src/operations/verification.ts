import { createHash } from 'node:crypto';
import type { Ledger, LedgerEvent } from '../ledger/index.ts';
import { type OperationsDisplaySnapshot, validateSnapshot } from './types.ts';

const ZERO_SHA256 = '0'.repeat(64);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

/**
 * Hash semantic Operations content without circularly hashing the ledger hash
 * back into itself. Every display record's ledgerRef is normalized to null and
 * all ledger-binding fields are normalized to fixed sentinels.
 */
export function operationsContentSha256(snapshot: OperationsDisplaySnapshot): string {
  const copy = structuredClone(snapshot);
  if (copy.verification) {
    copy.verification.ledgerEventId = 0;
    copy.verification.ledgerHead = ZERO_SHA256;
    copy.verification.ledgerLength = 0;
    copy.verification.contentSha256 = ZERO_SHA256;
  }
  for (const record of [
    ...copy.realityDelta,
    ...copy.opportunityRadar,
    ...copy.orbitalInsight,
    ...copy.operations,
    ...copy.alphaHunter,
  ]) record.ledgerRef = null;
  const canonical = JSON.stringify(canonicalize(copy));
  return createHash('sha256').update(canonical).digest('hex');
}

function committedDigest(event: LedgerEvent): string | null {
  if (!event.evidence || typeof event.evidence !== 'object' || Array.isArray(event.evidence)) return null;
  const value = (event.evidence as Record<string, unknown>).operationsContentSha256;
  return typeof value === 'string' ? value : null;
}

/** Verify both the whole append-only chain and the exact run-end commitment. */
export function verifyOperationsSnapshot(
  snapshot: OperationsDisplaySnapshot,
  ledger: Ledger,
): string[] {
  const errors = validateSnapshot(snapshot);
  const verification = snapshot.verification;
  if (!verification || !snapshot.evidenceGraph) {
    return [...errors, 'runtime verification and evidenceGraph are required'];
  }
  const chain = ledger.verifyChain();
  if (!chain.ok) return [...errors, `ledger chain is invalid at event ${chain.brokenAtId}`];
  if (chain.length < verification.ledgerLength) {
    errors.push('ledger is shorter than the committed Operations prefix');
  }
  const runEvents = ledger.byRun(verification.runId);
  const committed = runEvents.find((event) => event.id === verification.ledgerEventId);
  if (!committed
      || committed.kind !== 'run.end'
      || committed.hash !== verification.ledgerHead
      || committed.id !== verification.ledgerLength
      || runEvents.at(-1)?.id !== committed.id) {
    errors.push('Operations state does not match its committed run-end event');
  } else if (committedDigest(committed) !== verification.contentSha256) {
    errors.push('Operations content digest is absent from or differs from the run-end event');
  }
  if (operationsContentSha256(snapshot) !== verification.contentSha256) {
    errors.push('Operations content does not match its committed digest');
  }
  return errors;
}

export { ZERO_SHA256 };
