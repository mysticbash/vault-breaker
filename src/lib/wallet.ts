import { create } from "zustand";

/**
 * Real wallet connection over EIP-6963 discovery with a legacy window.ethereum
 * fallback. No fake addresses — if no injected wallet exists we say so.
 *
 * Discovery matters: with more than one extension installed, window.ethereum is
 * whichever wallet won the race to inject, so reaching for it directly can hand
 * the user's MetaMask request to a different wallet (or to nothing at all).
 */

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
};

type ProviderInfo = { uuid: string; name: string; icon: string; rdns: string };
type ProviderDetail = { info: ProviderInfo; provider: EthereumProvider };

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export const MONAD_CHAIN_ID = 10143;
const MONAD_CHAIN_ID_HEX = "0x279f";

export type WalletState = {
  address: string | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  hasProvider: boolean;
  providers: ProviderDetail[];
  selectedRdns: string | null;
  connect: (rdns?: string) => Promise<string | null>;
  disconnect: () => void;
  switchToMonad: () => Promise<boolean>;
  ensureChain: () => Promise<boolean>;
};

/** The provider the user picked, else the best announced one, else legacy. */
export function activeProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const { providers, selectedRdns } = useWallet.getState();
  if (selectedRdns) {
    const picked = providers.find((p) => p.info.rdns === selectedRdns);
    if (picked) return picked.provider;
  }
  const metamask = providers.find((p) => p.info.rdns === "io.metamask");
  if (metamask) return metamask.provider;
  if (providers[0]) return providers[0].provider;
  return window.ethereum ?? null;
}

function describeError(e: any): string {
  const code = e?.code;
  if (code === 4001) return "Connection request rejected in your wallet.";
  if (code === -32002) return "A wallet request is already pending — open MetaMask and approve or dismiss it.";
  if (code === 4900 || code === 4901) return "Your wallet is locked or disconnected. Unlock MetaMask and try again.";
  return e instanceof Error ? e.message : "Wallet connection failed";
}

export const useWallet = create<WalletState>((set, get) => ({
  address: null,
  chainId: null,
  connecting: false,
  error: null,
  hasProvider: false,
  providers: [],
  selectedRdns: null,

  connect: async (rdns?: string) => {
    if (rdns) set({ selectedRdns: rdns });
    // Extensions can inject after our bundle runs, so re-scan on every attempt
    // rather than trusting a flag captured at module load.
    discoverProviders();
    const provider = activeProvider();
    if (!provider) {
      set({ error: "No wallet found. Install MetaMask (or any EVM wallet) and reload.", hasProvider: false });
      return null;
    }
    set({ connecting: true, error: null, hasProvider: true });
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.length) throw new Error("No accounts returned — unlock your wallet and try again.");
      const chainIdHex = (await provider.request({ method: "eth_chainId" })) as string;
      const address: string | null = accounts[0] ?? null;
      set({ address, chainId: parseInt(chainIdHex, 16), connecting: false });

      bindEvents(provider);
      return address;
    } catch (e) {
      set({ connecting: false, error: describeError(e) });
      return null;
    }
  },

  disconnect: () => set({ address: null, chainId: null, error: null }),

  switchToMonad: async () => {
    const provider = activeProvider();
    if (!provider) return false;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: MONAD_CHAIN_ID_HEX }],
      });
      set({ chainId: MONAD_CHAIN_ID, error: null });
      return true;
    } catch (err: any) {
      // 4902 = chain not added yet. Some wallets report the same case as -32603.
      if (err?.code === 4902 || err?.code === -32603) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: MONAD_CHAIN_ID_HEX,
                chainName: "Monad Testnet",
                nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
                rpcUrls: ["https://testnet-rpc.monad.xyz"],
                blockExplorerUrls: ["https://testnet.monadexplorer.com"],
              },
            ],
          });
          set({ chainId: MONAD_CHAIN_ID, error: null });
          return true;
        } catch (addErr) {
          set({ error: describeError(addErr) });
          return false;
        }
      }
      set({ error: describeError(err) });
      return false;
    }
  },

  ensureChain: async () => {
    if (get().chainId === MONAD_CHAIN_ID) return true;
    return get().switchToMonad();
  },
}));

let bound: EthereumProvider | null = null;
function bindEvents(provider: EthereumProvider) {
  if (bound === provider) return;
  bound = provider;
  provider.on?.("accountsChanged", (accs: string[]) => {
    useWallet.setState({ address: accs?.length ? (accs[0] as string) : null });
  });
  provider.on?.("chainChanged", (cid: string) => {
    useWallet.setState({ chainId: parseInt(cid, 16) });
  });
}

/** EIP-6963: ask every installed wallet to announce itself. */
function discoverProviders() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  if (!useWallet.getState().hasProvider && window.ethereum) {
    useWallet.setState({ hasProvider: true });
  }
}

let listening = false;

/** Discover wallets and silently restore an existing authorization on mount. */
export function watchProvider() {
  if (typeof window === "undefined") return;

  if (!listening) {
    listening = true;
    window.addEventListener("eip6963:announceProvider", (event: any) => {
      const detail = event.detail as ProviderDetail;
      if (!detail?.info?.rdns) return;
      const { providers } = useWallet.getState();
      if (providers.some((p) => p.info.rdns === detail.info.rdns)) return;
      useWallet.setState({ providers: [...providers, detail], hasProvider: true });
      restoreAccounts();
    });
    // Wallets that inject late fire this instead of announcing immediately.
    window.addEventListener("ethereum#initialized", discoverProviders, { once: true });
  }

  discoverProviders();
  restoreAccounts();
  // A late-loading extension can miss the first request; ask once more.
  setTimeout(discoverProviders, 500);
}

function restoreAccounts() {
  const provider = activeProvider();
  if (!provider || useWallet.getState().address) return;
  provider
    .request({ method: "eth_accounts" })
    .then(async (accounts) => {
      const accs = accounts as string[];
      if (!accs?.length) return;
      const cid = (await provider.request({ method: "eth_chainId" })) as string;
      useWallet.setState({ address: accs[0] as string, chainId: parseInt(cid, 16) });
      bindEvents(provider);
    })
    .catch(() => {});
}
