/**
 * EVENT / ACTION LEDGER
 *
 * The historical memory of the organization. Append-only and hash-chained:
 * every record commits to the hash of its predecessor, so silent edits to
 * history are detectable by `verifyChain()`. This is what makes "the system
 * did X" an auditable claim rather than an assertion.
 *
 * Nothing in NEXUS is allowed to take a consequential action without leaving
 * a record here.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type EventKind =
  | 'run.start' | 'run.end'
  | 'decision' | 'action' | 'result'
  | 'evaluation' | 'escalation' | 'approval'
  | 'error' | 'reversal'
  | 'discovery' | 'policy.deny';

export interface EventInput {
  runId: string;
  kind: EventKind;
  actor: string;
  task?: string;
  model?: string;
  /** Pointer to bulky input (file path, URL, prior event id) rather than the input itself. */
  inputRef?: string;
  tools?: string[];
  payload?: unknown;
  /** What proves this happened: test output, HTTP status, row counts, diffs. */
  evidence?: unknown;
  costUsd?: number;
  latencyMs?: number;
  confidence?: number;
  error?: string;
  humanApproval?: string;
  /** Event id this one reverses, if any. */
  reversalOf?: number;
  parentId?: number;
}

export interface LedgerEvent extends Omit<EventInput, 'payload' | 'evidence' | 'tools'> {
  id: number;
  ts: string;
  tools: string[];
  payload: unknown;
  evidence: unknown;
  prevHash: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);

export interface LedgerOptions {
  /** Open an existing ledger without creating directories, files, tables, or WAL state. */
  readOnly?: boolean;
}

interface Row {
  id: number; ts: string; run_id: string; parent_id: number | null; kind: string;
  actor: string; model: string | null; task: string | null; input_ref: string | null;
  tools: string; payload: string; evidence: string; cost_usd: number; latency_ms: number | null;
  confidence: number | null; error: string | null; human_approval: string | null;
  reversal_of: number | null; prev_hash: string; hash: string;
}

export class Ledger {
  private db: DatabaseSync;
  private readonly readOnly: boolean;

