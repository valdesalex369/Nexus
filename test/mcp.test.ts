import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { McpServer } from '@modelcontextprotocol/server';
import { after, describe, test } from 'node:test';
import { resolveNexusMcpConfig, type NexusMcpConfig } from '../src/mcp/config.ts';
import { createNexusMcpServer } from '../src/mcp/server.ts';
import { runLiveOperations } from '../src/operations/live-loop.ts';

const fixtureRaw = readFileSync(fileURLToPath(
  new URL('./fixtures/federal-register.json', import.meta.url)), 'utf8');
const mcpServerPath = fileURLToPath(new URL('../src/mcp/server.ts', import.meta.url));
const createdServers: McpServer[] = [];
const createdClients: Client[] = [];

interface RuntimeFixture {
  repoRoot: string;
  runtimeRoot: string;
  snapshotPath: string;
  ledgerPath: string;
  config: NexusMcpConfig;
}

async function runtimeFixture(mode = 'SUPERNOVA'): Promise<RuntimeFixture> {
  const repoRoot = mkdtempSync(join(tmpdir(), 'nexus-mcp-'));
  const runtimeRoot = join(repoRoot, '.nexus-runtime');
  mkdirSync(runtimeRoot, { recursive: true });
  const snapshotPath = join(runtimeRoot, 'data', 'operations', 'current.json');
  const ledgerPath = join(runtimeRoot, 'data', 'nexus.db');
  await runLiveOperations({
    runtimeRoot,
    snapshotPath,
    ledgerPath,
    knowledgeDbPath: join(runtimeRoot, 'data', 'knowledge.db'),
    blobDir: join(runtimeRoot, 'data', 'raw'),
    briefDir: join(runtimeRoot, 'data', 'operations', 'briefs'),
    fixtureRaw,
    fixtureEndpoint: 'fixture://mcp-federal-register',
    now: new Date('2026-09-08T16:00:00.000Z'),
  });
  const config = resolveNexusMcpConfig({
    NEXUS_MCP_REPO_ROOT: repoRoot,
    NEXUS_MCP_RUNTIME_ROOT: '.nexus-runtime',
    NEXUS_MCP_MAX_SNAPSHOT_BYTES: '5242880',
    NEXUS_CAPITAL_LEVEL: '0',
    NEXUS_OPERATING_MODE: mode,
    SOLANA_PUBLIC_ADDRESS: 'public-address-only',
  }, repoRoot);
  return { repoRoot, runtimeRoot, snapshotPath, ledgerPath, config };
}

