import { decodeEventLog, type Address, type Hash, type Hex, type Log } from "viem";
import { registryAbi } from "../generated/registry.ts";
import type { ExpectedEvent } from "../receipt.ts";

const events = registryAbi.filter((item) => item.type === "event");
export type EventName = ExpectedEvent["name"];
export type RawEvent = Pick<Log<bigint, number, false>, "address" | "blockNumber" | "blockHash" | "transactionHash" | "logIndex" | "data" | "topics" | "removed">;
export type IndexedEvent = RawEvent & { name: EventName; args: ExpectedEvent["fields"] };

export const counters = {
  ProjectCreated: ["projectCount", "projectId"],
  ElementCreated: ["elementCount", "elementId"],
  MaterialLotRegistered: ["lotCount", "lotId"],
  LotAssignedToElement: ["assignmentCount", "assignmentId"],
  TestEvidenceAttached: ["evidenceRecordCount", "testId"],
} as const;
export type CountName = (typeof counters)[keyof typeof counters][0];
export type Counts = Record<CountName, string>;
export const countNames = Object.values(counters).map(([name]) => name);
export const emptyCounts = Object.fromEntries(countNames.map((name) => [name, "0"])) as Counts;

export function decodeRegistryEvent(log: RawEvent): IndexedEvent {
  const decoded = decodeEventLog({ abi: events, strict: true, topics: log.topics, data: log.data });
  return { ...log, name: decoded.eventName, args: (decoded.args ?? {}) as IndexedEvent["args"] };
}

export function eventIdentity(event: IndexedEvent) {
  if (event.name === "LotDecisionRecorded") return event.args.lotId;
  if (Object.hasOwn(counters, event.name)) return event.args[counters[event.name as keyof typeof counters][1]];
}

export function reconcileCounts(previous: Counts, all: IndexedEvent[], actual: Counts) {
  const next = { ...previous };
  for (const event of all) {
    if (!Object.hasOwn(counters, event.name)) continue;
    const [name, field] = counters[event.name as keyof typeof counters];
    const expected = BigInt(next[name]) + 1n;
    if (event.args[field] !== expected) throw new Error(`Missing or out-of-order ${event.name} ID ${expected}.`);
    next[name] = String(expected);
  }
  for (const name of countNames) {
    if (next[name] !== actual[name]) throw new Error(`Missing or truncated events for ${name}.`);
  }
  return next;
}

export type EventCursor = { block: bigint; index: number };
export type EventPage<T> = { rows: T[]; next?: string };
export function parseEventCursor(value?: string): EventCursor | undefined {
  if (value === undefined) return undefined;
  if (!/^(0|[1-9][0-9]{0,18})\.(0|[1-9][0-9]{0,9})$/.test(value)) throw new Error("Invalid history cursor.");
  const [blockText, indexText] = value.split(".");
  const block = BigInt(blockText);
  const index = Number(indexText);
  if (block > 9_223_372_036_854_775_807n || index > 2_147_483_647) throw new Error("Invalid history cursor.");
  return { block, index };
}

export type EventRow = {
  block_no: string; log_index: number; block_hash: Hash; tx_hash: Hash;
  name: EventName; topics: RawEvent["topics"]; data: Hex;
};

export function restoreEvent(row: EventRow, address: Address) {
  const event = decodeRegistryEvent({ address, blockNumber: BigInt(row.block_no), blockHash: row.block_hash,
    transactionHash: row.tx_hash, logIndex: row.log_index, topics: row.topics, data: row.data, removed: false });
  if (event.name !== row.name) throw new Error("Indexed event type does not match its topics.");
  return event;
}
