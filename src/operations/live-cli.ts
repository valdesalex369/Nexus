import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Router } from '../router/index.ts';
import { runLiveOperations, type LiveOperationsResult } from './live-loop.ts';
import {
  createOperationsServer,
  listenOperationsServer,
  readVerifiedOperationsState,
  type OperationsRuntimeStatus,
  type RuntimeProviderStatus,
} from './server.ts';

export interface CliOptions {
  once: boolean;
  fixturePath?: string;
  term?: string;
  port: number;
  intervalMinutes: number;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { once: false, port: 8787, intervalMinutes: 20 };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '--once') options.once = true;
    else if (arg === '--fixture') options.fixturePath = args[++index];
    else if (arg === '--term') options.term = args[++index];
    else if (arg === '--port') options.port = Number(args[++index]);
    else if (arg === '--interval-minutes') options.intervalMinutes = Number(args[++index]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
    throw new Error('--port must be an integer from 0 to 65535');
  }
  if (!Number.isFinite(options.intervalMinutes)
    || options.intervalMinutes < 1
    || options.intervalMinutes > 1_440) {
    throw new Error('--interval-minutes must be from 1 to 1440');
  }
  if (args.includes('--fixture') && !options.fixturePath) throw new Error('--fixture requires a path');
  if (args.includes('--term') && !options.term) throw new Error('--term requires text');
  return options;
}

type ProviderReport = ReturnType<Router['report']>[number];

export function runtimeProviders(report: ProviderReport[] = new Router().report()): RuntimeProviderStatus[] {
  return report.map((provider) => {
    if (provider.name === 'echo') {
      return {
        name: provider.name,
        state: 'DETERMINISTIC_FALLBACK',
        reason: 'Local deterministic fallback; this is not a connected AI model.',
        capabilities: provider.capabilities,
      };
    }
    return {
      name: provider.name,
      state: provider.live ? 'CONFIGURED_UNVERIFIED' : 'DISCONNECTED',
      reason: provider.live
        ? 'Credential detected; connection and inference are not verified.'
        : provider.reason ?? 'Required credential is not configured.',
      capabilities: provider.capabilities,
    };
  });
}

export function createRuntimeStatus(
  intervalMinutes: number,
  report?: ProviderReport[],
  now: () => Date = () => new Date(),
): OperationsRuntimeStatus {
  return {
    mode: 'WATCH',
    state: 'STARTING',
    intervalMinutes,
    startedAt: now().toISOString(),
    cycleRunning: false,
    cycleCount: 0,
    successfulCycles: 0,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastSuccessAt: null,
    nextCycleAt: null,
    lastRunId: null,
    lastError: null,
    providers: runtimeProviders(report),
  };
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 300) || 'Unknown cycle failure';
}

export async function runTrackedCycle(
  status: OperationsRuntimeStatus,
  runCycle: () => Promise<LiveOperationsResult>,
  now: () => Date = () => new Date(),
): Promise<LiveOperationsResult | null> {
  status.state = 'RUNNING';
  status.cycleRunning = true;
  status.lastStartedAt = now().toISOString();
  status.nextCycleAt = null;
  try {
    const result = await runCycle();
    status.cycleCount += 1;
    status.successfulCycles += 1;
    status.lastCompletedAt = now().toISOString();
    status.lastSuccessAt = status.lastCompletedAt;
    status.lastRunId = result.snapshot.verification?.runId ?? null;
    status.lastError = null;
    status.state = 'IDLE';
    return result;
  } catch (error) {
    status.cycleCount += 1;
    status.lastCompletedAt = now().toISOString();
    status.lastError = safeError(error);
    status.state = 'DEGRADED';
    return null;
  } finally {
    status.cycleRunning = false;
  }
}

interface TimerApi {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export interface OperationsWatchController {
  runNow(): Promise<void>;
  stop(): void;
}

export function startOperationsWatch(options: {
  status: OperationsRuntimeStatus;
  intervalMs: number;
  runCycle: () => Promise<LiveOperationsResult>;
  now?: () => Date;
  timers?: TimerApi;
}): OperationsWatchController {
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error('watch interval must be a positive number of milliseconds');
  }
  const now = options.now ?? (() => new Date());
  const timers = options.timers ?? {
    set: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
    clear: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  let stopped = false;
  let timer: unknown = null;
  let active: Promise<void> | null = null;

  const schedule = (): void => {
    if (stopped) return;
    options.status.nextCycleAt = new Date(now().getTime() + options.intervalMs).toISOString();
    timer = timers.set(() => {
      timer = null;
      void runNow();
    }, options.intervalMs);
  };

  const runNow = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (active) return active;
    if (timer !== null) {
      timers.clear(timer);
      timer = null;
    }
    active = runTrackedCycle(options.status, options.runCycle, now)
      .then(() => undefined)
      .finally(() => {
        active = null;
        schedule();
      });
    return active;
  };

