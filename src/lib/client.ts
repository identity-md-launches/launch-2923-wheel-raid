import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com", {
    timeout: 12_000,
    retryCount: 1,
  }),
});
