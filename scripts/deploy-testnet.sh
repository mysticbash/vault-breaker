#!/usr/bin/env bash
# Deploy VAULT//BREAKER to Monad testnet and wire up .env.
#
#   export VAULT_DEPLOYER_KEY=<your funded private key>
#   bash scripts/deploy-testnet.sh
#
# Fund the deployer via https://faucet.monad.xyz (GitHub login) first. It needs
# VAULT_TOTAL_POOL (default 5) MON for the pools plus a little for gas.
set -euo pipefail
cd "$(dirname "$0")/../contracts"

RPC="${MONAD_RPC_URL:-https://testnet-rpc.monad.xyz}"
TOTAL_POOL="${VAULT_TOTAL_POOL:-5}"

if [[ -z "${VAULT_DEPLOYER_KEY:-}" ]]; then
  echo "Error: VAULT_DEPLOYER_KEY is not set. Generate+fund a wallet first:"
  echo "  cast wallet new"
  echo "  # fund the address at https://faucet.monad.xyz"
  exit 1
fi

DEPLOYER=$(cast wallet address "$VAULT_DEPLOYER_KEY")
BALANCE=$(cast balance "$DEPLOYER" --rpc-url "$RPC" -e)
echo ">>> Deployer $DEPLOYER holds $BALANCE MON (needs >= $TOTAL_POOL + gas)"
if [[ "$(echo "$BALANCE < $TOTAL_POOL" | bc -l)" == "1" ]]; then
  echo "Error: not enough MON to seed a $TOTAL_POOL MON pool. Fund it at https://faucet.monad.xyz"
  echo "  (or lower it: VAULT_TOTAL_POOL=1 bash scripts/deploy-testnet.sh)"
  exit 1
fi

export VAULT_TOTAL_POOL_WEI=$(cast to-wei "$TOTAL_POOL")

echo ">>> Deploying VaultArena to Monad testnet with a $TOTAL_POOL MON total pool..."
forge script script/DeployVaultArena.s.sol \
  --rpc-url "$RPC" \
  --broadcast \
  --slow \
  -vvv

echo ">>> Reading deployed address from broadcast..."
ADDR=$(python3 - <<'PY'
import json,glob
files=sorted(glob.glob("broadcast/DeployVaultArena.s.sol/10143/run-latest.json"))
j=json.load(open(files[0]))
for tx in j["transactions"]:
    if tx["transactionType"]=="CREATE":
        print(tx["contractAddress"]); break
PY
)

echo ">>> Deployed contract: $ADDR"
ADDR="${ADDR:?no contract address found}"
cd ".."

# Rewrite .env chain settings (preserve LLM lines)
sed -i.bak \
  -e "s|^VAULT_CONTRACT_ADDRESS=.*|VAULT_CONTRACT_ADDRESS=$ADDR|" \
  -e "s|^VAULT_CHAIN_ID=.*|VAULT_CHAIN_ID=10143|" \
  -e "s|^MONAD_RPC_URL=.*|MONAD_RPC_URL=$RPC|" \
  .env
echo ">>> .env updated for Monad testnet."

echo ""
echo "Verify the live game end to end (spends ~0.1 MON, wins it back):"
echo "  set -a && . ./.env && set +a"
echo "  RPC_URL=$RPC VAULT_CONTRACT_ADDRESS=$ADDR PLAYER_KEY=<attacker key> node scripts/e2e.mjs"
echo ""
echo "Then start the app:"
echo "  env \$(grep -v '^#' .env | xargs -d '\\n') npx vite dev --port 8080"
