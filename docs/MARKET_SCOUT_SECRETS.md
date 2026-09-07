# Market Scout v0 — secrets and access

## Non-negotiable rule
Never paste API keys, wallet seed phrases, private keys, exchange signing credentials, or withdrawal credentials into chat, GitHub issues, commits, the agent bus, screenshots, or logs.

## v0 needs only read access
Market Scout v0 must operate with public wallet addresses and read-only data providers.

Required environment variables (values live only in the execution environment / secret manager):

- `SOLANA_RPC_URL` — authenticated Solana RPC/indexer endpoint. Read-only data use only.
- `EVM_RPC_URL` — authenticated EVM RPC/indexer endpoint. Read-only data use only.

Optional:

- `OPENAI_API_KEY` — only for an external worker that invokes the OpenAI API (for example `gpt-6-astra`). Do not add this if Codex/Work is using ChatGPT sign-in and no external API worker needs it.
- `MARKET_SCOUT_MODEL` — non-secret model name, default `gpt-6-astra` when available.

Public identifiers (not secrets):

- Solana wallet: `FvUwXJ9T34oock3kv6CThyq1wNjA4Kf4uxPB534YyQBw`
- EVM wallet: `0x1651aEB1118b0E777Fc88b8f5887B240e41cd579`

## Forbidden credentials
- Phantom/Solana seed phrase or private key
- EVM private key or recovery phrase
- Exchange API keys with trading, transfer, address-management, or withdrawal permissions
- Master recovery codes

If account-specific exchange data becomes necessary later, create a unique read-only key with the minimum scopes, no trading or withdrawals, and an IP allowlist when the provider supports it.

## Runtime behavior
Code may reference environment-variable names, but must never print their values. Provider errors should be explicit and redacted. Secrets scans must pass before merge.
