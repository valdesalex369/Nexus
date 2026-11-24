import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src' / 'nexus'))
from agent_research_desk import review

NOW = datetime(2026, 11, 24, 14, 10, tzinfo=timezone.utc)

def snapshot():
    return {'at': (NOW - timedelta(minutes=5)).isoformat(), 'venue': 'paper', 'liveOrders': False,
            'tape': [{'symbol': x, 'price': p, 'changePct': c, 'source': 'CoinMarketCap'} for x, p, c in [('BTC', 60142, -4), ('ETH', 1695, -5), ('SOL', 70, -7)]]}

class DeskTests(unittest.TestCase):
    def test_regime_and_human_gate(self):
        out = review(snapshot(), now=NOW)
        self.assertEqual(out['wizard']['hypothesis'], 'DEFENSIVE_RESEARCH')
        self.assertEqual(out['sparta']['verdict'], 'RESEARCH_ONLY')
        self.assertFalse(out['sparta']['liveOrdersAllowed'])
    def test_stale_blocked(self):
        s = snapshot(); s['at'] = (NOW - timedelta(hours=3)).isoformat()
        self.assertIn('STALE_SNAPSHOT', review(s, now=NOW)['sparta']['defects'])
    def test_bad_price_blocked(self):
        s = snapshot(); s['tape'][0]['price'] = 0
        self.assertEqual(review(s, now=NOW)['sparta']['verdict'], 'BLOCKED')
    def test_missing_asset_blocked(self):
        s = snapshot(); s['tape'].pop()
        self.assertIn('REQUIRED_ASSET_MISSING', review(s, now=NOW)['sparta']['defects'])
    def test_live_orders_blocked(self):
        s = snapshot(); s['liveOrders'] = True
        self.assertEqual(review(s, now=NOW)['sparta']['verdict'], 'BLOCKED')
    def test_hash_changes_on_evidence_change(self):
        a = snapshot(); b = snapshot(); b['tape'][0]['price'] += 1
        self.assertNotEqual(review(a, now=NOW)['sourceSha256'], review(b, now=NOW)['sourceSha256'])

if __name__ == '__main__':
    unittest.main()
