"""CAMPUS CLOCK — L1 heartbeat. Public data only. No keys. No signing. No live orders.

Move 1 (game_change_2026-09-11): Phantom watch address via public Solana RPC.
  Watch-only, forever. Address is public chain data; no seed/key/signer exists here.
Move 2: Kraken public market data — keyless, US-clean. No Binance (HTTP 451 on
  GitHub-hosted runners); no fallback chain needed when the source isn't geo-blocked.

Laws: job must exit 0 with a file. Every failure is recorded in errors[], never fatal.
Every cycle appends one JSONL line to data/clock/history.jsonl — the heartbeat ledger.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OUT = Path("data/clock/latest.json")
HIST = Path("data/clock/history.jsonl")
UA = {"User-Agent": "CAMPUS-clock/1.0"}

# Public watch address (desk/STATE.json phantom_watch). Watch-only. Never a key.
WATCH_ADDRESS = "FvUwXJ9T34oock3kv6CThyq1wNjA4Kf4uxPB534YyQBw"
SOL_RPC = "https://api.mainnet-beta.solana.com"
KRAKEN_TICKER = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD"


def post_rpc(method: str, params: list) -> dict:
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    ).encode()
    req = Request(
        SOL_RPC,
        data=body,
        headers={**UA, "Content-Type": "application/json"},
    )
    with urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode())


def get(url: str) -> dict:
    with urlopen(Request(url, headers=UA), timeout=20) as res:
        return json.loads(res.read().decode())


def phantom_watch() -> tuple[dict | None, str | None]:
    """Watch-only snapshot: SOL balance + 5 most recent signatures."""
    try:
        bal = post_rpc("getBalance", [WATCH_ADDRESS])
        lamports = (bal.get("result") or {}).get("value")
        if lamports is None:
            return None, "solana:getBalance empty"
        sigs = post_rpc(
            "getSignaturesForAddress", [WATCH_ADDRESS, {"limit": 5}]
        )
        rows = sigs.get("result") or []
        recent = [
            {
                "signature": r.get("signature"),
                "slot": r.get("slot"),
                "blockTime": r.get("blockTime"),
                "err": r.get("err"),
            }
            for r in rows
            if isinstance(r, dict)
        ]
        return {
            "address": WATCH_ADDRESS,
            "sol": round(lamports / 1_000_000_000, 6),
            "lamports": lamports,
            "recentSignatures": recent,
            "mode": "watch-only",
            "signing": "never",
        }, None
    except HTTPError as exc:
        return None, f"solana: HTTP {exc.code}"
    except (URLError, TimeoutError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        return None, f"solana: {type(exc).__name__}"


def kraken_tape() -> tuple[list[dict], str | None]:
    """Keyless public ticker. US-clean source; no auth, no account, no orders."""
    try:
        body = get(KRAKEN_TICKER)
        result = body.get("result") if isinstance(body, dict) else None
        if not isinstance(result, dict) or not result:
            return [], "kraken: empty"
        alias = {"XXBTZUSD": "BTC", "XETHZUSD": "ETH", "SOLUSD": "SOL"}
        out = []
        for key, sym in alias.items():
            row = result.get(key)
            if not row:
                continue
            last = float(row["c"][0])
            open_px = float(row["o"])
            chg = 0.0 if open_px == 0 else (last - open_px) / open_px * 100
            out.append(
                {"symbol": sym, "price": last, "changePct": chg, "source": "Kraken"}
            )
        return (out, None) if out else ([], "kraken: no pairs parsed")
    except HTTPError as exc:
        return [], f"kraken: HTTP {exc.code}"
    except (URLError, TimeoutError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        return [], f"kraken: {type(exc).__name__}"


def main() -> None:
    errors: list[str] = []
    watch, werr = phantom_watch()
    if werr:
        errors.append(werr)
    tape, terr = kraken_tape()
    if terr:
        errors.append(terr)
    payload = {
        "at": datetime.now(timezone.utc).isoformat(),
        "beat": "campus-clock",
        "watch": watch,
        "tape": tape,
        "liveOrders": False,
        "errors": errors,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    with HIST.open("a") as fh:
        fh.write(json.dumps(payload, separators=(",", ":")) + "\n")
    print(json.dumps(payload))
    if watch is None and not tape:
        raise SystemExit("heartbeat failed: no solana, no kraken")


if __name__ == "__main__":
    main()
