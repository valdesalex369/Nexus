import { readFileSync } from 'node:fs';
import { runRadar } from './opportunity-radar.ts';
import { createRadarServer, listenRadarServer } from './server.ts';

interface CliOptions {
  once: boolean;
  fixturePath?: string;
  term?: string;
  port: number;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { once: false, port: 8787 };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '--once') options.once = true;
    else if (arg === '--fixture') options.fixturePath = args[++index];
    else if (arg === '--term') options.term = args[++index];
    else if (arg === '--port') options.port = Number(args[++index]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
    throw new Error('--port must be an integer from 0 to 65535');
  }
  if (args.includes('--fixture') && !options.fixturePath) throw new Error('--fixture requires a path');
  if (args.includes('--term') && !options.term) throw new Error('--term requires text');
  return options;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const fixtureRaw = cli.fixturePath ? readFileSync(cli.fixturePath, 'utf8') : undefined;
  const snapshot = await runRadar({
    fixtureRaw,
    fixtureEndpoint: cli.fixturePath ? `fixture://${cli.fixturePath}` : undefined,
    term: cli.term,
  });
  const summary = {
    runId: snapshot.runId,
    mode: snapshot.dataMode,
    source: snapshot.sourceEvent.source.url,
    document: snapshot.sourceEvent.document.document_number,
    opportunityScore: snapshot.opportunities[0]?.score,
    actionStatus: snapshot.action.status,
    ledgerVerified: snapshot.ledger.verified,
    ledgerHead: snapshot.ledger.headHash,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (cli.once) return;
  const server = createRadarServer();
  const address = await listenRadarServer(server, { port: cli.port });
  process.stdout.write(`Opportunity Radar ready at http://${address.host}:${address.port}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Opportunity Radar failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
