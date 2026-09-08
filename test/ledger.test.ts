import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../src/ledger/index.ts';

describe('ledger', () => {
  test('appends and reads back events for a run', () => {
    const l = new Ledger(':memory:');
    const runId = Ledger.newRunId();
    l.append({ runId, kind: 'run.start', actor: 'test', task: 'demo' });
    l.append({ runId, kind: 'action', actor: 'test', costUsd: 0.25, evidence: { ok: true } });
    const events = l.byRun(runId);
    assert.equal(events.length, 2);
    assert.equal(events[0]!.kind, 'run.start');
    assert.deepEqual(events[1]!.evidence, { ok: true });
    l.close();
  });

  test('sums run cost', () => {
    const l = new Ledger(':memory:');
    const runId = Ledger.newRunId();
    l.append({ runId, kind: 'action', actor: 'a', costUsd: 0.1 });
    l.append({ runId, kind: 'action', actor: 'a', costUsd: 0.2 });
    l.append({ runId, kind: 'action', actor: 'a' });
    assert.ok(Math.abs(l.runCost(runId) - 0.3) < 1e-9);
    l.close();
  });

  test('hash chain verifies over a clean log', () => {
    const l = new Ledger(':memory:');
    const runId = Ledger.newRunId();
    for (let i = 0; i < 5; i++) l.append({ runId, kind: 'action', actor: `a${i}` });
    const v = l.verifyChain();
    assert.equal(v.ok, true);
    assert.equal(v.ok && v.length, 5);
    l.close();
  });

  test('each event chains to its predecessor', () => {
    const l = new Ledger(':memory:');
    const runId = Ledger.newRunId();
    const a = l.append({ runId, kind: 'action', actor: 'a' });
    const b = l.append({ runId, kind: 'action', actor: 'b' });
    assert.equal(b.prevHash, a.hash);
    assert.notEqual(a.hash, b.hash);
    l.close();
  });

  test('rejects UPDATE and DELETE at the database level', () => {
    const l = new Ledger(':memory:');
    l.append({ runId: Ledger.newRunId(), kind: 'action', actor: 'a' });
    assert.throws(() => l.raw().exec("UPDATE events SET actor='tampered' WHERE id=1"),
      /append-only/);
    assert.throws(() => l.raw().exec('DELETE FROM events WHERE id=1'), /append-only/);
    l.close();
  });

  test('detects tampering that bypasses the triggers', () => {
    const l = new Ledger(':memory:');
    const runId = Ledger.newRunId();
    l.append({ runId, kind: 'action', actor: 'honest' });
    l.append({ runId, kind: 'action', actor: 'also-honest' });
    // Simulate an attacker with raw file access dropping the triggers first.
    l.raw().exec('DROP TRIGGER events_no_update');
    l.raw().exec("UPDATE events SET actor='tampered' WHERE id=1");
    const v = l.verifyChain();
    assert.equal(v.ok, false);
    assert.equal(v.ok === false && v.brokenAtId, 1);
    l.close();
  });

  test('opens an existing ledger without writes and refuses append in read-only mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-ledger-readonly-'));
    const path = join(root, 'ledger.db');
    const writer = new Ledger(path);
    writer.append({ runId: Ledger.newRunId(), kind: 'result', actor: 'test' });
    writer.close();
    const beforeBytes = readFileSync(path);
    const beforeStat = statSync(path);

    const reader = new Ledger(path, { readOnly: true });
    assert.deepEqual(reader.verifyChain(), { ok: true, length: 1 });
    assert.equal(reader.recent(1).length, 1);
    assert.throws(
      () => reader.append({ runId: Ledger.newRunId(), kind: 'action', actor: 'blocked' }),
      /read-only/,
    );
    reader.close();

    assert.deepEqual(readFileSync(path), beforeBytes);
    assert.equal(statSync(path).size, beforeStat.size);
    assert.equal(statSync(path).mtimeMs, beforeStat.mtimeMs);
  });

  test('read-only open fails without creating a missing ledger or parent directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-ledger-missing-'));
    const parent = join(root, 'must-not-exist');
    const path = join(parent, 'ledger.db');
    assert.throws(() => new Ledger(path, { readOnly: true }), /does not exist/);
    assert.equal(existsSync(path), false);
    assert.equal(existsSync(parent), false);
  });
});
