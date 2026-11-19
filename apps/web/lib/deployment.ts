import { createPublicClient, http } from "viem";
import { address, anvilChainId, integer, qieTestnetChainId, supportedChain, type RegistryTarget } from "./chain.ts";

export function deployment() {
  const { POURLEDGER_CHAIN_ID, POURLEDGER_REGISTRY, POURLEDGER_RPC_URL, POURLEDGER_DEPLOYMENT_BLOCK, POURLEDGER_CONFIRMATIONS, POURLEDGER_PUBLIC_ORIGIN, POURLEDGER_TESTNET_EXPLORER_ORIGIN, POURLEDGER_MAINNET_EXPLORER_ORIGIN } = process.env;
  if (!POURLEDGER_CHAIN_ID || !POURLEDGER_REGISTRY || !POURLEDGER_RPC_URL || !POURLEDGER_DEPLOYMENT_BLOCK || !POURLEDGER_CONFIRMATIONS) {
    throw new Error("Live verification requires a configured registry, RPC, deployment block, and confirmation depth.");
  }
  const chainId = supportedChain(POURLEDGER_CHAIN_ID);
  if (!chainId) throw new Error("Unsupported deployment chain.");
  const rpc = new URL(POURLEDGER_RPC_URL);
  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(rpc.hostname);
  if (chainId === anvilChainId ? !localhost || !["http:", "https:"].includes(rpc.protocol) : rpc.protocol !== "https:") {
    throw new Error("Invalid RPC transport for the configured chain.");
  }
  const explorerUrl = chainId === anvilChainId ? undefined
    : chainId === qieTestnetChainId ? POURLEDGER_TESTNET_EXPLORER_ORIGIN : POURLEDGER_MAINNET_EXPLORER_ORIGIN;
  const explorer = explorerUrl ? new URL(explorerUrl) : undefined;
  if (explorer && (explorer.protocol !== "https:" || explorer.username || explorer.password ||
      explorer.pathname !== "/" || explorer.search || explorer.hash)) {
    throw new Error("Set the reviewed chain explorer to a bare HTTPS origin.");
  }
  const target: RegistryTarget = {
    chainId,
    registry: address(POURLEDGER_REGISTRY),
    confirmations: Number(integer(POURLEDGER_CONFIRMATIONS, 10_000n)),
    explorerOrigin: explorer?.origin,
  };
  const origin = POURLEDGER_PUBLIC_ORIGIN ? new URL(POURLEDGER_PUBLIC_ORIGIN) : undefined;
  if (origin && (origin.username || origin.password || (origin.protocol !== "https:" &&
      !(chainId === anvilChainId && origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))))) {
    throw new Error("Invalid public passport origin.");
  }
  return {
    target,
    origin: origin?.origin,
    firstBlock: integer(POURLEDGER_DEPLOYMENT_BLOCK, undefined, 0n),
    reader: createPublicClient({ transport: http(rpc.toString(), { timeout: 8_000, retryCount: 0 }), cacheTime: 0 }),
  };
}
