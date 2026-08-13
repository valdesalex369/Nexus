/**
 * KNOWLEDGE STORE — the evidence hierarchy.
 *
 *     RAW -> PARSED -> CLASSIFIED -> INDEXED -> CLAIMED -> VERIFIED
 *
 * Each artifact records the hash of the artifact it was derived from, so a
 * derived thing can always be walked back to the bytes it came from. Nothing
 * skips a stage, and — the rule that matters most — a derived artifact never
 * replaces its parent. An AI summary is a new row at a later stage, not an
 * overwrite of the source. `originOf()` walks the chain back to the RAW bytes.
 *
 * Raw payloads are written to disk and referenced by hash. The database holds
 * pointers and findings, never the payload, so ingested content cannot end up
 * inside the audit trail where a later agent might read it as history.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Claim, Contradiction, EvidenceStage, Source, SourceUnavailable } from '../discovery/types.ts';

export interface Artifact {
  id: string;
  stage: EvidenceStage;
  sha256: string;
  /** The artifact this was derived from. Null only for RAW. */
  parentSha256: string | null;
  kind: string;
  /** Path on disk for RAW payloads. */
  path?: string;
  note?: string;
  createdAt: string;
}

const STAGE_ORDER: EvidenceStage[] = [
  'RAW', 'PARSED', 'CLASSIFIED', 'INDEXED', 'CLAIMED', 'VERIFIED',
];

export class StoreError extends Error {
  constructor(message: string) { super(message); this.name = 'StoreError'; }
}

export class KnowledgeStore {
  private db: DatabaseSync;
  private blobDir: string;

  constructor(
    dbPath = process.env.NEXUS_KNOWLEDGE_DB || './data/knowledge.db',
    blobDir = process.env.NEXUS_BLOB_DIR || './data/raw',
  ) {
    if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
    this.blobDir = blobDir;
    mkdirSync(this.blobDir, { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY, stage TEXT NOT NULL, sha256 TEXT NOT NULL,
        parent_sha256 TEXT, kind TEXT NOT NULL, path TEXT, note TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_art_sha ON artifacts(sha256);
      CREATE INDEX IF NOT EXISTS idx_art_parent ON artifacts(parent_sha256);

      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, provider TEXT NOT NULL,
        url TEXT, path TEXT, title TEXT, author TEXT,
        retrieved_at TEXT NOT NULL, published_at TEXT,
        sha256 TEXT NOT NULL, reliability REAL NOT NULL,
        signals TEXT NOT NULL, flags TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY, text TEXT NOT NULL, classification TEXT NOT NULL,
        subject TEXT, predicate TEXT, value TEXT,
        provenance TEXT NOT NULL, confidence REAL NOT NULL,
        superseded_by TEXT, created_at TEXT NOT NULL, run_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_claim_subj ON claims(subject);
      CREATE INDEX IF NOT EXISTS idx_claim_class ON claims(classification);

      CREATE TABLE IF NOT EXISTS contradictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_a TEXT NOT NULL, claim_b TEXT NOT NULL,
        reason TEXT NOT NULL, severity REAL NOT NULL, kind TEXT NOT NULL DEFAULT 'value-conflict',
        run_id TEXT
      );

      CREATE TABLE IF NOT EXISTS unavailable (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL, query TEXT NOT NULL,
        reason TEXT NOT NULL, at TEXT NOT NULL, run_id TEXT
      );
    `);
    // Originals are immutable. A summary is a new row, never an overwrite.
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS artifacts_no_update BEFORE UPDATE ON artifacts
      BEGIN SELECT RAISE(ABORT, 'evidence is immutable: artifacts cannot be updated'); END;
    `);
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS artifacts_no_delete BEFORE DELETE ON artifacts
      BEGIN SELECT RAISE(ABORT, 'evidence is immutable: artifacts cannot be deleted'); END;
    `);
  }

  /** Persist raw bytes and register the RAW artifact. Content-addressed. */
  putRaw(payload: string | Buffer, kind: string, note?: string): Artifact {
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const path = join(this.blobDir, `${sha256}.blob`);
    if (!existsSync(path)) writeFileSync(path, buf);

    const existing = this.db.prepare('SELECT id FROM artifacts WHERE sha256 = ? AND stage = ?')
      .get(sha256, 'RAW') as { id: string } | undefined;
    if (existing) {
      // Identical bytes ingested twice is deduplication, not an error.
      return this.artifact(existing.id)!;
    }
    return this.insertArtifact({
      id: `art_${sha256.slice(0, 16)}`, stage: 'RAW', sha256, parentSha256: null,
      kind, path, note, createdAt: new Date().toISOString(),
    });
  }

  /**
   * Register a derived artifact. Refuses to skip stages and refuses to attach
   * to a parent that was never stored — both are provenance loss.
   */
  derive(
    parentSha256: string, stage: EvidenceStage, content: string, kind: string, note?: string,
  ): Artifact {
    const parent = this.db.prepare('SELECT stage FROM artifacts WHERE sha256 = ? ORDER BY rowid DESC LIMIT 1')
      .get(parentSha256) as { stage: string } | undefined;
    if (!parent) {
      throw new StoreError(
        `cannot derive from '${parentSha256.slice(0, 12)}': parent artifact was never stored`);
    }
    const from = STAGE_ORDER.indexOf(parent.stage as EvidenceStage);
    const to = STAGE_ORDER.indexOf(stage);
    if (to <= from) {
      throw new StoreError(`cannot derive ${stage} from ${parent.stage}: stages only move forward`);
    }
    if (to !== from + 1) {
      throw new StoreError(
        `cannot skip stages: ${parent.stage} -> ${stage} (expected ${STAGE_ORDER[from + 1]})`);
    }
    const sha256 = createHash('sha256').update(content).digest('hex');
    // Identity is (parent, stage, content) — the same derivation performed twice
    // is the same artifact, not a collision. Without the parent in the id, two
    // different sources that parse to identical text would fight over one row.
    const id = `art_${createHash('sha256')
      .update(`${parentSha256}|${stage}|${sha256}`).digest('hex').slice(0, 24)}`;

    const existing = this.artifact(id);
    if (existing) return existing; // idempotent: re-deriving is not an error

    return this.insertArtifact({
      id, stage, sha256, parentSha256, kind, note, createdAt: new Date().toISOString(),
    });
  }

  private insertArtifact(a: Artifact): Artifact {
    this.db.prepare(`INSERT INTO artifacts
      (id, stage, sha256, parent_sha256, kind, path, note, created_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      a.id, a.stage, a.sha256, a.parentSha256, a.kind, a.path ?? null,
      a.note ?? null, a.createdAt);
    return a;
  }

