import { execFileSync } from "node:child_process";
import { createPublicClient, encodeFunctionData, http, keccak256, stringToHex } from "viem";
import { address, integer, passportPath, qieMainnetChainId, sameHex } from "../lib/chain.ts";
import { registryAbi, registryImage } from "../lib/generated/registry.ts";
import { loadPassport, PassportUnavailable } from "../lib/passport.ts";
import { matchesRegistryDomain, matchesRegistryImage } from "../lib/registry-image.ts";

const registry = "0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63";
const deploymentBlock = 12_148_098n;
const transactionHash = "0x86f4ed6cf808c6373a742dd9589c369ac5469f2b94759bbb1e770fa59599da23";
const publicOrigin = "https://pourledger-one.vercel.app";
const explorerOrigin = "https://mainnet.qie.digital";
const chainId = qieMainnetChainId;
const countFunctions = ["projectCount", "elementCount", "lotCount", "assignmentCount", "evidenceRecordCount"];
const verify = process.argv.includes("--verify");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: new URL("../../../", import.meta.url), encoding: "utf8",
}).trim();

const manifest = {
  schemaVersion: 1,
  sourceCommit,
  repository: "https://github.com/amosjirau/pourledger",
  production: { publicOrigin, workspace: `${publicOrigin}/live`, rootDirectory: "apps/web", nodeMajor: 24 },
  ownerDeploymentRecord: {
    chainId, registry, deploymentBlock, transactionHash,
    transactionUrl: `${explorerOrigin}/tx/${transactionHash}`,
    expectedCreationHash: registryImage.creationHash,
    expectedNormalizedRuntimeHash: registryImage.normalizedHash,
  },
  registryCheck: { status: "not-requested" },
  passportChecks: [],
};

if (process.env.POURLEDGER_REVIEWED_SUPERVISOR) {
  const supervisor = address(process.env.POURLEDGER_REVIEWED_SUPERVISOR);
  const reference = "POURLEDGER HACKATHON SYNTHETIC DEMONSTRATION V1";
  const projectHash = keccak256(stringToHex(reference));
  manifest.unsignedDemoProject = {
    status: "proposal-only",
    reference,
    projectHash,
    supervisor,
    request: {
      chainId, from: supervisor, to: registry, value: "0x0",
      data: encodeFunctionData({ abi: registryAbi, functionName: "createProject", args: [projectHash, supervisor] }),
    },
  };
}

async function checked(label, operation) {
  try { return await operation(); }
  catch (error) {
    const name = typeof error?.name === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(error.name) ? error.name : 'Error';
    const status = error?.status ?? error?.cause?.status;
    throw new ReleaseCheckError(`${label} failed (${name}${Number.isInteger(status) ? `, HTTP ${status}` : ''}). Check endpoint connectivity and historical RPC support.`);
  }
}

