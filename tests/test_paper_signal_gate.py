"""Deterministic fail-closed checks for the paper scout quality gate."""
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "nexus"))
from paper_signal_gate import evaluate_snapshot  # noqa: E402

NOW = datetime(2026, 11, 18, 14, 30, tzinfo=timezone.utc)


def sample():
    return {
        "at": (NOW - timedelta(minutes=15)).isoformat(),
        "venue": "paper",
        "liveOrders": False,
        "tape": [
            {"symbol": "BTC", "price": 63000.0, "source": "CoinGecko"},
            {"symbol": "ETH", "price": 1800.0, "source": "CoinGecko"},
            {"symbol": "SOL", "price": 74.0, "source": "CoinGecko"},
        ],
    }


class PaperSignalGateTests(unittest.TestCase):
    def test_current_paper_snapshot(self):
        result = evaluate_snapshot(sample(), now=NOW)
        self.assertEqual(result["status"], "FRESH_PAPER")
        self.assertFalse(result["eligibleForLiveTrading"])
        self.assertFalse(result["sourceQuoteTimesVerified"])

    def test_stale_snapshot_is_blocked(self):
        s = sample()
        s["at"] = (NOW - timedelta(hours=5)).isoformat()
        self.assertIn("STALE_SNAPSHOT", evaluate_snapshot(s, now=NOW)["reasons"])

    def test_clock_skew_is_blocked(self):
        s = sample()
        s["at"] = (NOW + timedelta(minutes=10)).isoformat()
        self.assertIn("FUTURE_DATED_SNAPSHOT", evaluate_snapshot(s, now=NOW)["reasons"])

    def test_missing_timezone_is_blocked(self):
        s = sample()
        s["at"] = "2026-11-18T14:15:00"
        self.assertIn("INVALID_TIMESTAMP", evaluate_snapshot(s, now=NOW)["reasons"])

    def test_invalid_price_is_blocked(self):
        s = sample()
        s["tape"][1]["price"] = float("nan")
        self.assertIn("INVALID_PRICE", evaluate_snapshot(s, now=NOW)["reasons"])

    def test_missing_asset_is_blocked(self):
        s = sample()
        s["tape"] = s["tape"][:2]
        self.assertIn("REQUIRED_SYMBOL_MISSING", evaluate_snapshot(s, now=NOW)["reasons"])

    def test_live_order_flag_is_blocked(self):
        s = sample()
        s["liveOrders"] = True
        self.assertIn("NON_PAPER_AUTHORITY", evaluate_snapshot(s, now=NOW)["reasons"])

    def test_duplicate_asset_is_blocked(self):
        s = sample()
        s["tape"].append(dict(s["tape"][0]))
        self.assertIn("DUPLICATE_SYMBOL", evaluate_snapshot(s, now=NOW)["reasons"])


if __name__ == "__main__":
    unittest.main()
