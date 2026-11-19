import { createPublicClient, http } from "viem";
import { address, anvilChainId, integer, qieTestnetChainId, type RegistryTarget } from "./chain.ts";

export function deployment() {
  const { POURLEDGER_CHAIN_ID, POURLEDGER_REGISTRY, POURLEDGER_RPC_URL, POURLEDGER_DEPLOYMENT_BLOCK, POURLEDGER_CONFIRMATIONS, POURLEDGER_PUBLIC_ORIGIN } = process.env;
  if (!POURLEDGER_CHAIN_ID || !POURLEDGER_REGISTRY || !POURLEDGER_RPC_URL || !POURLEDGER_DEPLOYMENT_BLOCK || !POURLEDGER_CONFIRMATIONS) {
    throw new Error("Live verification requires a configured registry, RPC, deployment block, and confirmation depth.");
  }
  const chainId = Number(POURLEDGER_CHAIN_ID);
  if (chainId !== anvilChainId && chainId !== qieTestnetChainId) throw new Error("Unsupported deployment chain.");
  const rpc = new URL(POURLEDGER_RPC_URL);
  const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(rpc.hostname);
  if (chainId === anvilChainId ? !localhost || !["http:", "https:"].includes(rpc.protocol) : rpc.protocol !== "https:") {
    throw new Error("Invalid RPC transport for the configured chain.");
  }
  const target: RegistryTarget = {
    chainId,
    registry: address(POURLEDGER_REGISTRY),
    confirmations: Number(integer(POURLEDGER_CONFIRMATIONS, 10_000n)),
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
