import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { coinbaseWallet } from "wagmi/connectors/coinbaseWallet";
import { sepolia } from "viem/chains";
export { API, INSTALLATION, STORAGE_KEY, MAX_HP } from "./constants";
export const config = createConfig({
  chains: [sepolia],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    coinbaseWallet({
      appName: "Wheel Raid",
    }),
  ],
  transports: {
    [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com", {
      timeout: 12_000,
    }),
  },
});