  artifact(id: string): Artifact | null {
    const r = this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as
      Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: r.id as string, stage: r.stage as EvidenceStage, sha256: r.sha256 as string,
      parentSha256: (r.parent_sha256 as string) ?? null, kind: r.kind as string,
      path: (r.path as string) ?? undefined, note: (r.note as string) ?? undefined,
      createdAt: r.created_at as string,
    };
  }

  /** Walk a derived artifact back to the RAW bytes it came from. */
  originOf(sha256: string): Artifact | null {
    let cursor: string | null = sha256;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const r: Record<string, unknown> | undefined = this.db
        .prepare('SELECT * FROM artifacts WHERE sha256 = ? ORDER BY rowid ASC LIMIT 1')
        .get(cursor) as Record<string, unknown> | undefined;
      if (!r) return null;
      if (r.stage === 'RAW') return this.artifact(r.id as string);
      cursor = (r.parent_sha256 as string) ?? null;
    }
    return null;
  }

  /** Read the original bytes for an artifact, following the chain if needed. */
  readOriginal(sha256: string): Buffer {
    const origin = this.originOf(sha256);
    if (!origin?.path) throw new StoreError(`no raw payload retained for ${sha256.slice(0, 12)}`);
    return readFileSync(origin.path);
  }

  putSource(s: Source): void {
    this.db.prepare(`INSERT OR REPLACE INTO sources
      (id, kind, provider, url, path, title, author, retrieved_at, published_at,
       sha256, reliability, signals, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      s.id, s.kind, s.provider, s.url ?? null, s.path ?? null, s.title ?? null,
      s.author ?? null, s.retrievedAt, s.publishedAt ?? null, s.sha256, s.reliability,
      JSON.stringify(s.reliabilitySignals), JSON.stringify(s.flags));
  }

  putClaim(c: Claim, runId?: string): void {
    this.db.prepare(`INSERT OR REPLACE INTO claims
      (id, text, classification, subject, predicate, value, provenance,
       confidence, superseded_by, created_at, run_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      c.id, c.text, c.classification, c.subject ?? null, c.predicate ?? null,
      c.value === undefined ? null : String(c.value), JSON.stringify(c.provenance),
      c.confidence, c.supersededBy ?? null, c.createdAt, runId ?? null);
  }

  putContradiction(x: Contradiction, runId?: string): void {
    this.db.prepare(
      'INSERT INTO contradictions (claim_a, claim_b, reason, severity, kind, run_id) VALUES (?,?,?,?,?,?)')
      .run(x.claimA, x.claimB, x.reason, x.severity, x.kind, runId ?? null);
  }

  putUnavailable(u: SourceUnavailable, runId?: string): void {
    this.db.prepare(
      'INSERT INTO unavailable (provider, query, reason, at, run_id) VALUES (?,?,?,?,?)')
      .run(u.provider, u.query, u.reason, u.at, runId ?? null);
  }

  counts(): Record<string, number> {
    const one = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    return {
      artifacts: one('SELECT COUNT(*) AS n FROM artifacts'),
      raw: one("SELECT COUNT(*) AS n FROM artifacts WHERE stage='RAW'"),
      sources: one('SELECT COUNT(*) AS n FROM sources'),
      claims: one('SELECT COUNT(*) AS n FROM claims'),
      observed: one("SELECT COUNT(*) AS n FROM claims WHERE classification='OBSERVED'"),
      inferred: one("SELECT COUNT(*) AS n FROM claims WHERE classification='INFERRED'"),
      unknown: one("SELECT COUNT(*) AS n FROM claims WHERE classification='UNKNOWN'"),
      contradictions: one('SELECT COUNT(*) AS n FROM contradictions'),
      unavailable: one('SELECT COUNT(*) AS n FROM unavailable'),
    };
  }

  /** Historical memory: what do we already know about a subject? */
  recall(subject: string, limit = 50): Claim[] {
    const rows = this.db.prepare(
      `SELECT * FROM claims WHERE subject LIKE ? OR text LIKE ?
       ORDER BY confidence DESC LIMIT ?`)
      .all(`%${subject}%`, `%${subject}%`, limit) as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string, text: r.text as string,
      classification: r.classification as Claim['classification'],
      subject: (r.subject as string) ?? undefined,
      predicate: (r.predicate as string) ?? undefined,
      value: (r.value as string) ?? undefined,
      provenance: JSON.parse(r.provenance as string),
      confidence: r.confidence as number,
      supersededBy: (r.superseded_by as string) ?? undefined,
      createdAt: r.created_at as string,
    }));
  }

  raw(): DatabaseSync { return this.db; }
  close(): void { this.db.close(); }
}
