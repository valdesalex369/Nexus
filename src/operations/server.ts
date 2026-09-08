import { createServer, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { Ledger } from '../ledger/index.ts';
import type { OperationsDisplaySnapshot } from './types.ts';
import { verifyOperationsSnapshot } from './verification.ts';

export type RuntimeProviderState =
  | 'DISCONNECTED'
  | 'CONFIGURED_UNVERIFIED'
  | 'CONNECTED'
  | 'DETERMINISTIC_FALLBACK';

export interface RuntimeProviderStatus {
  name: string;
  state: RuntimeProviderState;
  reason: string;
  capabilities: string[];
  lastVerifiedAt?: string;
}

export interface OperationsRuntimeStatus {
  mode: 'WATCH';
  state: 'STARTING' | 'RUNNING' | 'IDLE' | 'DEGRADED';
  intervalMinutes: number;
  startedAt: string;
  cycleRunning: boolean;
  cycleCount: number;
  successfulCycles: number;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastSuccessAt: string | null;
  nextCycleAt: string | null;
  lastRunId: string | null;
  lastError: string | null;
  providers: RuntimeProviderStatus[];
}

export interface OperationsServerOptions {
  snapshotPath?: string;
  ledgerPath?: string;
  maxSnapshotBytes?: number;
  dashboardPath?: string;
  host?: string;
  port?: number;
  runtimeStatus?: () => OperationsRuntimeStatus;
}

export function readVerifiedOperationsState(options: OperationsServerOptions = {}): OperationsDisplaySnapshot {
  const snapshotPath = options.snapshotPath ?? './data/operations/current.json';
  const ledgerPath = options.ledgerPath ?? process.env.NEXUS_DB ?? './data/nexus.db';
  const maxSnapshotBytes = options.maxSnapshotBytes ?? 5 * 1024 * 1024;
  const snapshotStat = statSync(snapshotPath);
  if (!snapshotStat.isFile()) throw new Error('Operations snapshot is not a file');
  if (snapshotStat.size > maxSnapshotBytes) throw new Error('Operations snapshot exceeds the read limit');
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as OperationsDisplaySnapshot;
  if (!existsSync(ledgerPath)) throw new Error('Operations ledger does not exist');
  const ledger = new Ledger(ledgerPath, { readOnly: true });
  try {
    const errors = verifyOperationsSnapshot(snapshot, ledger);
    if (errors.length > 0) throw new Error(`Operations state is not ledger-verified: ${errors.join('; ')}`);
    return snapshot;
  } finally {
    ledger.close();
  }
}

function securityHeaders(response: ServerResponse): void {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

function currentRuntimeStatus(options: OperationsServerOptions): OperationsRuntimeStatus | null {
  try {
    return options.runtimeStatus ? structuredClone(options.runtimeStatus()) : null;
  } catch {
    return null;
  }
}

function snapshotAgeSeconds(snapshot: OperationsDisplaySnapshot): number | null {
  const generatedAt = Date.parse(snapshot.generatedAt);
  if (!Number.isFinite(generatedAt)) return null;
  return Math.max(0, Math.floor((Date.now() - generatedAt) / 1_000));
}

export function createOperationsServer(options: OperationsServerOptions = {}): Server {
  const dashboardPath = options.dashboardPath ?? './dashboard/index.html';
  return createServer((request, response) => {
    securityHeaders(response);
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/api/operations/current') {
      try {
        const snapshot = readVerifiedOperationsState(options);
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        response.end(`${JSON.stringify(snapshot)}\n`);
      } catch {
        response.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'No ledger-verified Operations state is available.' }));
      }
      return;
    }
    if (pathname === '/health') {
      const runtime = currentRuntimeStatus(options);
      try {
        const snapshot = readVerifiedOperationsState(options);
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({
          ok: true,
          runId: snapshot.verification!.runId,
          generatedAt: snapshot.generatedAt,
          snapshotAgeSeconds: snapshotAgeSeconds(snapshot),
          runtime,
        }));
      } catch {
        response.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ ok: false, runtime }));
      }
      return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      try {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(readFileSync(dashboardPath, 'utf8'));
      } catch {
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Operations dashboard unavailable.');
      }
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}

export async function listenOperationsServer(
  server: Server,
  options: OperationsServerOptions = {},
): Promise<{ host: string; port: number }> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') return { host, port };
  return { host, port: address.port };
}
