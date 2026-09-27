import { useWallet, activeProvider, MONAD_CHAIN_ID } from "./wallet";

/**
 * Send a real wallet transaction through the injected EIP-1193 provider.
 * Returns the transaction hash. Throws on user rejection / failure.
 *
 * Every numeric field must be a 0x-quantity: a bare decimal string is read as
 * hex by wallets, which silently inflates the amount the user is asked to pay.
 */

function toQuantity(value: bigint | string | number): `0x${string}` {
  const asBigInt =
    typeof value === "bigint"
      ? value
      : typeof value === "number"
        ? BigInt(Math.trunc(value))
        : BigInt(value.startsWith("0x") ? value : value.trim());
  return `0x${asBigInt.toString(16)}`;
}

async function rpc<T>(
  provider: NonNullable<Window["ethereum"]>,
  method: string,
  params: unknown[],
): Promise<T> {
  return (await provider.request({ method, params })) as T;
}

export async function sendTransaction(params: {
  from: string;
  to: string;
  data: `0x${string}`;
  value: string; // wei as decimal string
}): Promise<string> {
  const provider = activeProvider();
  if (!provider) throw new Error("No wallet provider found.");

  const chainId = useWallet.getState().chainId;
  if (chainId !== MONAD_CHAIN_ID && chainId !== 31337) {
    const ok = await useWallet.getState().switchToMonad();
    if (!ok) throw new Error("Please switch your wallet to Monad testnet (chain 10143) or local Anvil.");
  }

  const value = toQuantity(params.value);
  const base = { from: params.from, to: params.to, data: params.data, value };

  // Monad bills the full gas limit rather than gas used, and its estimator
  // reserves ~4M gas for the winning path because the payout call forwards all
  // remaining gas. Left alone that dwarfs the 0.05 MON fee or trips an
  // insufficient-balance rejection. A claim costs ~140k (~180k when it wins),
  // so pad the estimate but hold it under a known-safe ceiling.
  const GAS_CEILING = 250_000n;
  let gas: `0x${string}`;
  try {
    const estimate = BigInt(await rpc<string>(provider, "eth_estimateGas", [base]));
    const padded = (estimate * 125n) / 100n;
    gas = toQuantity(padded > GAS_CEILING ? GAS_CEILING : padded);
  } catch {
    gas = toQuantity(GAS_CEILING);
  }

  // Monad testnet base fee sits around 50-100 gwei, far above an Ethereum-style
  // default, so a hardcoded low cap would get the tx rejected outright.
  let maxFeePerGas: `0x${string}`;
  let maxPriorityFeePerGas: `0x${string}`;
  try {
    const gasPrice = BigInt(await rpc<string>(provider, "eth_gasPrice", []));
    maxFeePerGas = toQuantity((gasPrice * 2n) as bigint);
    maxPriorityFeePerGas = toQuantity(gasPrice / 10n);
  } catch {
    maxFeePerGas = toQuantity(120_000_000_000n);
    maxPriorityFeePerGas = toQuantity(2_000_000_000n);
  }

  const txHash = await rpc<string>(provider, "eth_sendTransaction", [
    { ...base, gas, maxFeePerGas, maxPriorityFeePerGas },
  ]);

  if (!txHash) throw new Error("Wallet returned no transaction hash.");
  return txHash;
}
