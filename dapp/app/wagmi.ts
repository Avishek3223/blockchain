import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

export const localhost31337 = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export const config = createConfig({
  chains: [localhost31337],
  connectors: [injected()],
  transports: { [localhost31337.id]: http("http://127.0.0.1:8545") },
  ssr: true,
});