  constructor(path = process.env.NEXUS_DB || './data/nexus.db', options: LedgerOptions = {}) {
    this.readOnly = options.readOnly ?? false;
    if (this.readOnly && path === ':memory:') {
      throw new Error('read-only ledger requires an existing file');
    }
    if (path !== ':memory:') {
      if (this.readOnly && !existsSync(path)) throw new Error('ledger does not exist');
      if (!this.readOnly) mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path, this.readOnly ? { readOnly: true } : {});
    if (!this.readOnly) {
      this.db.exec('PRAGMA journal_mode = WAL');
      this.migrate();
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        ts           TEXT    NOT NULL,
        run_id       TEXT    NOT NULL,
        parent_id    INTEGER,
        kind         TEXT    NOT NULL,
        actor        TEXT    NOT NULL,
        model        TEXT,
        task         TEXT,
        input_ref    TEXT,
        tools        TEXT    NOT NULL DEFAULT '[]',
        payload      TEXT    NOT NULL DEFAULT 'null',
        evidence     TEXT    NOT NULL DEFAULT 'null',
        cost_usd     REAL    NOT NULL DEFAULT 0,
        latency_ms   INTEGER,
        confidence   REAL,
        error        TEXT,
        human_approval TEXT,
        reversal_of  INTEGER,
        prev_hash    TEXT    NOT NULL,
        hash         TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_run  ON events(run_id);
      CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
      CREATE INDEX IF NOT EXISTS idx_events_ts   ON events(ts);
    `);
    // Append-only enforced by the database itself, not merely by convention.
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
      BEGIN SELECT RAISE(ABORT, 'ledger is append-only: UPDATE forbidden'); END;
    `);
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
      BEGIN SELECT RAISE(ABORT, 'ledger is append-only: DELETE forbidden'); END;
    `);
  }

  static newRunId(): string { return randomUUID(); }

  private lastHash(): string {
    const row = this.db.prepare('SELECT hash FROM events ORDER BY id DESC LIMIT 1').get() as
      | { hash: string } | undefined;
    return row?.hash ?? GENESIS;
  }

  /** Deterministic digest over the semantically meaningful fields of a record. */
  private static digest(prevHash: string, core: Record<string, unknown>): string {
    const canonical = JSON.stringify(core, Object.keys(core).sort());
    return createHash('sha256').update(prevHash).update(' ').update(canonical).digest('hex');
  }

  append(e: EventInput): LedgerEvent {
    if (this.readOnly) throw new Error('ledger is open read-only');
    const ts = new Date().toISOString();
    const prevHash = this.lastHash();
    const tools = e.tools ?? [];
    const core = {
      ts, run_id: e.runId, parent_id: e.parentId ?? null, kind: e.kind, actor: e.actor,
      model: e.model ?? null, task: e.task ?? null, input_ref: e.inputRef ?? null,
      tools: JSON.stringify(tools), payload: JSON.stringify(e.payload ?? null),
      evidence: JSON.stringify(e.evidence ?? null), cost_usd: e.costUsd ?? 0,
      latency_ms: e.latencyMs ?? null, confidence: e.confidence ?? null,
      error: e.error ?? null, human_approval: e.humanApproval ?? null,
      reversal_of: e.reversalOf ?? null,
    };
    const hash = Ledger.digest(prevHash, core);
    const info = this.db.prepare(`
      INSERT INTO events (ts, run_id, parent_id, kind, actor, model, task, input_ref, tools,
        payload, evidence, cost_usd, latency_ms, confidence, error, human_approval,
        reversal_of, prev_hash, hash)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      core.ts, core.run_id, core.parent_id, core.kind, core.actor, core.model, core.task,
      core.input_ref, core.tools, core.payload, core.evidence, core.cost_usd, core.latency_ms,
      core.confidence, core.error, core.human_approval, core.reversal_of, prevHash, hash,
    );
    return {
      ...e, id: Number(info.lastInsertRowid), ts, tools, payload: e.payload ?? null,
      evidence: e.evidence ?? null, prevHash, hash,
    };
  }

  private static hydrate(r: Row): LedgerEvent {
    return {
      id: r.id, ts: r.ts, runId: r.run_id, parentId: r.parent_id ?? undefined,
      kind: r.kind as EventKind, actor: r.actor, model: r.model ?? undefined,
      task: r.task ?? undefined, inputRef: r.input_ref ?? undefined,
      tools: JSON.parse(r.tools), payload: JSON.parse(r.payload), evidence: JSON.parse(r.evidence),
      costUsd: r.cost_usd, latencyMs: r.latency_ms ?? undefined,
      confidence: r.confidence ?? undefined, error: r.error ?? undefined,
      humanApproval: r.human_approval ?? undefined, reversalOf: r.reversal_of ?? undefined,
      prevHash: r.prev_hash, hash: r.hash,
    };
  }

  byRun(runId: string): LedgerEvent[] {
    return (this.db.prepare('SELECT * FROM events WHERE run_id = ? ORDER BY id').all(runId) as unknown as Row[])
      .map(Ledger.hydrate);
  }

  recent(limit = 50): LedgerEvent[] {
    return (this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit) as unknown as Row[])
      .map(Ledger.hydrate).reverse();
  }

  runCost(runId: string): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(cost_usd),0) AS c FROM events WHERE run_id = ?')
      .get(runId) as { c: number };
    return row.c;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
  }

  /** Escape hatch for the CLI and tests only. Never use to mutate `events`. */
  raw(): DatabaseSync { return this.db; }

  /** Recompute the whole chain. Returns the first divergence, if any. */
  verifyChain(): { ok: true; length: number } | { ok: false; brokenAtId: number; reason: string } {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY id').all() as unknown as Row[];
    let prev = GENESIS;
    for (const r of rows) {
      if (r.prev_hash !== prev) {
        return { ok: false, brokenAtId: r.id, reason: 'prev_hash does not match preceding record' };
      }
      const { id: _id, prev_hash: _p, hash: _h, ...core } = r;
      const expect = Ledger.digest(prev, core as Record<string, unknown>);
      if (expect !== r.hash) {
        return { ok: false, brokenAtId: r.id, reason: 'record contents do not match stored hash' };
      }
      prev = r.hash;
    }
    return { ok: true, length: rows.length };
  }

  close(): void { this.db.close(); }
}
