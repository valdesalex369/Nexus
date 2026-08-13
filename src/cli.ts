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
import { AgentRegistry } from './agents/registry.ts';
import { ROSTER } from './agents/roster.ts';
import { Intake } from './intake/index.ts';
import { rank, explain, type Opportunity } from './wayfinder/index.ts';
import { readFileSync } from 'node:fs';
import { KnowledgeStore } from './knowledge/store.ts';
import { DiscoveryPipeline } from './discovery/pipeline.ts';
import { defaultProviders } from './discovery/providers.ts';

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

function agents(): number {
  const reg = new AgentRegistry();
  reg.registerAll(ROSTER);
  console.log('NEXUS ROSTER\n' + '='.repeat(60));
  console.log('  id                  budget    time  max blast   escalates\n');
  console.log(reg.describe());
  console.log('\nAuthority only narrows: a spawned agent receives the intersection of its own');
  console.log('contract and its parent\'s remaining grant — never more.');
  return 0;
}

function intake(): number {
  const ledger = new Ledger();
  const box = new Intake(ledger);
  const runId = Ledger.newRunId();
  const m = box.ingestAll(runId);

  console.log(`intake directory : ${box.directory}`);
  console.log(`files ingested   : ${m.items.length}`);
  console.log(`total bytes      : ${m.totalBytes.toLocaleString()}`);
  console.log(`quarantined      : ${m.quarantinedCount}`);
  if (m.items.length === 0) {
    console.log(`\nNothing to ingest. Drop files into ${box.directory} and re-run.`);
  }
  for (const i of m.items) {
    const mark = i.quarantined ? 'QUARANTINED' : 'ok         ';
    console.log(`  ${mark} ${i.kind.padEnd(17)} ${i.sha256.slice(0, 12)} ${i.path}`);
    if (i.flags.length) console.log(`              flags: ${i.flags.join(', ')}`);
  }
  if (m.quarantinedCount > 0) {
    console.log('\nQuarantined files were still ingested, but are marked so no agent treats');
    console.log('them as instruction. If any flag starts with "secret:", rotate that credential.');
  }
  console.log(`\nrun id: ${runId}`);
  ledger.close();
  return 0;
}

function wayfinder(file?: string): number {
  if (!file) {
    console.error('usage: nexus wayfinder <opportunities.json>');
    console.error('       JSON array of Opportunity objects — see src/wayfinder/index.ts');
    return 2;
  }
  const opportunities = JSON.parse(readFileSync(file, 'utf8')) as Opportunity[];
  const ranked = rank(opportunities);
  console.log(explain(ranked));

  const ledger = new Ledger();
  const runId = Ledger.newRunId();
  ledger.append({
    runId, kind: 'decision', actor: 'wayfinder', task: 'rank opportunities',
    inputRef: file,
    payload: ranked.map((r) => ({
      id: r.opportunity.id, rank: r.rank, score: r.score, veto: r.veto,
    })),
    evidence: ranked.map((r) => ({ id: r.opportunity.id, components: r.components })),
  });
  console.log(`\nrecorded as run ${runId}`);
  ledger.close();
  return 0;
}

async function discover(args: string[]): Promise<number> {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) { flags.set(a.slice(2), args[i + 1] ?? ''); i++; }
    else positional.push(a);
  }
  const question = positional.join(' ');
  if (!question) {
    console.error('usage: nexus discover "<question>" [--limit N] [--ask "<open question>"]');
    return 2;
  }

  const ledger = new Ledger();
  const store = new KnowledgeStore();
  const pipe = new DiscoveryPipeline(defaultProviders(), store, ledger);

  const report = await pipe.run({
    question,
    perProviderLimit: Number(flags.get('limit') ?? 8),
    openQuestions: flags.has('ask') ? [flags.get('ask')!] : [],
  });

  console.log(`DISCOVERY  ${report.question}`);
  console.log('='.repeat(70));
  console.log(`queries      : ${report.queries.join(' | ')}`);
  console.log(`providers    : ${report.providersLive.join(', ') || '(none live)'}`);
  console.log(`unwired      : ${report.providersUnwired.map((u) => u.name).join(', ') || '(none)'}`);
  console.log(`sources      : ${report.sources.length} (${report.duplicatesRemoved} duplicates removed)`);
  console.log(`flagged      : ${report.flaggedSources}   stale: ${report.staleSources}`);

  const byClass = (k: string) => report.claims.filter((c) => c.classification === k).length;
  console.log(`claims       : ${report.claims.length} `
    + `(OBSERVED ${byClass('OBSERVED')}, INFERRED ${byClass('INFERRED')}, UNKNOWN ${byClass('UNKNOWN')})`);
  console.log(`contradictions: ${report.contradictions.length}`);
  console.log(`evidence     : ${report.hasEvidence ? 'YES' : 'NO — nothing was retrieved'}`);
  console.log(`elapsed      : ${report.elapsedMs}ms`);

  if (report.unavailable.length) {
    console.log('\nSOURCE_UNAVAILABLE');
    for (const u of report.unavailable) {
      console.log(`  ${u.provider.padEnd(10)} ${u.reason.slice(0, 90)}`);
    }
  }

  const top = [...report.sources].sort((a, b) => b.reliability - a.reliability).slice(0, 12);
  if (top.length) {
    console.log('\nTOP SOURCES BY RELIABILITY');
    for (const s of top) {
      console.log(`  ${s.reliability.toFixed(2)}  ${(s.title ?? '').slice(0, 46).padEnd(46)} ${s.url ?? ''}`);
      if (s.flags.length) console.log(`        FLAGGED: ${s.flags.join(', ')}`);
    }
  }

  if (report.contradictions.length) {
    console.log('\nCONTRADICTIONS');
    for (const c of report.contradictions.slice(0, 10)) console.log(`  ${c.reason}`);
  }

  const unknowns = report.claims.filter((c) => c.classification === 'UNKNOWN');
  if (unknowns.length) {
    console.log('\nRECORDED UNKNOWNS (what we could not determine)');
    for (const u of unknowns.slice(0, 10)) console.log(`  ${u.text.slice(0, 110)}`);
  }

  console.log(`\nrun id: ${report.runId}`);
  store.close(); ledger.close();
  return report.hasEvidence ? 0 : 1;
}

const exit = (code: number) => { process.exitCode = code; };

switch (cmd) {
  case 'doctor': exit(doctor()); break;
  case 'ledger': exit(showLedger(Number(rest[0] ?? 30))); break;
  case 'verify': exit(verify()); break;
  case 'gauntlet': exit(await gauntlet(rest)); break;
  case 'agents': exit(agents()); break;
  case 'intake': exit(intake()); break;
  case 'wayfinder': exit(wayfinder(rest[0])); break;
  case 'discover': exit(await discover(rest)); break;
  default:
    console.error(`unknown command '${cmd}'.`);
    console.error('try: doctor | agents | discover | intake | wayfinder | gauntlet | ledger | verify');
    exit(2);
}
