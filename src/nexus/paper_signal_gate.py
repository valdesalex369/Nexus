"""Fail-closed freshness and evidence gate for the public, paper-only scout.

This verifies the timestamp of our saved snapshot, NOT exchange quote age.
A successful gate never grants authority to send orders.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

MAX_AGE_SECONDS = 35 * 60
MAX_FUTURE_SKEW_SECONDS = 120
REQUIRED_SYMBOLS = {"BTC", "ETH", "SOL"}


def evaluate_snapshot(snapshot: dict, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    now = now.astimezone(timezone.utc)
    reasons: list[str] = []
    age_seconds = None

    if not isinstance(snapshot, dict):
        return {
            "status": "BLOCKED",
            "reasons": ["INVALID_SNAPSHOT"],
            "ageSeconds": None,
            "maxAgeSeconds": MAX_AGE_SECONDS,
            "sourceQuoteTimesVerified": False,
            "eligibleForLiveTrading": False,
        }

    if snapshot.get("venue") != "paper" or snapshot.get("liveOrders") is not False:
        reasons.append("NON_PAPER_AUTHORITY")

    at = snapshot.get("at")
    try:
        timestamp = datetime.fromisoformat(str(at).replace("Z", "+00:00"))
        if timestamp.tzinfo is None:
            raise ValueError("timestamp missing timezone")
        age_seconds = round((now - timestamp.astimezone(timezone.utc)).total_seconds())
        if age_seconds > MAX_AGE_SECONDS:
            reasons.append("STALE_SNAPSHOT")
        elif age_seconds < -MAX_FUTURE_SKEW_SECONDS:
            reasons.append("FUTURE_DATED_SNAPSHOT")
    except (TypeError, ValueError, OverflowError):
        reasons.append("INVALID_TIMESTAMP")

    tape = snapshot.get("tape")
    seen: set[str] = set()
    if not isinstance(tape, list) or not tape:
        reasons.append("MISSING_TAPE")
    else:
        for item in tape:
            if not isinstance(item, dict):
                reasons.append("INVALID_QUOTE")
                continue
            symbol = item.get("symbol")
            if not isinstance(symbol, str) or not symbol:
                reasons.append("INVALID_SYMBOL")
            elif symbol in seen:
                reasons.append("DUPLICATE_SYMBOL")
            else:
                seen.add(symbol)
            price = item.get("price")
            if isinstance(price, bool) or not isinstance(price, (float, int)) or not math.isfinite(price) or price <= 0:
                reasons.append("INVALID_PRICE")
            if not isinstance(item.get("source"), str) or not item["source"].strip():
                reasons.append("MISSING_SOURCE")
        if not REQUIRED_SYMBOLS.issubset(seen):
            reasons.append("REQUIRED_SYMBOL_MISSING")

    return {
        "status": "BLOCKED" if reasons else "FRESH_PAPER",
        "reasons": sorted(set(reasons)),
        "ageSeconds": age_seconds,
        "maxAgeSeconds": MAX_AGE_SECONDS,
        # CoinGecko simple/price and the current Kraken fallback do not carry
        # verified per-quote source timestamps in this scout's output.
        "sourceQuoteTimesVerified": False,
        "eligibleForLiveTrading": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Check one paper scout snapshot at read time")
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.snapshot.read_text())
        result = evaluate_snapshot(payload)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        result = {"status": "BLOCKED", "reasons": [type(exc).__name__], "eligibleForLiveTrading": False}
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "FRESH_PAPER" else 2


if __name__ == "__main__":
    sys.exit(main())
