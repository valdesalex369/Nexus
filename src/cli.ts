#!/usr/bin/env node
/**
 * NEXUS CLI — the operator surface.
 *
 *   nexus doctor            what is live, what is dark, and exactly why
 *   nexus ledger [n]        recent events
 *   nexus verify            recompute the ledger hash chain
 *   nexus gauntlet <goal>   run a bounded build/critique/verify loop
 */
import { Ledger } from './ledger/index.ts';
import { Policy } from './policy/index.ts';
import { Router } from './router/index.ts';
import { Gauntlet } from './gauntlet/index.ts';
import { CommandVerifier, ContainsVerifier } from './eval/index.ts';

const [, , cmd = 'doctor', ...rest] = process.argv;

function doctor(): number {
  const router = new Router();
  const policy = new Policy();
  const ledger = new Ledger();

  console.log('NEXUS DOCTOR\n' + '='.repeat(60));

  console.log('\nPROVIDERS');
  const rows = router.report();
  for (const r of rows) {
    const status = r.live ? 'LIVE' : 'DARK';
    console.log(`  [${status}] ${r.name.padEnd(10)} ${r.capabilities.join(', ')}`);
    if (!r.live) console.log(`         ${r.reason}`);
  }

  const realProviders = rows.filter((r) => r.live && r.name !== 'echo');
  console.log(`\n  ${realProviders.length} real provider(s) live.`);
  if (realProviders.length === 0) {
    console.log('  The Gauntlet will run on the echo adapter: loop mechanics and the');
    console.log('  ledger are exercised, but no real inference happens. Add a key to change that.');
  } else if (realProviders.length === 1) {
    console.log('  WARNING: only one real provider. The Gauntlet cannot obtain an independent');
    console.log('  critique — the builder would be grading its own work, so critique is skipped');
    console.log('  and the gap is recorded. Add a second provider for adversarial review.');
  }

  console.log('\nGOVERNANCE');
  console.log(policy.describe().split('\n').map((l) => '  ' + l).join('\n'));

  console.log('\nLEDGER');
  const chain = ledger.verifyChain();
  console.log(`  events      : ${ledger.count()}`);
  console.log(`  chain       : ${chain.ok ? `intact (${chain.length} records)`
    : `BROKEN at id ${chain.brokenAtId} — ${chain.reason}`}`);

  console.log('\nCOST TRACKING');
  console.log('  anthropic   : priced from the published table');
  console.log(`  other       : ${process.env.NEXUS_PRICES_JSON
    ? 'operator-supplied via NEXUS_PRICES_JSON'
    : 'UNKNOWN — set NEXUS_PRICES_JSON to enable budget enforcement for non-Anthropic providers'}`);

  ledger.close();
  return chain.ok ? 0 : 1;
}

function showLedger(n: number): number {
  const ledger = new Ledger();
  const events = ledger.recent(n);
  if (events.length === 0) {
    console.log('Ledger is empty. Run `npm run gauntlet -- "<objective>"` to record something.');
  }
  for (const e of events) {
    const cost = e.costUsd ? ` $${e.costUsd.toFixed(4)}` : '';
    const conf = e.confidence !== undefined ? ` conf=${e.confidence.toFixed(2)}` : '';
    console.log(`${e.ts}  #${String(e.id).padStart(4)}  ${e.kind.padEnd(12)} `
      + `${e.actor.padEnd(12)}${cost}${conf}  ${e.task ?? ''}`);
    if (e.error) console.log(`    error: ${e.error}`);
  }
  ledger.close();
  return 0;
}

function verify(): number {
  const ledger = new Ledger();
  const r = ledger.verifyChain();
  if (r.ok) {
    console.log(`Ledger chain intact across ${r.length} records.`);
  } else {
    console.error(`Ledger chain BROKEN at id ${r.brokenAtId}: ${r.reason}`);
  }
  ledger.close();
  return r.ok ? 0 : 1;
}

async function gauntlet(args: string[]): Promise<number> {
  // Split positionals from flags in one pass, so a flag's VALUE never leaks
  // into the objective text.
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      flags.set(a.slice(2), args[i + 1] ?? '');
      i++;
    } else {
      positional.push(a);
    }
  }
  const objective = positional.join(' ');
  if (!objective) {
    console.error('usage: nexus gauntlet "<objective>" [--verify-cmd "<cmd> <args>"] '
      + '[--require "<marker>"] [--max-iterations N] [--budget USD]');
    return 2;
  }
  const flag = (name: string) => flags.get(name);

  const verifyCmd = flag('verify-cmd');
  const require = flag('require');
  const verifier = verifyCmd
    ? (() => {
      const [bin, ...bargs] = verifyCmd.split(/\s+/);
      return new CommandVerifier(verifyCmd, bin!, bargs);
    })()
    : new ContainsVerifier('required-markers', require ? [require] : []);

  const ledger = new Ledger();
  const g = new Gauntlet(new Router(), ledger, new Policy());
  const res = await g.run({
    objective,
    verifier,
    maxIterations: Number(flag('max-iterations') ?? 4),
    budgetUsd: Number(flag('budget') ?? new Policy().config.maxRunUsd),
  });

  console.log(`\nstatus     : ${res.status}`);
  console.log(`reason     : ${res.reason}`);
  console.log(`iterations : ${res.iterations.length}`);
  console.log(`score      : ${res.bestScore.toFixed(2)}`);
  console.log(`cost       : $${res.totalCostUsd.toFixed(4)}${res.costComplete ? '' : ' (INCOMPLETE — unpriced provider)'}`);
  console.log(`elapsed    : ${res.elapsedMs}ms`);
  console.log(`run id     : ${res.runId}`);
  if (res.bestArtifact) console.log(`\n--- best artifact ---\n${res.bestArtifact}`);
  ledger.close();
  return res.status === 'passed' ? 0 : 1;
}

const exit = (code: number) => { process.exitCode = code; };

switch (cmd) {
  case 'doctor': exit(doctor()); break;
  case 'ledger': exit(showLedger(Number(rest[0] ?? 30))); break;
  case 'verify': exit(verify()); break;
  case 'gauntlet': exit(await gauntlet(rest)); break;
  default:
    console.error(`unknown command '${cmd}'. try: doctor | ledger | verify | gauntlet`);
    exit(2);
}
