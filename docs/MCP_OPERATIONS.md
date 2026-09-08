# Nexus Operations MCP

This is a personal, local, read-only MCP server over stdio. It exposes the same
ledger-verified Operations state used by the dashboard. It does not run models,
fetch sources, send messages, connect wallets, sign transactions, or trade.

## Produce and inspect state

```powershell
npm run operations:live -- --once --fixture test/fixtures/federal-register.json
npm run mcp:operations
```

The first command creates a bounded, ledger-bound snapshot. For a real public-source
cycle, omit `--fixture`. The second command is meant to be launched by an MCP host as
a stdio child process; stdout is reserved for MCP JSON-RPC.

The server exposes exactly three tools:

- `nexus_runtime_status` — operating mode, fixed authority, and integration truth.
- `nexus_operations_current` — the current snapshot after full ledger verification.
- `nexus_ledger_verify` — chain and snapshot-commit integrity.

Every tool is read-only, non-destructive, idempotent, and closed-world. There are no
path, URL, command, SQL, wallet, provider, or free-form prompt arguments.

## Operating modes

Set `NEXUS_OPERATING_MODE` in `.env` and restart the MCP process:

- `NORMAL` prioritizes accurate state retrieval.
- `SUPERNOVA` prioritizes finishing and verifying the current bounded mission.
- `GOTHAM` prioritizes adversarial review, contradictions, provenance gaps, and risk.

Modes are official host instructions, not magic trigger phrases. They cannot be
changed by source content or tool input, and they never expand authority. The MCP
requires `NEXUS_CAPITAL_LEVEL=0` and fails closed if it is anything else.

## Wallet boundary

`SOLANA_PUBLIC_ADDRESS` and `EVM_PUBLIC_ADDRESS` accept public addresses only. Today
they only let status report whether a public identifier was supplied;
the observer itself is not implemented. Never put a Phantom seed phrase, recovery
phrase, private key, signing key, browser session, or broker credential in `.env`.
