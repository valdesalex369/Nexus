"""ORBITAL paper scout. Public tape only. No keys. No live orders.

GitHub-hosted runners get HTTP 451 from api.binance.com (geo/legal block).
Scout tries Binance, then CoinGecko, then Kraken. Job must exit 0 with a file.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OUT = Path("data/paper/latest.json")
UA = {"User-Agent": "ORBITAL-paper-scout/1.1"}


def get(url: str) -> dict | list:
    with urlopen(Request(url, headers=UA), timeout=20) as res:
        return json.loads(res.read().decode())


def _try(fn, label: str) -> tuple[list[dict], str | None]:
    try:
        rows = fn()
        if rows:
            return rows, None
        return [], f"{label}: empty"
    except HTTPError as exc:
        return [], f"{label}: HTTP {exc.code}"
    except (URLError, TimeoutError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        return [], f"{label}: {type(exc).__name__}"


def from_binance() -> list[dict]:
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


def from_coingecko() -> list[dict]:
    url = (
        "https://api.coingecko.com/api/v3/simple/price"
        "?ids=bitcoin,ethereum,solana,binancecoin"
        "&vs_currencies=usd&include_24hr_change=true"
    )
    body = get(url)
    if not isinstance(body, dict):
        return []
    names = {
        "bitcoin": "BTC",
        "ethereum": "ETH",
        "solana": "SOL",
        "binancecoin": "BNB",
    }
    out = []
    for cid, sym in names.items():
        row = body.get(cid) or {}
        if "usd" not in row:
            continue
        out.append(
            {
                "symbol": sym,
                "price": float(row["usd"]),
                "changePct": float(row.get("usd_24h_change") or 0),
                "source": "CoinGecko",
            }
        )
    return out


def from_kraken() -> list[dict]:
    url = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD"
    body = get(url)
    result = body.get("result") if isinstance(body, dict) else None
    if not isinstance(result, dict):
        return []
    alias = {"XXBTZUSD": "BTC", "XETHZUSD": "ETH", "SOLUSD": "SOL"}
    out = []
    for key, sym in alias.items():
        row = result.get(key)
        if not row:
            continue
        last = float(row["c"][0])
        open_px = float(row["o"])
        chg = 0.0 if open_px == 0 else (last - open_px) / open_px * 100
        out.append({"symbol": sym, "price": last, "changePct": chg, "source": "Kraken"})
    return out


def meme_heat() -> list[dict]:
    """Dexscreener boosted Solana tokens. Best-effort. Never fail the job."""
    try:
        rows = get("https://api.dexscreener.com/token-boosts/top/v1")
    except Exception:
        return []
    if not isinstance(rows, list):
        return []
    out = []
    for row in rows:
        if str(row.get("chainId", "")).lower() != "solana":
            continue
        out.append(
            {
                "url": row.get("url"),
                "tokenAddress": row.get("tokenAddress"),
                "description": (row.get("description") or "")[:120],
            }
        )
        if len(out) >= 8:
            break
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
    errors: list[str] = []
    tape, err = _try(from_binance, "binance")
    if err:
        errors.append(err)
    if not tape:
        tape, err = _try(from_coingecko, "coingecko")
        if err:
            errors.append(err)
    if not tape:
        tape, err = _try(from_kraken, "kraken")
        if err:
            errors.append(err)
    memes, merr = _try(meme_heat, "dexscreener")
    if merr:
        errors.append(merr)
        memes = []
    payload = {
        "at": datetime.now(timezone.utc).isoformat(),
        "venue": "paper",
        "tape": tape,
        "memes": memes,
        "fearGreed": fear_greed(),
        "command": command(tape),
        "liveOrders": False,
        "errors": errors,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps(payload))
    if not tape:
        raise SystemExit("no public tape from Binance, CoinGecko, or Kraken")


if __name__ == "__main__":
    main()