  schedule();
  return {
    runNow,
    stop() {
      stopped = true;
      options.status.nextCycleAt = null;
      if (timer !== null) {
        timers.clear(timer);
        timer = null;
      }
    },
  };
}

function printResult(result: LiveOperationsResult): void {
  const verification = result.snapshot.verification!;
  const opportunity = result.snapshot.opportunityRadar[0]!;
  process.stdout.write(`${JSON.stringify({
    runId: verification.runId,
    mode: verification.dataMode,
    document: verification.sourceDocumentNumber,
    sourceSha256: verification.sourceSha256,
    wayfinderStatus: opportunity.score.status,
    opportunityScore: opportunity.score.total,
    actionState: result.snapshot.operations[0]?.actionState,
    ledgerHead: verification.ledgerHead,
  }, null, 2)}\n`);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const cli = parseArgs(args);
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const fixtureRaw = cli.fixturePath ? readFileSync(cli.fixturePath, 'utf8') : undefined;
  const runtimeRoot = resolve(process.env.NEXUS_RUNTIME_ROOT ?? join(process.cwd(), '.nexus-runtime'));
  mkdirSync(runtimeRoot, { recursive: true });
  const snapshotPath = process.env.NEXUS_OPERATIONS_SNAPSHOT ?? join(runtimeRoot, 'data', 'operations', 'current.json');
  const ledgerPath = process.env.NEXUS_DB ?? join(runtimeRoot, 'data', 'nexus.db');
  const knowledgeDbPath = process.env.NEXUS_KNOWLEDGE_DB ?? join(runtimeRoot, 'data', 'knowledge.db');
  const blobDir = process.env.NEXUS_BLOB_DIR ?? join(runtimeRoot, 'data', 'raw');
  const briefDir = process.env.NEXUS_OPERATIONS_BRIEF_DIR ?? join(runtimeRoot, 'data', 'operations', 'briefs');
  const cycle = () => runLiveOperations({
      runtimeRoot,
      fixtureRaw,
      fixtureEndpoint: cli.fixturePath ? `fixture://${cli.fixturePath}` : undefined,
      term: cli.term,
      snapshotPath,
      ledgerPath,
      knowledgeDbPath,
      blobDir,
      briefDir,
    });
  const runtimeStatus = createRuntimeStatus(cli.intervalMinutes);
  const initial = await runTrackedCycle(runtimeStatus, cycle);
  if (initial) {
    printResult(initial);
  } else if (cli.once) {
    throw new Error(runtimeStatus.lastError ?? 'initial Operations cycle failed');
  } else {
    try {
      const prior = readVerifiedOperationsState({ snapshotPath, ledgerPath });
      runtimeStatus.lastRunId = prior.verification?.runId ?? null;
      runtimeStatus.lastSuccessAt = prior.generatedAt;
      process.stderr.write(`Initial cycle failed; serving the last ledger-verified state: ${runtimeStatus.lastError}\n`);
    } catch {
      throw new Error(`initial Operations cycle failed with no verified state to serve: ${runtimeStatus.lastError}`);
    }
  }
  if (cli.once) return;

  const server = createOperationsServer({
    snapshotPath,
    ledgerPath,
    runtimeStatus: () => runtimeStatus,
  });
  const address = await listenOperationsServer(server, { port: cli.port });
  const watch = startOperationsWatch({
    status: runtimeStatus,
    intervalMs: cli.intervalMinutes * 60_000,
    runCycle: cycle,
  });
  process.stdout.write(`Operations ready at http://${address.host}:${address.port}\n`);
  process.stdout.write(`Background watch active every ${cli.intervalMinutes} minutes; no model inference or external action is enabled.\n`);

  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    watch.stop();
    server.close((error) => {
      if (error) {
        process.stderr.write(`Operations shutdown failed: ${error.message}\n`);
        process.exitCode = 1;
      }
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    process.stderr.write(`Operations live loop failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
