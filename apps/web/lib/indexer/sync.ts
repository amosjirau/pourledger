import type { PoolClient } from "pg";
import type { Hash } from "viem";
import { sameHex, type RegistryTarget } from "../chain.ts";
import type { deployment } from "../deployment.ts";
import { registryAbi } from "../generated/registry.ts";
import { validateReceipt } from "../receipt.ts";
import { matchesRegistryDomain, matchesRegistryImage } from "../registry-image.ts";
import { type Counts, countNames, decodeRegistryEvent, type IndexedEvent, type RawEvent, reconcileCounts } from "./events.ts";
import { appendIndexRange, type Checkpoint, indexScope, indexState, indexStatus, recentCheckpoints, rollbackIndex } from "./store.ts";

export type Reader = ReturnType<typeof deployment>["reader"];
const maxRange = 2_000n;
const maxBatchEvents = 1_024;

export async function chainCounts(reader: Reader, target: RegistryTarget, blockNumber: bigint): Promise<Counts> {
  const values = await Promise.all(countNames.map(async (name) => [name, String(await reader.readContract({
    address: target.registry, abi: registryAbi, functionName: name, blockNumber,
  }))]));
  return Object.fromEntries(values) as Counts;
}

export async function verifyRegistryAt(reader: Reader, target: RegistryTarget, blockNumber: bigint) {
  const [code, domain] = await Promise.all([
    reader.getCode({ address: target.registry, blockNumber }),
    reader.readContract({ address: target.registry, abi: registryAbi, functionName: "domainSeparatorV4", blockNumber }),
  ]);
  if (!matchesRegistryImage(code) || !matchesRegistryDomain(domain, target)) throw new Error("Registry runtime or signing domain did not match.");
}

function logKey(log: RawEvent) {
  return `${log.blockNumber}:${log.logIndex}`;
}

function logOrder(a: RawEvent, b: RawEvent) {
  return a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1;
}

async function matching<T>(readers: Reader[], read: (reader: Reader) => Promise<T>, key: (value: T) => string) {
  const results = await Promise.allSettled(readers.map(async (reader) => {
    const value = await read(reader);
    return { reader, value, fingerprint: key(value) };
  }));
  const groups = new Map<string, { reader: Reader; value: T }[]>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { fingerprint, ...entry } = result.value;
    const group = groups.get(fingerprint) ?? [];
    group.push(entry);
    groups.set(fingerprint, group);
  }
  // Two matching answers are required and any competing quorum is ambiguous.
  const agreed = [...groups.values()].filter((group) => group.length >= 2);
  if (agreed.length !== 1) throw new Error("RPC endpoints did not independently agree on the canonical range or checkpoint.");
  return agreed[0];
}

async function blockHash(reader: Reader, blockNumber: bigint) {
  const block = await reader.getBlock({ blockNumber });
  if (!block.hash || block.number !== blockNumber) throw new Error("RPC did not return the requested canonical block.");
  return block.hash.toLowerCase() as Hash;
}

async function rangeLogs(reader: Reader, target: RegistryTarget, fromBlock: bigint, toBlock: bigint, anchor: Hash | null) {
  const [endHash, logs, previous] = await Promise.all([
    blockHash(reader, toBlock),
    reader.getLogs({ address: target.registry, fromBlock, toBlock }),
    anchor ? blockHash(reader, fromBlock - 1n) : null,
  ]);
  if (previous !== anchor || logs.length > maxBatchEvents) throw new Error("Registry range exceeds limits or no longer follows its checkpoint.");
  const seen = new Set<string>();
  const sorted = logs.sort(logOrder);
  for (const log of sorted) {
    if (!log.blockHash || !log.transactionHash || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0 ||
        log.blockNumber < fromBlock || log.blockNumber > toBlock || log.removed || !sameHex(log.address, target.registry) || seen.has(logKey(log))) {
      throw new Error("RPC returned duplicate or out-of-range registry logs.");
    }
    seen.add(logKey(log));
  }
  return { endHash, logs: sorted };
}

async function checkReceipts(reader: Reader, target: RegistryTarget, events: IndexedEvent[]) {
  const blocks = new Map<bigint, Promise<Hash>>();
  const receipts = new Map<Hash, ReturnType<Reader["getTransactionReceipt"]>>();
  const knownLogs = new Set(events.map((event) => `${event.transactionHash}:${event.logIndex}`));
  for (let offset = 0; offset < events.length; offset += 8) {
    await Promise.all(events.slice(offset, offset + 8).map(async (event) => {
      const block = blocks.get(event.blockNumber) ?? blockHash(reader, event.blockNumber);
      blocks.set(event.blockNumber, block);
      const request = receipts.get(event.transactionHash) ?? reader.getTransactionReceipt({ hash: event.transactionHash });
      receipts.set(event.transactionHash, request);
      const [hash, receipt] = await Promise.all([block, request]);
      if (hash !== event.blockHash.toLowerCase() || !sameHex(receipt.blockHash, hash) || receipt.blockNumber !== event.blockNumber) {
        throw new Error("Registry event receipt is not in its canonical block.");
      }
      validateReceipt({ actualChainId: target.chainId, target, hash: event.transactionHash, receipt, logIndex: event.logIndex,
        expected: { name: event.name, fields: event.args } });
      // Receipts also reveal incomplete log results within transactions known to the range query.
      for (const log of receipt.logs) {
        if (sameHex(log.address, target.registry) && !knownLogs.has(`${receipt.transactionHash}:${log.logIndex}`)) {
          throw new Error("The range omitted a registry log from a known receipt.");
        }
      }
    }));
  }
}

