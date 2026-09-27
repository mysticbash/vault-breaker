# VAULT//BREAKER — Human-vs-AI bounty game on Monad

Crack an AI guardian's secret key, buy attempts with your own wallet, and drain
the pool. Wrong guesses grow it; the first correct key takes it all — verified
entirely on-chain. This replaces the old x402/fake-wallet prototype with a real
Monad contract + real wallet transactions.

## The game (Human vs AI — the working mode)

1. **Guardian roster** — 5 AI agents each guard a secret phrase and a real MON
   prize pool seeded by the agent provider.
2. **Interrogate free** — chat with the guardian (Kimi k2.6 behind the scenes).
   Extract hints; never ask it to reveal the key outright.
3. **Buy attempts** — each attempt is a *signed Monad transaction from YOUR
   wallet* paying a flat claim fee of 0.05 MON each (winner takes the whole pool). Max 3 per agent.
4. **Fire the key** — submit the plaintext phrase. The contract
   `keccak256(salt, normalize(key))` compares it to the stored hash.
   - **Correct** → the ENTIRE pool pays out to your wallet + Cracked badge.
   - **Wrong** → the fee stays in the pool (it grows!) and the agent's
     survival streak climbs.
5. **Badges** — attacker badges (PROWLER → FIRST BLOOD → GHOST → MASTERMIND →
   PHANTOM → LEGENDARY BREAKER) and defender badges (UNTESTED → IRON GUARDIAN →
   IRON WARDEN → MYTHIC SENTINEL → UNBREAKABLE) are computed from on-chain stats.

The front page selects **HUMAN VS AI** (live) or **AI VS AI** (roadmap — later).

## Architecture

```
browser wallet (MetaMask/etc) ──eth_sendTransaction──▶ VaultArena contract (Monad)
        │                                                 ├─ attempt fee → pool
        │  read agents/pool/state                          ├─ key verification (hash)
        ▼                                                 ├─ payout on crack
getRoster / sendChat (TanStack server functions)          └─ badge stats (on-chain)
        │
        ▼
    Kimi k2.6 web (guardian brains — key stays server-side)
```

- **Contract** `contracts/src/VaultArena.sol`: pools, paid attempts (1-3 per
  wallet per agent), salted-hash key verification, winner-takes-all payout,
  on-chain badge counters. Tested by `contracts/test/VaultArena.t.sol` (14 tests).
- **Server** `src/lib/*`: reads on-chain state, relays guardian chat. Money and
  secrets never touch the server.
- **Client** `src/routes/*`, `src/components/vault/*`: the game UI.

## Running it

### Prereqs
Node 20+ / bun, foundry (`forge`, `cast`, `anvil`), and a wallet (MetaMask etc).

### 1. Contract
```bash
cd contracts
forge test                # run the 14 contract tests
```

### 2. Local dev chain (default)
```bash
anvil --chain-id 31337 --port 8545
# in another terminal:
cd contracts && export VAULT_DEPLOYER_KEY=0xac09...ff80   # anvil default account #0
forge script script/DeployVaultArena.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

The `.env` at the project root already points at the local anvil contract
(`0x5FbDB2315678afecb367f032d93F642f64180aa3`) and Kimi (`VAULT_LLM_MODEL`).
Add your key: `VAULT_LLM_API_KEY=...`, `VAULT_LLM_BASE_URL=...`.

Start the app:
```bash
env $(grep -v '^#' .env | xargs -d '\n') npx vite dev --port 8080
# open http://localhost:8080
```

To test in MetaMask on the local chain, add the Anvil network
(`http://127.0.0.1:8545`, chain 31337) and import anvil dev account #1.
It auto-funds in the app.

### 3. Monad testnet (the real thing)
You need a funded deployer. Generate one, fund it at https://faucet.monad.xyz
(GitHub login), then let the script deploy, seed the pools and rewrite `.env`:
```bash
cd contracts && cast wallet new
export VAULT_DEPLOYER_KEY=<private key>
VAULT_TOTAL_POOL=1 bash scripts/deploy-testnet.sh   # total MON split across the 5 guardians
```
In MetaMask add Monad Testnet (chain 10143; the app prompts you automatically).
Get testnet MON, then play for real.

### 4. End-to-end verification
`scripts/e2e.mjs` plays a whole raid against a live chain: reads the roster,
checks that client key hashing matches the contract, interrogates the guardian
over the LLM gateway, fires a wrong guess, then fires the winning key and
asserts the pool lands in the attacker's wallet.

```bash
set -a && . ./.env && set +a
RPC_URL=https://testnet-rpc.monad.xyz PLAYER_KEY=<attacker key> AGENT_ID=3 node scripts/e2e.mjs
```
It spends ~0.15 MON of fees and gas, and wins the pool back on the crack.
Works against anvil too — just point `RPC_URL` at it.

### Monad gas notes (why claims used to cost far more than 0.05 MON)
- Values in `eth_sendTransaction` must be **0x quantities**; a decimal string is
  read as hex and silently inflates what the wallet asks for.
- Monad bills the **full gas limit**, not gas used, so an oversized limit is a
  real charge. `eth_estimateGas` returns ~4M for the winning path because the
  payout call forwards all remaining gas, so `src/lib/tx.ts` caps the limit at
  250k (a claim really costs ~140k).
- Base fee runs ~100 gwei, far above Ethereum-style defaults, so fees are read
  from `eth_gasPrice` at send time rather than hardcoded.

## .env
```
VAULT_LLM_BASE_URL=https://opencode.ai/zen/go/v1
VAULT_LLM_API_KEY=...       # DO NOT COMMIT
VAULT_LLM_MODEL=kimi-k2.6
VAULT_CONTRACT_ADDRESS=0xdb28cc0552bf3260f5e46c21642762cf51b75c58  # Monad testnet
VAULT_CHAIN_ID=10143
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
```
`.env` and `contracts/.keys` are gitignored.

## Retired prototype cruft
The old `vault.server.ts` (in-memory fake state), `player.ts` (fake random-hex
wallet), and the x402/$0.05-sponsored-gas copy are all gone. Attempts are real
wallet transactions now.