async function checkRegistry(reader, target) {
  const observedChainId = await checked('eth_chainId', () => reader.getChainId());
  if (observedChainId !== chainId) throw new ReleaseCheckError(`RPC returned chain ${observedChainId}, expected ${chainId}.`);
  const [receipt, transaction, block, head] = await Promise.all([
    checked('deployment receipt', () => reader.getTransactionReceipt({ hash: transactionHash })), 
    checked('deployment transaction', () => reader.getTransaction({ hash: transactionHash })), 
    checked('canonical deployment block', () => reader.getBlock({ blockNumber: deploymentBlock })), 
    checked('current block number', () => reader.getBlockNumber()),
  ]);
  if (receipt.status !== "success" || receipt.transactionHash !== transactionHash ||
      !receipt.contractAddress || !sameHex(receipt.contractAddress, registry) ||
      receipt.blockNumber !== deploymentBlock || receipt.blockHash !== block.hash ||
      transaction.hash !== transactionHash || transaction.blockNumber !== deploymentBlock ||
      transaction.blockHash !== block.hash || transaction.to !== null ||
      keccak256(transaction.input) !== registryImage.creationHash) {
    throw new ReleaseCheckError("The canonical creation transaction or receipt differs from the pinned record.");
  }
  const snapshotBlock = head - BigInt(target.confirmations - 1);
  if (snapshotBlock < deploymentBlock) throw new ReleaseCheckError("The deployment has not reached the requested confirmation depth.");
  const read = { address: registry, abi: registryAbi, blockNumber: snapshotBlock };
  const [snapshot, code, domain, counts] = await Promise.all([
    checked('confirmed snapshot block', () => reader.getBlock({ blockNumber: snapshotBlock })), 
    checked('historical runtime bytecode', () => reader.getCode({ address: registry, blockNumber: snapshotBlock })), 
    checked("historical signing domain", () => reader.readContract({ ...read, functionName: "domainSeparatorV4" })),
    Promise.all(countFunctions.map(async (functionName) => [
      functionName, await checked(`historical ${functionName}`, () => reader.readContract({ ...read, functionName })),
    ])),
  ]);
  if (!matchesRegistryImage(code) || !matchesRegistryDomain(domain, target)) {
    throw new ReleaseCheckError("The confirmation snapshot runtime or EIP-712 domain differs from the compiled registry.");
  }
  const [chainAfter, snapshotAfter, creationAfter] = await Promise.all([
    checked('chain recheck', () => reader.getChainId()),
    checked('canonical snapshot recheck', () => reader.getBlock({ blockNumber: snapshotBlock })), 
    checked('canonical deployment recheck', () => reader.getBlock({ blockNumber: deploymentBlock })), 
  ]);
  if (chainAfter !== observedChainId || snapshotAfter.hash !== snapshot.hash || creationAfter.hash !== block.hash) {
    throw new ReleaseCheckError("The chain or canonical blocks changed during verification.");
  }
  return {
    status: "verified", observedChainId, canonicalDeploymentBlockHash: block.hash,
    head, snapshotBlock, snapshotBlockHash: snapshot.hash, confirmationDepth: target.confirmations,
    runtimeHash: keccak256(code), domainSeparator: domain, counts: Object.fromEntries(counts),
  };
}

class ReleaseCheckError extends Error {}

if (verify) {
  try {
    const rpc = URL.parse(process.env.POURLEDGER_MAINNET_READ_RPC ?? "");
    if (rpc?.protocol !== "https:" || rpc.username || rpc.password) {
      throw new ReleaseCheckError("Set POURLEDGER_MAINNET_READ_RPC to the approved HTTPS RPC.");
    }
    const confirmationValue = process.env.POURLEDGER_CONFIRMATIONS;
    if (!confirmationValue) throw new ReleaseCheckError("Set POURLEDGER_CONFIRMATIONS to the reviewed depth.");
    const confirmations = Number(integer(confirmationValue, 10_000n));
    const target = { chainId, registry, confirmations, explorerOrigin };
    const reader = createPublicClient({ transport: http(rpc.href, { timeout: 8_000, retryCount: 0 }), cacheTime: 0 });
    manifest.registryCheck = await checkRegistry(reader, target);
    for (const [kind, value] of [["lot", process.env.POURLEDGER_APPROVED_LOT_ID], ["element", process.env.POURLEDGER_APPROVED_ELEMENT_ID]]) {
      if (!value) continue;
      const coordinates = { ...target, kind, id: integer(value) };
      const path = passportPath(coordinates);
      try {
        const passport = await loadPassport(coordinates, { target, reader, firstBlock: deploymentBlock });
        manifest.passportChecks.push(passport
          ? { path, status: "receipts-verified", snapshotBlock: passport.blockNumber }
          : { path, status: "record-missing" });
        if (!passport) process.exitCode = 1;
      } catch (error) {
        manifest.passportChecks.push({
          path, status: "unverified",
          reason: error instanceof PassportUnavailable ? error.message : "Read-only passport RPC failed.",
        });
        process.exitCode = 1;
      }
    }
  } catch (error) {
    manifest.registryCheck = {
      status: "unverified",
      reason: error instanceof ReleaseCheckError ? error.message : "Read-only RPC or input validation failed before a named RPC operation.",
    };
    console.error(manifest.registryCheck.reason);
    process.exitCode = 1;
  }
}

console.log(JSON.stringify(manifest, (_key, value) => typeof value === "bigint" ? String(value) : value, 2));
