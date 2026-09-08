"""ORBITAL paper scout. Public tape only. No keys. No live orders."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

OUT = Path("data/paper/latest.json")
UA = {"User-Agent": "ORBITAL-paper-scout/1.0"}


def get(url: str) -> dict | list:
    with urlopen(Request(url, headers=UA), timeout=20) as res:
        return json.loads(res.read().decode())


def binance() -> list[dict]:
    url = (
        "https://api.binance.com/api/v3/ticker/24hr"
        "?symbols=%5B%22BTCUSDT%22,%22ETHUSDT%22,%22SOLUSDT%22,%22BNBUSDT%22%5D"
    )
    rows = get(url)
    if not isinstance(rows, list):
        return []
    out = []
    for row in rows:
        out.append(
            {
                "symbol": str(row.get("symbol", "")).replace("USDT", ""),
                "price": float(row["lastPrice"]),
                "changePct": float(row["priceChangePercent"]),
                "source": "Binance",
            }
        )
    return out


def fear_greed() -> dict | None:
    try:
        body = get("https://api.alternative.me/fng/?limit=1")
        row = (body.get("data") or [None])[0] if isinstance(body, dict) else None
        if not row:
            return None
        return {"value": int(row["value"]), "label": row.get("value_classification")}
    except Exception:
        return None


def command(tape: list[dict]) -> str:
    if not tape:
        return "Pull tape. Do not size."
    down = sum(1 for r in tape if r["changePct"] < 0)
    if down >= 3:
        return "Risk-off. Paper flat. Do not chase memes."
    return "Watch BTC ETH SOL. Paper only. You click live."


def main() -> None:
    tape = binance()
    payload = {
        "at": datetime.now(timezone.utc).isoformat(),
        "venue": "paper",
        "tape": tape,
        "fearGreed": fear_greed(),
        "command": command(tape),
        "liveOrders": False,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
