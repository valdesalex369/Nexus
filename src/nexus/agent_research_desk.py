"""Grand Wizard + Sparta: bounded, paper-only market research desk.

Neither role is sentient, connected to a broker, or allowed to execute orders.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

MAX_SNAPSHOT_AGE = 35 * 60
REQUIRED = {'BTC', 'ETH', 'SOL'}


def review(snapshot: dict, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError('now must be timezone aware')
    evidence = json.dumps(snapshot, sort_keys=True, separators=(',', ':')).encode()
    receipt = hashlib.sha256(evidence).hexdigest()
    defects = []
    age = None
    if snapshot.get('venue') != 'paper' or snapshot.get('liveOrders') is not False:
        defects.append('NON_PAPER_SOURCE')
    try:
        at = datetime.fromisoformat(str(snapshot['at']).replace('Z', '+00:00'))
        if at.tzinfo is None:
            raise ValueError('timezone missing')
        age = round((now - at.astimezone(timezone.utc)).total_seconds())
        if age > MAX_SNAPSHOT_AGE:
            defects.append('STALE_SNAPSHOT')
        if age < -120:
            defects.append('FUTURE_TIMESTAMP')
    except (KeyError, ValueError, TypeError):
        defects.append('INVALID_TIMESTAMP')
    tape = snapshot.get('tape')
    rows = {}
    if not isinstance(tape, list):
        defects.append('MISSING_TAPE')
    else:
        for row in tape:
            if not isinstance(row, dict) or not isinstance(row.get('symbol'), str):
                defects.append('INVALID_ROW')
                continue
            key = row['symbol']
            if key in rows:
                defects.append('DUPLICATE_SYMBOL')
            value = row.get('price')
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
                defects.append('INVALID_PRICE')
            if not isinstance(row.get('source'), str) or not row['source'].strip():
                defects.append('MISSING_PROVIDER')
            rows[key] = row
    if not REQUIRED.issubset(rows):
        defects.append('REQUIRED_ASSET_MISSING')
    negatives = sum((isinstance(row.get('changePct'), (int, float)) and not isinstance(row.get('changePct'), bool) and math.isfinite(row['changePct']) and row['changePct'] < 0) for row in rows.values())
    positives = sum((isinstance(row.get('changePct'), (int, float)) and not isinstance(row.get('changePct'), bool) and math.isfinite(row['changePct']) and row['changePct'] > 0) for row in rows.values())
    regime = 'DEFENSIVE_RESEARCH' if negatives >= 3 else 'POSITIVE_TAPE_RESEARCH' if positives >= 3 else 'MIXED_RESEARCH'
    wizard = {
        'role': 'Grand Wizard',
        'hypothesis': regime,
        'observations': {'decliningAssets': negatives, 'advancingAssets': positives, 'coveredAssets': sorted(rows)},
        'action': 'RESEARCH_ONLY',
        'falsifier': 'Price and flow confirmation reverses; or quote source/timestamps fail checks',
    }
    sparta = {
        'role': 'Sparta',
        'verdict': 'BLOCKED' if defects else 'RESEARCH_ONLY',
        'defects': sorted(set(defects)),
        'independentQuoteTimestampsVerified': False,
        'liveOrdersAllowed': False,
        'reason': 'Cannot infer tradable edge or quote freshness from a generated snapshot alone',
    }
    return {'generatedAt': now.astimezone(timezone.utc).isoformat(), 'sourceSha256': receipt,
            'snapshotAgeSeconds': age, 'wizard': wizard, 'sparta': sparta,
            'humanApprovalRequired': True, 'liveOrders': False}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = review(json.loads(args.snapshot.read_text()))
    content = json.dumps(report, indent=2, sort_keys=True) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content)
    print(content)
    return 2 if report['sparta']['verdict'] == 'BLOCKED' else 0


if __name__ == '__main__':
    raise SystemExit(main())
