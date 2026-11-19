import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bytesToHex, encodeAbiParameters, encodeEventTopics, hexToBytes, type Hex, type Log, type TransactionReceipt } from "viem";
import { matchesTarget, parseCoordinates, passportPath, type RegistryTarget } from "../lib/chain.ts";
import { hashEvidence, verifyEvidence } from "../lib/evidence.ts";
import { registryAbi, registryImage } from "../lib/generated/registry.ts";
import { ReceiptError, validateReceipt } from "../lib/receipt.ts";
import { matchesRegistryImage } from "../lib/registry-image.ts";

const registry = "0x0000000000000000000000000000000000000001";
const inspector = "0x0000000000000000000000000000000000000002";
const target = { chainId: 31337, registry, confirmations: 1 } as const satisfies RegistryTarget;
const transactionHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const blockHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const conditionHash = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const fields = { lotId: 5n, projectId: 1n, inspector, decision: 2, acceptedQuantity: 100n, conditionHash } as const;
const eventName = "LotDecisionRecorded";
const topics = encodeEventTopics({ abi: registryAbi, eventName, args: fields }) as Log["topics"];
const data = encodeAbiParameters([{ type: "uint8" }, { type: "uint128" }, { type: "bytes32" }], [fields.decision, fields.acceptedQuantity, conditionHash]);
const log: Log<bigint, number, false> = { address: registry, topics, data, logIndex: 0, transactionIndex: 0, removed: false, blockNumber: 4n, blockHash, transactionHash };
const receipt = {
  logs: [log], status: "success", transactionHash, blockHash, blockNumber: 4n, transactionIndex: 0,
  to: registry, from: inspector, type: "legacy", contractAddress: null, gasUsed: 1n, cumulativeGasUsed: 1n,
  effectiveGasPrice: 1n, logsBloom: "0x",
} as const satisfies TransactionReceipt;
const proof = { target, hash: transactionHash, receipt, actualChainId: target.chainId, expected: { name: eventName, fields } } as const;

function rejects(overrides: Partial<Parameters<typeof validateReceipt>[0]>, reason: ReceiptError["reason"]) {
  assert.throws(() => validateReceipt({ ...proof, ...overrides }), (error) => error instanceof ReceiptError && error.reason === reason);
}

test("a receipt must have matching fields and event coordinates", () => {
  assert.deepEqual(validateReceipt(proof).fields, fields);
  rejects({ expected: { name: eventName, fields: { ...fields, acceptedQuantity: 101n } } }, "mismatch");
  rejects({ expected: { name: eventName, fields: { ...fields, inspector: registry } } }, "mismatch");
  rejects({ logIndex: 1 }, "mismatch");
});

test("wrong chain, contract, hash, and event signature are rejected", () => {
  rejects({ actualChainId: 1983 }, "mismatch");
  rejects({ target: { ...target, registry: inspector } }, "mismatch");
  rejects({ hash: blockHash }, "mismatch");
  rejects({ expected: { name: "ElementCreated", fields } }, "mismatch");
});

test("missing, reverted, malformed, removed and ambiguous receipts or logs fail closed", () => {
  rejects({ receipt: null }, "missing");
  rejects({ receipt: { ...receipt, status: "reverted" } }, "reverted");
  rejects({ receipt: { ...receipt, logs: [] } }, "mismatch");
  rejects({ receipt: { ...receipt, logs: [{ ...log, data: "0x01" }] } }, "mismatch");
  rejects({ receipt: { ...receipt, logs: [{ ...log, removed: true }] } }, "mismatch");
  rejects({ receipt: { ...receipt, logs: [{ ...log, blockNumber: 9n }] } }, "mismatch");
  rejects({ receipt: { ...receipt, logs: [log, { ...log, logIndex: 1 }] } }, "mismatch");
});

test("passport coordinates round trip and reject invalid or mismatched values", () => {
  const params = { chain: "31337", registry, kind: "element", id: "5" };
  const parsed = parseCoordinates(params);
  assert.ok(parsed && matchesTarget(parsed, target));
  assert.equal(passportPath(parsed), `/passport/31337/${registry}/element/5`);
  assert.equal(matchesTarget(parsed, { ...target, chainId: 1983 }), false);
  assert.equal(matchesTarget(parsed, { ...target, registry: inspector }), false);
  for (const bad of [{ id: "0" }, { id: "05" }, { id: "9".repeat(78) }, { id: "1e2" }, { chain: "1990" }, { kind: "project" }, { registry: "0x0000" }]) {
    assert.equal(parseCoordinates({ ...params, ...bad }), undefined);
  }
});

test("browser evidence verification compares exact bytes and enforces the size bound", async () => {
  const original = new File(["inspection\n"], "report.txt");
  const expected = await hashEvidence(original);
  assert.equal(await verifyEvidence(new File(["inspection\n"], "renamed.txt"), expected), true);
  assert.equal(await verifyEvidence(new File(["inspection\r\n"], "report.txt"), expected), false);
  await assert.rejects(hashEvidence({ size: 26 * 1024 * 1024, arrayBuffer: async () => { throw new Error("read should not occur"); } }), /25 MiB/);
});

test("registry verification checks the exact compiled image outside immutable slots", async () => {
  const artifactUrl = new URL("../../../out/PourLedgerRegistry.sol/PourLedgerRegistry.json", import.meta.url);
  const artifact = JSON.parse(await readFile(artifactUrl, "utf8")) as { deployedBytecode: { object: Hex } };
  const code = hexToBytes(artifact.deployedBytecode.object);
  for (const { start, length } of registryImage.immutableRanges) code.fill(1, start, start + length);
  assert.equal(matchesRegistryImage(bytesToHex(code)), true);
  code[0] ^= 1;
  assert.equal(matchesRegistryImage(bytesToHex(code)), false);
  assert.equal(matchesRegistryImage("0x"), false);
});