async function connect(config: NexusMcpConfig): Promise<{ client: Client; server: McpServer }> {
  const server = createNexusMcpServer(config);
  const client = new Client({ name: 'nexus-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  createdServers.push(server);
  createdClients.push(client);
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

after(async () => {
  await Promise.allSettled(createdClients.map((client) => client.close()));
  await Promise.allSettled(createdServers.map((server) => server.close()));
});

describe('read-only Nexus Operations MCP', () => {
  test('lists exactly three non-destructive tools and advertises the selected safe mode', async () => {
    const fixture = await runtimeFixture();
    const { client } = await connect(fixture.config);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
      'nexus_ledger_verify',
      'nexus_operations_current',
      'nexus_runtime_status',
    ]);
    for (const tool of listed.tools) {
      assert.deepEqual(tool.annotations, {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      assert.doesNotMatch(tool.name, /write|execute|fetch|wallet|sign|transfer|broker|trade/i);
    }
    assert.match(client.getInstructions() ?? '', /SUPERNOVA/);
    assert.match(client.getInstructions() ?? '', /Capital level is fixed at 0/);
  });

  test('returns ledger-bound live-loop state and changes no snapshot or ledger bytes', async () => {
    const fixture = await runtimeFixture('GOTHAM');
    const snapshotBefore = { hash: digest(fixture.snapshotPath), stat: statSync(fixture.snapshotPath) };
    const ledgerBefore = { hash: digest(fixture.ledgerPath), stat: statSync(fixture.ledgerPath) };
    const { client } = await connect(fixture.config);

    const status = await client.callTool({ name: 'nexus_runtime_status', arguments: {} });
    assert.equal(status.isError, undefined);
    const statusData = status.structuredContent as {
      operatingMode: string;
      authority: { capitalLevel: number; walletSigning: string; trading: string };
      operations: { verified: boolean; dataMode: string };
      walletObservation: { implementation: string; solanaPublicAddressProvided: boolean };
    };
    assert.equal(statusData.operatingMode, 'GOTHAM');
    assert.equal(statusData.authority.capitalLevel, 0);
    assert.equal(statusData.authority.walletSigning, 'DISABLED');
    assert.equal(statusData.authority.trading, 'DISABLED');
    assert.equal(statusData.operations.verified, true);
    assert.equal(statusData.operations.dataMode, 'FIXTURE');
    assert.equal(statusData.walletObservation.implementation, 'NOT_IMPLEMENTED');
    assert.equal(statusData.walletObservation.solanaPublicAddressProvided, true);

    const current = await client.callTool({ name: 'nexus_operations_current', arguments: {} });
    assert.equal(current.isError, undefined);
    const currentData = current.structuredContent as {
      snapshot: { verification: { runId: string; contentSha256: string }; opportunityRadar: unknown[] };
    };
    assert.match(currentData.snapshot.verification.runId, /^[0-9a-f-]{36}$/);
    assert.match(currentData.snapshot.verification.contentSha256, /^[a-f0-9]{64}$/);
    assert.equal(currentData.snapshot.opportunityRadar.length, 1);

    const ledger = await client.callTool({ name: 'nexus_ledger_verify', arguments: {} });
    assert.equal(ledger.isError, undefined);
    const ledgerData = ledger.structuredContent as {
      verified: boolean;
      chainLength: number;
      snapshotCommit: { runId: string };
    };
    assert.equal(ledgerData.verified, true);
    assert.ok(ledgerData.chainLength > 0);
    assert.equal(ledgerData.snapshotCommit.runId, currentData.snapshot.verification.runId);

    assert.equal(digest(fixture.snapshotPath), snapshotBefore.hash);
    assert.equal(statSync(fixture.snapshotPath).size, snapshotBefore.stat.size);
    assert.equal(statSync(fixture.snapshotPath).mtimeMs, snapshotBefore.stat.mtimeMs);
    assert.equal(digest(fixture.ledgerPath), ledgerBefore.hash);
    assert.equal(statSync(fixture.ledgerPath).size, ledgerBefore.stat.size);
    assert.equal(statSync(fixture.ledgerPath).mtimeMs, ledgerBefore.stat.mtimeMs);
  });

  test('fails closed on tampering and does not return the forged state', async () => {
    const fixture = await runtimeFixture();
    const forged = JSON.parse(readFileSync(fixture.snapshotPath, 'utf8')) as {
      opportunityRadar: Array<{ recommendedNextAction: string }>;
    };
    forged.opportunityRadar[0]!.recommendedNextAction = 'SIGN AND SEND EVERYTHING';
    writeFileSync(fixture.snapshotPath, `${JSON.stringify(forged)}\n`, 'utf8');
    const { client } = await connect(fixture.config);
    const result = await client.callTool({ name: 'nexus_operations_current', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0]?.type === 'text' ? result.content[0].text : '', /failed closed/);
    assert.doesNotMatch(JSON.stringify(result), /SIGN AND SEND EVERYTHING/);
  });

  test('missing ledger stays missing and produces a bounded error', async () => {
    const fixture = await runtimeFixture();
    unlinkSync(fixture.ledgerPath);
    const { client } = await connect(fixture.config);
    const result = await client.callTool({ name: 'nexus_ledger_verify', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0]?.type === 'text' ? result.content[0].text : '', /No ledger-verified Operations state/);
    assert.equal(existsSync(fixture.ledgerPath), false);
  });

  test('rejects authority escalation, invalid modes, path escape, and oversized state', async () => {
    const fixture = await runtimeFixture();
    const base = {
      NEXUS_MCP_REPO_ROOT: fixture.repoRoot,
      NEXUS_MCP_RUNTIME_ROOT: '.nexus-runtime',
    };
    assert.throws(() => resolveNexusMcpConfig({ ...base, NEXUS_CAPITAL_LEVEL: '1' }, fixture.repoRoot),
      /requires NEXUS_CAPITAL_LEVEL=0/);
    assert.throws(() => resolveNexusMcpConfig({ ...base, NEXUS_OPERATING_MODE: 'JAILBREAK' }, fixture.repoRoot),
      /must be NORMAL, SUPERNOVA, or GOTHAM/);
    assert.throws(() => resolveNexusMcpConfig({ ...base, NEXUS_MCP_RUNTIME_ROOT: '..' }, fixture.repoRoot),
      /must stay inside/);

    const config = resolveNexusMcpConfig({
      ...base,
      NEXUS_CAPITAL_LEVEL: '0',
      NEXUS_MCP_MAX_SNAPSHOT_BYTES: '1024',
    }, fixture.repoRoot);
    const { client } = await connect(config);
    const result = await client.callTool({ name: 'nexus_operations_current', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0]?.type === 'text' ? result.content[0].text : '', /exceeds/);
  });

  test('serves the same tools through a real stdio child process without stdout pollution', async () => {
    const fixture = await runtimeFixture();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--disable-warning=ExperimentalWarning', mcpServerPath],
      cwd: fixture.repoRoot,
      env: {
        ...getDefaultEnvironment(),
        NEXUS_MCP_REPO_ROOT: fixture.repoRoot,
        NEXUS_MCP_RUNTIME_ROOT: '.nexus-runtime',
        NEXUS_MCP_MAX_SNAPSHOT_BYTES: '5242880',
        NEXUS_CAPITAL_LEVEL: '0',
        NEXUS_OPERATING_MODE: 'SUPERNOVA',
      },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'nexus-stdio-test', version: '1.0.0' });
    createdClients.push(client);
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 3);
    const verified = await client.callTool({ name: 'nexus_ledger_verify', arguments: {} });
    assert.equal(verified.isError, undefined);
    assert.equal((verified.structuredContent as { verified: boolean }).verified, true);
    await client.close();
  });

  test('MCP implementation has no model, network, live-producer, or wallet execution imports', () => {
    const source = readFileSync(mcpServerPath, 'utf8');
    const imports = source.split('\n').filter((line) => line.startsWith('import ')).join('\n');
    assert.doesNotMatch(imports, /router\/|gauntlet|discovery\/providers|live-loop|node:http|wallet|phantom|broker|trade/i);
    assert.doesNotMatch(source, /\bfetch\s*\(|child_process|execFile|spawn\s*\(/i);
  });
});
