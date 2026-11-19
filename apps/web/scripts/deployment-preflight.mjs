import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createPublicClient, getContractAddress, http, keccak256, size } from "viem";
import { address, anvilChainId, supportedChain } from "../lib/chain.ts";
import { registryImage } from "../lib/generated/registry.ts";

const chain = supportedChain(process.env.POURLEDGER_CHAIN_ID ?? "");
const sender = address(process.env.POURLEDGER_DEPLOYER ?? "");
if (!chain) throw new Error("Set POURLEDGER_CHAIN_ID to 31337, 1983, or 1990 explicitly.");
const rpc = new URL(process.env.POURLEDGER_RPC_URL ?? "");
const local = ["localhost", "127.0.0.1", "[::1]"].includes(rpc.hostname);
if ((chain === anvilChainId && !(local && ["http:", "https:"].includes(rpc.protocol))) ||
    (chain !== anvilChainId && rpc.protocol !== "https:") || rpc.username || rpc.password) {
  throw new Error("Use a loopback Anvil RPC for 31337 or an approved HTTPS RPC for QIE.");
}
const artifactPath = new URL("../../../out/PourLedgerRegistry.sol/PourLedgerRegistry.json", import.meta.url);
const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
const initCode = artifact.bytecode.object;
if (keccak256(initCode) !== registryImage.creationHash ||
    keccak256(artifact.deployedBytecode.object) !== registryImage.normalizedHash) {
  throw new Error("Compiled bytecode does not match the generated registry bindings.");
}
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: new URL("../../../", import.meta.url), encoding: "utf8",
}).trim();
const reader = createPublicClient({ transport: http(rpc.toString(), { timeout: 12_000, retryCount: 0 }) });
const observedChain = await reader.getChainId();
if (observedChain !== chain) throw new Error(`RPC returned chain ${observedChain}; expected ${chain}.`);
const [gas, gasPrice, minedNonce, pendingNonce, blockNumber] = await Promise.all([
  reader.estimateGas({ account: sender, data: initCode }),
  reader.getGasPrice(),
  reader.getTransactionCount({ address: sender, blockTag: "latest" }),
  reader.getTransactionCount({ address: sender, blockTag: "pending" }),
  reader.getBlockNumber(),
]);
if (await reader.getChainId() !== chain) throw new Error("RPC chain changed during preflight.");
if (pendingNonce !== minedNonce) throw new Error("Sender has pending transactions. Review the nonce before preparing a deployment.");

console.log(JSON.stringify({
  status: "UNSIGNED",
  chainId: chain,
  rpcHost: rpc.hostname,
  sourceCommit,
  compiler: artifact.metadata.compiler.version,
  settings: { evmVersion: artifact.metadata.settings.evmVersion, optimizer: artifact.metadata.settings.optimizer, metadata: artifact.metadata.settings.metadata },
  creationCodeBytes: size(initCode),
  creationCodeKeccak256: registryImage.creationHash,
  normalizedRuntimeKeccak256: registryImage.normalizedHash,
  observedBlock: blockNumber,
  proposedAddress: getContractAddress({ from: sender, nonce: BigInt(pendingNonce) }),
  gasEstimate: gas,
  gasPriceWei: gasPrice,
  estimatedFeeWei: gas * gasPrice,
  unsignedTransaction: { chainId: chain, from: sender, nonce: pendingNonce, value: "0x0", data: initCode },
}, (_key, value) => typeof value === "bigint" ? String(value) : value, 2));
