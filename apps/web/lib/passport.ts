import { getAbiItem, type Hash, type Log } from "viem";
import { type Coordinates, matchesTarget, sameHex } from "./chain.ts";
import type { deployment } from "./deployment.ts";
import { registryAbi } from "./generated/registry.ts";
import { validateReceipt, type ExpectedEvent } from "./receipt.ts";

const maxBlocks = 50_000n;
const chunkSize = 2_000n;
const maxRecords = 40;

export class PassportUnavailable extends Error {}

type Configuration = ReturnType<typeof deployment>;

async function passportReader({ target, reader, firstBlock }: Configuration) {
  const actualChainId = await reader.getChainId();
  if (actualChainId !== target.chainId) throw new PassportUnavailable("The verification RPC returned a different chain ID.");
  const head = await reader.getBlockNumber();
  const blockNumber = head - BigInt(target.confirmations - 1);
  if (blockNumber < firstBlock) throw new PassportUnavailable("Waiting for the configured confirmation depth.");
  if (blockNumber - firstBlock + 1n > maxBlocks) throw new PassportUnavailable("This registry needs a verified indexer for its history range.");
  const [snapshot, code] = await Promise.all([
    reader.getBlock({ blockNumber }),
    reader.getCode({ address: target.registry, blockNumber }),
  ]);
  if (!code || code === "0x") throw new PassportUnavailable("No registry code exists at the confirmed block.");

  const events = {
    ElementCreated: getAbiItem({ abi: registryAbi, name: "ElementCreated" }),
    MaterialLotRegistered: getAbiItem({ abi: registryAbi, name: "MaterialLotRegistered" }),
    LotDecisionRecorded: getAbiItem({ abi: registryAbi, name: "LotDecisionRecorded" }),
    LotAssignedToElement: getAbiItem({ abi: registryAbi, name: "LotAssignedToElement" }),
    TestEvidenceAttached: getAbiItem({ abi: registryAbi, name: "TestEvidenceAttached" }),
  };
  const receipts = new Map<Hash, ReturnType<typeof reader.getTransactionReceipt>>();
  const blocks = new Map<bigint, ReturnType<typeof reader.getBlock>>();
  const canonical = (number: bigint) => {
    if (!blocks.has(number)) blocks.set(number, reader.getBlock({ blockNumber: number }));
    return blocks.get(number)!;
  };

  async function logs<T extends Log<bigint, number, false> & { args: ExpectedEvent["fields"] }>(
    name: keyof typeof events,
    filters: { elementId: bigint } | { lotId: bigint },
    readPage: (range: { fromBlock: bigint; toBlock: bigint }) => Promise<T[]>,
  ) {
    const results: T[] = [];
    for (let fromBlock = firstBlock; fromBlock <= blockNumber; fromBlock += chunkSize) {
      const end = fromBlock + chunkSize - 1n;
      const page = await readPage({ fromBlock, toBlock: end < blockNumber ? end : blockNumber });
      results.push(...page);
      if (results.length > maxRecords) throw new PassportUnavailable("This passport exceeds the direct verification limit. A verified indexer is required.");
    }
    const seen = new Set<string>();
    return Promise.all(results.map(async (log) => {
      const key = `${log.transactionHash}:${log.logIndex}`;
      if (seen.has(key)) throw new PassportUnavailable("The RPC returned a duplicate event.");
      seen.add(key);
      if (log.blockNumber < firstBlock || log.blockNumber > blockNumber || log.removed ||
          !sameHex(log.address, target.registry) ||
          !Object.entries(filters).every(([field, id]) => Object.entries(log.args).some(([key, value]) => key === field && value === id))) {
        throw new PassportUnavailable("An event falls outside the requested passport coordinates.");
      }
      if (!receipts.has(log.transactionHash)) {
        receipts.set(log.transactionHash, reader.getTransactionReceipt({ hash: log.transactionHash }));
      }
      const [receipt, block] = await Promise.all([receipts.get(log.transactionHash)!, canonical(log.blockNumber)]);
      if (receipt.blockHash !== log.blockHash || block.hash !== log.blockHash || receipt.blockNumber !== log.blockNumber) {
        throw new PassportUnavailable("An event changed block. Retry after the chain settles.");
      }
      validateReceipt({
        actualChainId, target, hash: log.transactionHash, receipt, logIndex: log.logIndex,
        expected: { name, fields: log.args },
      });
      return { args: log.args as T["args"], hash: log.transactionHash };
    }));
  }
  const query = { address: target.registry, strict: true } as const;
  const elementLogs = (elementId: bigint) => logs("ElementCreated", { elementId }, (range) =>
    reader.getLogs({ ...query, ...range, event: events.ElementCreated, args: { elementId } }));
  function readLot(lotId: bigint) {
    return reader.readContract({ address: target.registry, abi: registryAbi, functionName: "materialLots", args: [lotId], blockNumber });
  }
  function readElement(elementId: bigint) {
    return reader.readContract({ address: target.registry, abi: registryAbi, functionName: "elements", args: [elementId], blockNumber });
  }
  async function assignments(filter: { elementId: bigint } | { lotId: bigint }, projectId: bigint) {
    const entries = await logs("LotAssignedToElement", filter, (range) =>
      reader.getLogs({ ...query, ...range, event: events.LotAssignedToElement, args: filter }));
    return Promise.all(entries.map(async (record) => {
      const a = record.args;
      const [stored, element, lot] = await Promise.all([
        reader.readContract({ address: target.registry, abi: registryAbi, functionName: "assignments", args: [a.assignmentId], blockNumber }),
        readElement(a.elementId), readLot(a.lotId),
      ]);
      if (stored[0] !== a.lotId || stored[1] !== a.elementId || stored[2] !== a.usedQuantity ||
          !sameHex(stored[3], a.evidenceHash) || !sameHex(stored[4], a.engineer) ||
          element[0] !== projectId || lot[0] !== projectId || (lot[8] !== 2 && lot[8] !== 3) || a.usedQuantity <= 0n) {
        throw new PassportUnavailable("Assignment does not match the registry state.");
      }
      return { ...a, hash: record.hash, unitCode: lot[7] };
    }));
  }
  async function lot(lotId: bigint) {
    const [projectId, lotHash, supplier, materialType, declaredQuantity, acceptedQuantity, assignedQuantity, unitCode, status] = await readLot(lotId);
    if (!projectId) return null;
    const [registered, decisions, labResults] = await Promise.all([
      logs("MaterialLotRegistered", { lotId }, (range) =>
        reader.getLogs({ ...query, ...range, event: events.MaterialLotRegistered, args: { lotId } })),
      logs("LotDecisionRecorded", { lotId }, (range) =>
        reader.getLogs({ ...query, ...range, event: events.LotDecisionRecorded, args: { lotId } })),
      logs("TestEvidenceAttached", { lotId }, (range) =>
        reader.getLogs({ ...query, ...range, event: events.TestEvidenceAttached, args: { lotId } })),
    ]);
    const registration = registered[0]?.args;
    if (registered.length !== 1 || !registration || registration.projectId !== projectId ||
        !sameHex(registration.lotHash, lotHash) || !sameHex(registration.supplier, supplier) ||
        registration.materialType !== materialType || registration.declaredQuantity !== declaredQuantity ||
        !sameHex(registration.unitCode, unitCode)) {
      throw new PassportUnavailable("Lot registration does not match the registry state.");
    }
    const decisionRecord = decisions[0];
    const decision = decisionRecord?.args;
    if (decisions.length !== (status === 1 ? 0 : 1) || (decision &&
        (decision.projectId !== projectId || decision.decision !== status || decision.acceptedQuantity !== acceptedQuantity))) {
      throw new PassportUnavailable("Lot decision does not match the registry state.");
    }
    const labEvidence = await Promise.all(labResults.map(async (record) => {
      const result = record.args;
      const stored = await reader.readContract({
        address: target.registry, abi: registryAbi, functionName: "labEvidenceRecords", args: [result.testId], blockNumber,
      });
      if (stored[0] !== lotId || !sameHex(stored[1], result.sampleHash) || !sameHex(stored[2], result.resultsHash) || !sameHex(stored[3], result.lab)) {
        throw new PassportUnavailable("Lab evidence does not match the registry state.");
      }
      return { ...result, hash: record.hash };
    }));
    return {
      lotId, projectId, lotHash, supplier, materialType, declaredQuantity, acceptedQuantity, assignedQuantity, unitCode, status,
      registrationHash: registered[0].hash, decision: decision && { ...decision, hash: decisionRecord.hash }, labEvidence,
    };
  }
  return { blockNumber, snapshot, reader, elementLogs, readElement, assignments, lot };
}

