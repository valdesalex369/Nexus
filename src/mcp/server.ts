import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { Ledger } from '../ledger/index.ts';
import { readVerifiedOperationsState } from '../operations/server.ts';
import type { OperationsDisplaySnapshot } from '../operations/types.ts';
import {
  confinedMcpFile,
  loadLocalEnv,
  modeInstructions,
  resolveNexusMcpConfig,
  type NexusMcpConfig,
} from './config.ts';

const emptyInput = z.object({}).strict();
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function ok(value: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function unavailable(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

function verifiedState(config: NexusMcpConfig): OperationsDisplaySnapshot {
  const snapshotPath = confinedMcpFile(config.runtimeRoot, config.snapshotPath, 'Operations snapshot');
  const ledgerPath = confinedMcpFile(config.runtimeRoot, config.ledgerPath, 'Operations ledger');
  return readVerifiedOperationsState({
    snapshotPath,
    ledgerPath,
    maxSnapshotBytes: config.maxSnapshotBytes,
  });
}

function sanitizedUnavailable(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/does not exist|ENOENT|no such file/i.test(message)) {
    return 'No ledger-verified Operations state is available. Run the bounded Operations producer first.';
  }
  if (/exceeds the read limit/i.test(message)) {
    return 'The Operations snapshot exceeds the configured read limit and was rejected.';
  }
  return 'Operations verification failed closed; no unverified state was returned.';
}

function snapshotSummary(snapshot: OperationsDisplaySnapshot): Record<string, unknown> {
  const verification = snapshot.verification!;
  return {
    available: true,
    verified: true,
    runId: verification.runId,
    dataMode: verification.dataMode,
    generatedAt: snapshot.generatedAt,
    verifiedAt: verification.verifiedAt,
    ageSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(snapshot.generatedAt)) / 1_000)),
    deltaStatus: verification.deltaStatus,
    sourceDocumentNumber: verification.sourceDocumentNumber,
    panels: {
      realityDelta: snapshot.realityDelta.length,
      opportunityRadar: snapshot.opportunityRadar.length,
      orbitalInsight: snapshot.orbitalInsight.length,
      operations: snapshot.operations.length,
      alphaHunter: snapshot.alphaHunter.length,
    },
    evidence: {
      sources: snapshot.evidenceGraph!.sources.length,
      claims: snapshot.evidenceGraph!.claims.length,
      contradictions: snapshot.evidenceGraph!.contradictions.length,
      uncertainties: snapshot.evidenceGraph!.uncertainties.length,
    },
  };
}

export function createNexusMcpServer(config: NexusMcpConfig): McpServer {
  const server = new McpServer(
    { name: 'nexus-operations', version: '0.1.0' },
    { instructions: modeInstructions(config.operatingMode) },
  );

  server.registerTool('nexus_runtime_status', {
    title: 'Nexus Runtime Status',
    description: 'Report operating mode, fixed authority, integration truth, and ledger-verified snapshot availability.',
    inputSchema: emptyInput,
    annotations: readOnlyAnnotations,
  }, async () => {
    let operations: Record<string, unknown>;
    try {
      operations = snapshotSummary(verifiedState(config));
    } catch (error) {
      operations = {
        available: false,
        verified: false,
        reason: sanitizedUnavailable(error),
      };
    }
    return ok({
      operatingMode: config.operatingMode,
      focus: modeInstructions(config.operatingMode),
      authority: {
        capitalLevel: config.capitalLevel,
        externalActions: 'DISABLED',
        walletSigning: 'DISABLED',
        trading: 'DISABLED',
      },
      operations,
      modelRuntime: 'NOT_INCLUDED',
      walletObservation: {
        implementation: 'NOT_IMPLEMENTED',
        solanaPublicAddressProvided: config.publicWalletIdentifiersProvided.solana,
        evmPublicAddressProvided: config.publicWalletIdentifiersProvided.evm,
      },
    });
  });

  server.registerTool('nexus_operations_current', {
    title: 'Current Verified Operations State',
    description: 'Return the current Operations snapshot only after schema, digest, run-end, and ledger-chain verification.',
    inputSchema: emptyInput,
    annotations: readOnlyAnnotations,
  }, async () => {
    try {
      return ok({
        operatingMode: config.operatingMode,
        authority: { capitalLevel: 0, externalActions: 'DISABLED' },
        snapshot: verifiedState(config) as unknown as Record<string, unknown>,
      });
    } catch (error) {
      return unavailable(sanitizedUnavailable(error));
    }
  });

  server.registerTool('nexus_ledger_verify', {
    title: 'Verify Nexus Ledger',
    description: 'Verify the append-only ledger chain and its exact commitment to the current Operations snapshot.',
    inputSchema: emptyInput,
    annotations: readOnlyAnnotations,
  }, async () => {
    let ledger: Ledger | undefined;
    try {
      const snapshot = verifiedState(config);
      const ledgerPath = confinedMcpFile(config.runtimeRoot, config.ledgerPath, 'Operations ledger');
      ledger = new Ledger(ledgerPath, { readOnly: true });
      const chain = ledger.verifyChain();
      if (!chain.ok) return unavailable('The Operations ledger chain failed verification.');
      const head = ledger.recent(1)[0];
      return ok({
        verified: true,
        chainLength: chain.length,
        head: head?.hash ?? null,
        snapshotCommit: {
          runId: snapshot.verification!.runId,
          ledgerEventId: snapshot.verification!.ledgerEventId,
          ledgerHead: snapshot.verification!.ledgerHead,
          contentSha256: snapshot.verification!.contentSha256,
        },
      });
    } catch (error) {
      return unavailable(sanitizedUnavailable(error));
    } finally {
      ledger?.close();
    }
  });

  return server;
}

export function main(): void {
  loadLocalEnv();
  const config = resolveNexusMcpConfig();
  serveStdio(() => createNexusMcpServer(config), {
    onerror(error) {
      process.stderr.write(`Nexus MCP transport error: ${error.message}\n`);
    },
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Nexus MCP failed to start: ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}