export async function verifyRange(readers: Reader[], target: RegistryTarget, start: bigint, end: bigint, previous: Hash | null, counts: Counts) {
  const quorum = await matching(readers, (reader) => rangeLogs(reader, target, start, end, previous), ({ endHash, logs }) =>
    JSON.stringify([endHash, logs.map((log) => [logKey(log), log.blockHash, log.transactionHash, log.topics, log.data])]).toLowerCase());
  const { endHash, logs } = quorum[0].value;
  const events = logs.map(decodeRegistryEvent);
  const verifiedState = await matching(quorum.map(({ reader }) => reader), async (reader) => {
    const [actual] = await Promise.all([chainCounts(reader, target, end), verifyRegistryAt(reader, target, end)]);
    return actual;
  }, JSON.stringify);
  const next = reconcileCounts(counts, events, verifiedState[0].value);
  // Receipt or historical state failures on one agreeing RPC can use another agreeing history.
  for (const { reader } of verifiedState) {
    try {
      await checkReceipts(reader, target, events);
      const current = await matching(readers, (peer) => blockHash(peer, end), String);
      if (current[0].value !== endHash) throw new Error("Confirmed branch changed during range verification.");
      return { checkpoint: { end_block: String(end), block_hash: endHash, counts: next }, events };
    } catch (error) {
      if (error instanceof Error && /^(Missing|The range omitted)/.test(error.message)) throw error;
    }
  }
  throw new Error("No agreeing RPC verified the range receipts, registry image, and historical state.");
}

export async function syncCycle(db: PoolClient, config: { target: RegistryTarget; firstBlock: bigint; readers: Reader[] }, range = 512n) {
  const { target, firstBlock, readers } = config;
  const scope = indexScope(target);
  let state = await indexState(db, scope);
  const probes = await Promise.allSettled(readers.map(async (reader) => ({ reader, chain: await reader.getChainId(), head: await reader.getBlockNumber() })));
  const heads = probes.flatMap((probe) => probe.status === "fulfilled" && probe.value.chain === target.chainId ? [probe.value] : [])
    .sort((a, b) => a.head > b.head ? -1 : a.head < b.head ? 1 : 0);
  if (heads.length < 2) throw new Error("Fewer than two RPC endpoints returned the configured chain and a usable head.");
  const confirmed = heads[1].head - BigInt(target.confirmations - 1);
  if (confirmed < firstBlock || confirmed < BigInt(state.tip)) throw new Error("RPC confirmation head is behind the registry or checkpoint.");
  const peers = heads.map(({ reader }) => reader);
  if (state.tip_hash) {
    const tip = await matching(peers, (peer) => blockHash(peer, BigInt(state.tip)), String);
    if (tip[0].value !== state.tip_hash) {
      await indexStatus(db, scope, "syncing", confirmed);
      const recent = await recentCheckpoints(db, scope);
      let ancestor: Checkpoint | undefined;
      for (const checkpoint of recent.slice(1)) {
        const canonical = await matching(peers, (peer) => blockHash(peer, BigInt(checkpoint.end_block)), String);
        if (canonical[0].value === checkpoint.block_hash) { ancestor = checkpoint; break; }
      }
      if (!ancestor && recent.length === 32) throw new Error("Reorganization exceeds the automatic rollback window. Review and rebuild the index.");
      await rollbackIndex(db, scope, ancestor, firstBlock);
      state = await indexState(db, scope);
    }
  }
  const start = BigInt(state.tip) + 1n;
  if (start > confirmed) {
    // Refresh authenticated runtime/domain and counters even while the tip is unchanged.
    const healthy = await Promise.allSettled(peers.map(async (peer) => {
      await verifyRegistryAt(peer, target, confirmed);
      reconcileCounts(state.counts, [], await chainCounts(peer, target, confirmed));
    }));
    if (healthy.filter((result) => result.status === "fulfilled").length < 2) throw new Error("Indexed counters or registry identity could not be reverified by two RPCs.");
    await indexStatus(db, scope, "ready", confirmed);
    return { ready: true, range };
  }
  await indexStatus(db, scope, "syncing", confirmed);
  for (let tried = 0; tried < 12; tried++) {
    const end = start + range - 1n < confirmed ? start + range - 1n : confirmed;
    let result: Awaited<ReturnType<typeof verifyRange>>;
    try {
      result = await verifyRange(peers, target, start, end, state.tip_hash, state.counts);
    } catch (error) {
      if (range === 1n) throw error;
      range = range / 2n || 1n;
      continue;
    }
    await appendIndexRange(db, scope, state.tip, result.checkpoint, result.events);
    const ready = end === confirmed;
    if (ready) await indexStatus(db, scope, "ready", confirmed);
    return { ready, range: range * 2n < maxRange ? range * 2n : maxRange };
  }
  throw new Error("The adaptive registry scan exhausted its range attempts.");
}