export async function loadPassport(coordinates: Coordinates, config: Configuration) {
  if (!matchesTarget(coordinates, config.target)) return null;
  const context = await passportReader(config);
  const id = coordinates.id;
  const { blockNumber, snapshot, reader } = context;
  let record;
  if (coordinates.kind === "lot") {
    const lot = await context.lot(id);
    if (!lot) return null;
    const assignments = await context.assignments({ lotId: id }, lot.projectId);
    if (assignments.reduce((sum, item) => sum + item.usedQuantity, 0n) !== lot.assignedQuantity) {
      throw new PassportUnavailable("Assignment history does not match total assigned quantity.");
    }
    record = { kind: "lot" as const, projectId: lot.projectId, lot, assignments };
  } else {
    const [projectId, elementCodeHash, elementType] = await context.readElement(id);
    if (!projectId) return null;
    const created = await context.elementLogs(id);
    const fields = created[0]?.args;
    if (created.length !== 1 || !fields || fields.projectId !== projectId ||
        !sameHex(fields.elementCodeHash, elementCodeHash) || fields.elementType !== elementType) {
      throw new PassportUnavailable("Element creation does not match the registry state.");
    }
    const assignments = await context.assignments({ elementId: id }, projectId);
    record = { kind: "element" as const, projectId, elementCodeHash, elementType, creationHash: created[0].hash, assignments };
  }
  const [end, chainId] = await Promise.all([reader.getBlock({ blockNumber }), reader.getChainId()]);
  if (end.hash !== snapshot.hash || chainId !== config.target.chainId) {
    throw new PassportUnavailable("The verified snapshot changed during the request. Retry after the chain settles.");
  }
  return { blockNumber, ...record };
}
