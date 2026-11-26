import { getAbiItem, type Hash, type Log } from "viem";
import { type Coordinates, matchesTarget, sameHex } from "./chain.ts";
import type { deployment } from "./deployment.ts";
import type { EventCursor, EventPage } from "./indexer/events.ts";
import { verifiedIndexSnapshot } from "./indexer/snapshot.ts";
import { type EventFilters, indexEvents, indexedAssigned } from "./indexer/store.ts";
import { registryAbi } from "./generated/registry.ts";
import { validateReceipt, type ExpectedEvent } from "./receipt.ts";
import { matchesRegistryDomain, matchesRegistryImage } from "./registry-image.ts";

export const maxPassportHistoryBlocks = 50_000n;
const chunkSize = 2_000n;
const maxRecords = 40;

export class PassportUnavailable extends Error {}

type Configuration = ReturnType<typeof deployment>;

export async function passportReader({ target, reader, firstBlock }: Configuration) {
  const actualChainId = await reader.getChainId();
  if (actualChainId !== target.chainId) throw new PassportUnavailable("The verification RPC returned a different chain ID.");
  const head = await reader.getBlockNumber();
  const confirmedHead = head - BigInt(target.confirmations - 1);
  if (confirmedHead < firstBlock) throw new PassportUnavailable("Waiting for the configured confirmation depth.");
  const index = await verifiedIndexSnapshot(target, firstBlock, confirmedHead, reader).catch((error) => {
    throw new PassportUnavailable(error instanceof Error && error.constructor === Error ? error.message : "Registry index could not be independently verified.");
  });
  const blockNumber = index?.blockNumber ?? confirmedHead;
  if (!index && blockNumber - firstBlock + 1n > maxPassportHistoryBlocks) throw new PassportUnavailable("This registry needs a verified indexer for its history range.");
  const [snapshot, code] = await Promise.all([
    reader.getBlock({ blockNumber }),
    reader.getCode({ address: target.registry, blockNumber }),
  ]);
  if (!snapshot.hash || snapshot.number !== blockNumber || (index && !sameHex(snapshot.hash, index.checkedHash))) {
    throw new PassportUnavailable("The requested canonical snapshot changed.");
  }
  if (!matchesRegistryImage(code)) throw new PassportUnavailable("The confirmed address does not match the compiled registry.");
  const separator = await reader.readContract({ address: target.registry, abi: registryAbi, functionName: "domainSeparatorV4", blockNumber });
  if (!matchesRegistryDomain(separator, target)) throw new PassportUnavailable("The registry returned a different signing domain.");

  const events = {
    ProjectCreated: getAbiItem({ abi: registryAbi, name: "ProjectCreated" }),
    ProjectRoleUpdated: getAbiItem({ abi: registryAbi, name: "ProjectRoleUpdated" }),
    ElementCreated: getAbiItem({ abi: registryAbi, name: "ElementCreated" }),
    MaterialLotRegistered: getAbiItem({ abi: registryAbi, name: "MaterialLotRegistered" }),
    LotDecisionRecorded: getAbiItem({ abi: registryAbi, name: "LotDecisionRecorded" }),
    LotAssignedToElement: getAbiItem({ abi: registryAbi, name: "LotAssignedToElement" }),
    TestEvidenceAttached: getAbiItem({ abi: registryAbi, name: "TestEvidenceAttached" }),
  };
  const receipts = new Map<Hash, ReturnType<typeof reader.getTransactionReceipt>>();
  const blocks = new Map<bigint, ReturnType<typeof reader.getBlock>>();
  const canonical = (number: bigint) => {
    const block = blocks.get(number) ?? reader.getBlock({ blockNumber: number });
    blocks.set(number, block);
    return block;
  };

  async function logs<T extends Log<bigint, number, false> & { args: ExpectedEvent["fields"] }>(
    name: keyof typeof events,
    filters: EventFilters,
    readPage: (range: { fromBlock: bigint; toBlock: bigint }) => Promise<T[]>, cursor?: EventCursor, latestRoles = false,
  ) {
    const results: T[] = [];
    let next: string | undefined;
    if (index) {
      const page = await indexEvents(index.db, target, blockNumber, name, filters, cursor, latestRoles);
      results.push(...page.rows as unknown as T[]);
      next = page.next;
    } else {
      if (cursor) throw new PassportUnavailable("Indexed history is unavailable. Open the passport without a page cursor.");
      for (let fromBlock = firstBlock; fromBlock <= blockNumber; fromBlock += chunkSize) {
        const end = fromBlock + chunkSize - 1n;
        const page = await readPage({ fromBlock, toBlock: end < blockNumber ? end : blockNumber });
        results.push(...page);
        if (results.length > maxRecords) throw new PassportUnavailable("This passport exceeds the direct verification limit. A verified indexer is required.");
      }
    }
    const seen = new Set<string>();
    const rows = await Promise.all(results.map(async (log) => {
      const key = `${log.transactionHash}:${log.logIndex}`;
      if (seen.has(key)) throw new PassportUnavailable("The RPC returned a duplicate event.");
      seen.add(key);
      if (log.blockNumber < firstBlock || log.blockNumber > blockNumber || log.removed ||
          !sameHex(log.address, target.registry) ||
          !Object.entries(filters).every(([field, id]) => {
            const actual = log.args[field];
            return Array.isArray(id) ? typeof actual === "bigint" && id.includes(actual) : actual === id;
          })) {
        throw new PassportUnavailable("An event falls outside the requested passport coordinates.");
      }
      const receiptRequest = receipts.get(log.transactionHash) ?? reader.getTransactionReceipt({ hash: log.transactionHash });
      receipts.set(log.transactionHash, receiptRequest);
      const [receipt, block] = await Promise.all([receiptRequest, canonical(log.blockNumber)]);
      if (receipt.blockHash !== log.blockHash || block.hash !== log.blockHash || receipt.blockNumber !== log.blockNumber ||
          block.number !== log.blockNumber) {
        throw new PassportUnavailable("An event changed block. Retry after the chain settles.");
      }
      validateReceipt({
        actualChainId, target, hash: log.transactionHash, receipt, logIndex: log.logIndex,
        expected: { name, fields: log.args },
      });
      return { args: log.args as T["args"], hash: log.transactionHash, block: log.blockNumber, index: log.logIndex };
    }));
    return { rows, next };
  }
  const query = { address: target.registry, strict: true } as const;
  const projectLogs = async (projectId: readonly bigint[]) => (await logs("ProjectCreated", { projectId }, (range) =>
    reader.getLogs({ ...query, ...range, event: events.ProjectCreated, args: { projectId } }))).rows;
  const projectRoles = (projectId: bigint, cursor?: EventCursor) => logs("ProjectRoleUpdated", { projectId }, (range) =>
    reader.getLogs({ ...query, ...range, event: events.ProjectRoleUpdated, args: { projectId } }), cursor, true);
  const projectElements = (projectId: bigint, cursor?: EventCursor) => logs("ElementCreated", { projectId }, (range) =>
    reader.getLogs({ ...query, ...range, event: events.ElementCreated, args: { projectId } }), cursor);
  const projectLots = (projectId: bigint, cursor?: EventCursor) => logs("MaterialLotRegistered", { projectId }, (range) =>
    reader.getLogs({ ...query, ...range, event: events.MaterialLotRegistered, args: { projectId } }), cursor);
  const projectDecisions = async (projectId: bigint, lotIds: bigint[]) => (await logs("LotDecisionRecorded", index ? { projectId, lotId: lotIds } : { projectId }, (range) =>
    reader.getLogs({ ...query, ...range, event: events.LotDecisionRecorded, args: { projectId } }))).rows;
  const elementLogs = async (elementId: bigint) => (await logs("ElementCreated", { elementId }, (range) =>
    reader.getLogs({ ...query, ...range, event: events.ElementCreated, args: { elementId } }))).rows;
  function readLot(lotId: bigint) {
    return reader.readContract({ address: target.registry, abi: registryAbi, functionName: "materialLots", args: [lotId], blockNumber });
  }
  function readElement(elementId: bigint) {
    return reader.readContract({ address: target.registry, abi: registryAbi, functionName: "elements", args: [elementId], blockNumber });
  }
  async function assignments(filter: { elementId: bigint } | { lotId: bigint }, projectId: bigint, cursor?: EventCursor) {
    const entries = await logs("LotAssignedToElement", filter, (range) =>
      reader.getLogs({ ...query, ...range, event: events.LotAssignedToElement, args: filter }), cursor);
    const rows = await Promise.all(entries.rows.map(async (record) => {
      const a = record.args;
      const [stored, element, lot] = await Promise.all([
        reader.readContract({ address: target.registry, abi: registryAbi, functionName: "assignments", args: [a.assignmentId], blockNumber }),
        readElement(a.elementId), readLot(a.lotId),
      ]);
      if (stored[0] !== a.lotId || stored[1] !== a.elementId || stored[2] !== a.usedQuantity ||
          !sameHex(stored[3], a.evidenceHash) || !sameHex(stored[4], a.engineer) ||
          element[0] !== projectId || lot[0] !== projectId || (lot[8] !== 2 && lot[8] !== 3) ||
          a.usedQuantity <= 0n || a.usedQuantity > lot[6] || lot[6] > lot[5] || lot[5] > lot[4]) {
        throw new PassportUnavailable("Assignment does not match the registry state.");
      }
      return { ...a, hash: record.hash, unitCode: lot[7], lotStatus: lot[8] };
    }));
    return { rows, next: entries.next };
  }
  async function lot(lotId: bigint, cursor?: EventCursor) {
    const [projectId, lotHash, supplier, materialType, declaredQuantity, acceptedQuantity, assignedQuantity, unitCode, status] = await readLot(lotId);
    if (!projectId) return null;
    const [{ rows: registered }, { rows: decisions }, labResults] = await Promise.all([
      logs("MaterialLotRegistered", { lotId }, (range) =>
        reader.getLogs({ ...query, ...range, event: events.MaterialLotRegistered, args: { lotId } })),
      logs("LotDecisionRecorded", { lotId }, (range) =>
        reader.getLogs({ ...query, ...range, event: events.LotDecisionRecorded, args: { lotId } })),
      logs("TestEvidenceAttached", { lotId }, (range) =>
        reader.getLogs({ ...query, ...range, event: events.TestEvidenceAttached, args: { lotId } }), cursor),
    ]);
    const registration = registered[0]?.args;
    if (registered.length !== 1 || !registration || registration.projectId !== projectId ||
        !sameHex(registration.lotHash, lotHash) || !sameHex(registration.supplier, supplier) ||
        registration.materialType !== materialType || registration.declaredQuantity !== declaredQuantity ||
        !sameHex(registration.unitCode, unitCode)) {
      throw new PassportUnavailable("Lot registration does not match the registry state.");
    }
    if (declaredQuantity <= 0n || assignedQuantity > acceptedQuantity || acceptedQuantity > declaredQuantity ||
        !(status === 1 || status === 4 ? acceptedQuantity === 0n : status === 2 ? acceptedQuantity === declaredQuantity :
          status === 3 && acceptedQuantity > 0n && acceptedQuantity < declaredQuantity)) {
      throw new PassportUnavailable("Lot quantities and inspector status do not agree.");
    }
    const decisionRecord = decisions[0];
    const decision = decisionRecord?.args;
    if (decisions.length !== (status === 1 ? 0 : 1) || (decision &&
        (decision.projectId !== projectId || decision.decision !== status || decision.acceptedQuantity !== acceptedQuantity))) {
      throw new PassportUnavailable("Lot decision does not match the registry state.");
    }
    const labEvidence = await Promise.all(labResults.rows.map(async (record) => {
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
      registrationHash: registered[0].hash, decision: decision && { ...decision, hash: decisionRecord.hash }, labEvidence, labNext: labResults.next,
    };
  }
  async function verifySnapshot() {
    const [end, chainId] = await Promise.all([reader.getBlock({ blockNumber }), reader.getChainId()]);
    await index?.verifyUnchanged();
    if (end.hash !== snapshot.hash || end.number !== blockNumber || chainId !== target.chainId) {
      throw new PassportUnavailable("The verified snapshot changed during the request. Retry after the chain settles.");
    }
  }
  const assignedTotal = (id: bigint, entries: EventPage<{ usedQuantity: bigint }>) => index
    ? indexedAssigned(index.db, target, blockNumber, id) : entries.rows.reduce((sum, item) => sum + item.usedQuantity, 0n);
  return { blockNumber, indexLag: index?.lag, assignedTotal, projectLogs, projectRoles, projectElements, projectLots, projectDecisions, elementLogs, readElement, readLot, assignments, lot, verifySnapshot };
}

export async function loadPassport(coordinates: Coordinates, config: Configuration, pages: { assignments?: EventCursor; lab?: EventCursor } = {}) {
  if (!matchesTarget(coordinates, config.target)) return null;
  const context = await passportReader(config);
  const id = coordinates.id;
  const { blockNumber } = context;
  type Assignments = Awaited<ReturnType<typeof context.assignments>>;
  type Lot = NonNullable<Awaited<ReturnType<typeof context.lot>>>;
  let record: { projectId: bigint; assignments: Assignments } & (
    { kind: "lot"; lot: Lot } | { kind: "element"; elementCodeHash: Hash; elementType: number; creationHash: Hash }
  );
  if (coordinates.kind === "lot") {
    const lot = await context.lot(id, pages.lab);
    if (!lot) return null;
    const assignments = await context.assignments({ lotId: id }, lot.projectId, pages.assignments);
    if (await context.assignedTotal(id, assignments) !== lot.assignedQuantity) {
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
    const assignments = await context.assignments({ elementId: id }, projectId, pages.assignments);
    record = { kind: "element" as const, projectId, elementCodeHash, elementType, creationHash: created[0].hash, assignments };
  }
  await context.verifySnapshot();
  const { assignments, ...rest } = record;
  return { blockNumber, indexLag: context.indexLag, ...rest, assignments: assignments.rows, assignmentNext: assignments.next };
}
