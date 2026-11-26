import { keccak256, TransactionReceiptNotFoundError } from "viem";
import { anvilChainId, qieMainnetChainId, sameHex } from "./chain.ts";
import { type DemoProgress, type DemoRun, demoMainnetBlock, demoMainnetRegistry, demoStep, demoSteps, type VerifiedStep } from "./demo-run.ts";
import { deployment } from "./deployment.ts";
import { registryAbi } from "./generated/registry.ts";
import { maxPassportHistoryBlocks, passportReader } from "./passport.ts";
import { validateReceipt } from "./receipt.ts";
import { matchesRegistryDomain, matchesRegistryImage } from "./registry-image.ts";

type Configuration = ReturnType<typeof deployment>;

export function demoConfiguration() {
  const config = deployment();
  const { target, firstBlock } = config;
  const mode = process.env.POURLEDGER_DEMO_OPERATOR;
  if (process.env.VERCEL || !(
    mode === "mainnet" && target.chainId === qieMainnetChainId && sameHex(target.registry, demoMainnetRegistry) && firstBlock === demoMainnetBlock ||
    mode === "anvil" && target.chainId === anvilChainId
  )) throw new Error("The demonstration runner is disabled for this deployment.");
  return config;
}

export function isOperatorHost(headers: Headers) {
  const host = headers.get("host") ?? "";
  const forwarded = headers.get("x-forwarded-host");
  return /^(127\.0\.0\.1|localhost):[1-9][0-9]{0,4}$/.test(host) && (!forwarded || forwarded === host);
}

export async function verifyDemo(run: DemoRun, config: Configuration): Promise<DemoProgress> {
  const { reader, target, firstBlock } = config;
  const chainId = await reader.getChainId();
  if (chainId !== target.chainId) throw new Error("The verification RPC is on the wrong chain.");
  const head = await reader.getBlockNumber();
  const snapshotNumber = head - BigInt(target.confirmations - 1);
  if (snapshotNumber < firstBlock) throw new Error("Waiting for registry confirmation depth.");
  const read = { address: target.registry, abi: registryAbi, blockNumber: snapshotNumber } as const;
  const [snapshot, code, domain] = await Promise.all([
    reader.getBlock({ blockNumber: snapshotNumber }),
    reader.getCode({ address: target.registry, blockNumber: snapshotNumber }),
    reader.readContract({ ...read, functionName: "domainSeparatorV4" }),
  ]);
  if (!matchesRegistryImage(code) || !matchesRegistryDomain(domain, target)) throw new Error("Registry bytecode or signing domain does not match.");

  const verified: VerifiedStep[] = [];
  async function progress(state: DemoProgress["state"], next?: DemoProgress["next"]): Promise<DemoProgress> {
    const [currentChain, currentBlock] = await Promise.all([reader.getChainId(), reader.getBlock({ blockNumber: snapshotNumber })]);
    if (!snapshot.hash || currentChain !== chainId || currentBlock.hash !== snapshot.hash) throw new Error("The verification snapshot changed. Check again.");
    const indexed = process.env.POURLEDGER_INDEX_READ_DATABASE_URL;
    const passportHistoryAvailable = indexed
      ? await passportReader(config).then(() => true, () => false)
      : snapshotNumber - firstBlock + 1n <= maxPassportHistoryBlocks;
    return {
      verified, state, next, snapshotBlock: String(snapshotNumber), snapshotHash: snapshot.hash,
      passportHistoryAvailable,
    };
  }
  for (const key of demoSteps(run)) {
    const attempt = run.attempts[key];
    if (!attempt) return progress("ready", key);
    if (!attempt.hash) return progress("recover", key);
    const hash = attempt.hash;
    const step = demoStep(run, key, verified);
    const receipt = await reader.getTransactionReceipt({ hash }).catch((error) => {
      if (error instanceof TransactionReceiptNotFoundError) return null;
      throw error;
    });
    if (!receipt || receipt.blockNumber > snapshotNumber) return progress("pending", key);
    const [tx, block] = await Promise.all([
      reader.getTransaction({ hash }), reader.getBlock({ blockNumber: receipt.blockNumber }),
    ]);
    if (!block.hash || receipt.blockNumber < firstBlock || receipt.blockHash !== block.hash || tx.blockHash !== block.hash ||
        tx.blockNumber !== receipt.blockNumber || !sameHex(receipt.transactionHash, hash) || !sameHex(tx.hash, hash) ||
        !receipt.to || !tx.to || !sameHex(receipt.to, target.registry) || !sameHex(tx.to, target.registry) ||
        !sameHex(tx.from, step.account) || !sameHex(receipt.from, step.account) || tx.nonce !== attempt.nonce ||
        tx.value !== 0n || !sameHex(keccak256(tx.input), attempt.calldataHash)) {
      throw new Error("Transaction, sender, nonce, calldata or canonical receipt does not match the saved proposal.");
    }
    if (receipt.status === "reverted") return progress("reverted", key);
    const { id } = validateReceipt({ actualChainId: chainId, target, hash, receipt, expected: step.expected });
    verified.push({ key, hash, block: String(receipt.blockNumber), blockHash: block.hash, id: id?.toString() });
  }

  const id = (step: VerifiedStep["key"]) => BigInt(verified.find((item) => item.key === step)?.id ?? "0");
  const [project, element, lot, assignment] = await Promise.all([
    reader.readContract({ ...read, functionName: "projects", args: [id("project")] }),
    reader.readContract({ ...read, functionName: "elements", args: [id("element")] }),
    reader.readContract({ ...read, functionName: "materialLots", args: [id("register")] }),
    reader.readContract({ ...read, functionName: "assignments", args: [id("assign")] }),
  ]);
  const fields = (key: VerifiedStep["key"]) => demoStep(run, key, verified).expected.fields;
  if (project[0] !== fields("project").projectHash || !sameHex(project[1], String(fields("project").supervisor)) ||
      element[0] !== id("project") || element[1] !== fields("element").elementCodeHash || element[2] !== 2 ||
      lot[0] !== id("project") || lot[1] !== fields("register").lotHash || !sameHex(lot[2], String(fields("register").supplier)) ||
      lot[3] !== 1 || lot[4] !== 100n || lot[5] !== 100n || lot[6] !== 60n || lot[7] !== fields("register").unitCode || lot[8] !== 2 ||
      assignment[0] !== id("register") || assignment[1] !== id("element") || assignment[2] !== 60n ||
      assignment[3] !== fields("assign").evidenceHash || !sameHex(assignment[4], String(fields("assign").engineer))) {
    throw new Error("Confirmed project, lot, element or assignment state differs from the demonstration.");
  }
  if (run.accounts.lab) {
    const lab = await reader.readContract({ ...read, functionName: "labEvidenceRecords", args: [id("lab")] });
    if (lab[0] !== id("register") || lab[1] !== fields("lab").sampleHash || lab[2] !== fields("lab").resultsHash ||
        !sameHex(lab[3], run.accounts.lab)) throw new Error("Confirmed laboratory state differs from the demonstration.");
  }
  return progress("complete");
}
