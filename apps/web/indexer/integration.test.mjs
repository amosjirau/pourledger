import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { encodeAbiParameters, encodeEventTopics, hashDomain, keccak256, stringToHex, toHex } from "viem";
import { parseCoordinates, passportPath } from "../lib/chain.ts";
import { registryAbi } from "../lib/generated/registry.ts";
import { counters, emptyCounts, parseEventCursor } from "../lib/indexer/events.ts";
import { appendIndexRange, indexEvents, indexPool, indexScope, indexState, indexStatus, initializeIndex, recentCheckpoints } from "../lib/indexer/store.ts";
import { syncCycle, verifyRange } from "../lib/indexer/sync.ts";
import { loadPassport, passportReader } from "../lib/passport.ts";
import { loadProjects } from "../lib/projects.ts";

const url = process.env.POURLEDGER_INDEX_TEST_DATABASE_URL;
assert.ok(url && ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname), "Set a disposable loopback PostgreSQL test URL.");
const target = { chainId: 1990, registry: "0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63", confirmations: 2 };
const firstBlock = 12_148_098n;
const initialHead = firstBlock + 50_130n;
const addr = "0x0000000000000000000000000000000000000010";
const digest = (value) => keccak256(stringToHex(value));
const projectHash = digest("synthetic fixture"), elementCodeHash = digest("C3"), lotHash = digest("rebar"), unitCode = digest("kg");
const conditionHash = digest("inspection"), evidenceHash = digest("placement"), sampleHash = digest("sample"), resultsHash = digest("lab");
const eventDefinitions = registryAbi.filter((event) => event.type === "event");
const artifact = JSON.parse(await readFile(new URL("../../../out/PourLedgerRegistry.sol/PourLedgerRegistry.json", import.meta.url), "utf8"));
const domain = hashDomain({ domain: { name: "PourLedgerRegistry", version: "1", chainId: BigInt(target.chainId), verifyingContract: target.registry }, types: {
  EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
} });

function registryFixture() {
  let fork = false;
  let head = initialHead;
  const events = [];
  const early = firstBlock + 2n;
  const late = initialHead - 2n;
  const blockHash = (block) => digest(`${block}:${fork && block >= late ? "alternative" : "original"}`);
  const add = (name, args, blockNumber = early) => {
    const abiEvent = eventDefinitions.find((event) => event.name === name);
    const unindexed = abiEvent.inputs.filter(({ indexed }) => !indexed);
    events.push({ name, args, blockNumber, logIndex: events.length, address: target.registry, removed: false,
      transactionHash: toHex(BigInt(events.length + 1), { size: 32 }),
      topics: encodeEventTopics({ abi: [abiEvent], eventName: name, args }),
      data: encodeAbiParameters(unindexed, unindexed.map(({ name }) => args[name])),
    });
  };
  for (const projectId of [1n, 2n, 3n]) add("ProjectCreated", { projectId, projectHash, supervisor: addr, creator: addr });
  add("ElementCreated", { elementId: 1n, projectId: 3n, elementCodeHash, elementType: 2, creator: addr });
  add("MaterialLotRegistered", { lotId: 1n, projectId: 3n, lotHash, supplier: addr, materialType: 1, declaredQuantity: 100n, unitCode });
  add("LotDecisionRecorded", { lotId: 1n, projectId: 3n, inspector: addr, decision: 2, acceptedQuantity: 100n, conditionHash });
  for (let assignmentId = 1n; assignmentId <= 45n; assignmentId++) {
    add("LotAssignedToElement", { assignmentId, lotId: 1n, elementId: 1n, usedQuantity: 1n, evidenceHash, engineer: addr });
  }
  add("TestEvidenceAttached", { testId: 1n, lotId: 1n, sampleHash, resultsHash, lab: addr });
  add("ProjectRoleUpdated", { projectId: 3n, account: addr, role: 1, enabled: true });
  add("ProjectRoleUpdated", { projectId: 3n, account: addr, role: 1, enabled: false }, late);

  function visible() { return fork ? events.slice(0, -1) : events; }
  const raw = (event) => ({ ...event, blockHash: blockHash(event.blockNumber) });
  const reader = ({ chain = 1990, fail = false, receiptFails = false, corruptCode = false, omit = "", duplicate = false, max = 2_000n, beforeLogs } = {}) => ({
    async getChainId() { if (fail) throw new Error("offline fixture endpoint"); return chain; },
    async getBlockNumber() { return head; },
    async getBlock({ blockNumber }) {
      if (blockNumber > head) throw new Error("fixture endpoint is behind");
      return { number: blockNumber, hash: blockHash(blockNumber) };
    },
    async getLogs({ fromBlock, toBlock }) {
      await beforeLogs?.();
      if (toBlock - fromBlock + 1n > max) throw new Error("fixture endpoint range limit");
      const logs = visible().filter((event) => event.blockNumber >= fromBlock && event.blockNumber <= toBlock && event.name !== omit).map(raw);
      if (duplicate && logs.length) logs.push(logs[0]);
      return logs;
    },
    async getCode() { return corruptCode ? "0x01" : artifact.deployedBytecode.object; },
    async getTransactionReceipt({ hash }) {
      if (receiptFails) throw new Error("fixture endpoint has no archive receipts");
      const event = visible().find((entry) => entry.transactionHash === hash);
      if (!event) throw new Error("fixture receipt to be verified is missing");
      const log = raw(event);
      return { transactionHash: hash, status: "success", blockNumber: log.blockNumber, blockHash: log.blockHash, logs: [log] };
    },
    async readContract({ functionName, blockNumber, args = [] }) {
      const counted = Object.entries(counters).find(([, [name]]) => name === functionName);
      if (counted) return BigInt(visible().filter(({ name, blockNumber: block }) => name === counted[0] && block <= blockNumber).length);
      switch (functionName) {
        case "domainSeparatorV4": return domain;
        case "projects": return [projectHash, addr];
        case "elements": return args[0] === 1n ? [3n, elementCodeHash, 2] : [0n, elementCodeHash, 0];
        case "materialLots": return [3n, lotHash, addr, 1, 100n, 100n, 45n, unitCode, 2];
        case "assignments": return [1n, 1n, 1n, evidenceHash, addr];
        case "labEvidenceRecords": return [1n, sampleHash, resultsHash, addr];
        case "hasProjectRole": return fork || blockNumber < late;
        default: throw new Error(`Unexpected fixture method ${functionName}`);
      }
    },
  });
  return { reader, early, late, blockHash, get head() { return head; }, advance() { head += 1n; }, reorg() { fork = true; head += 3n; } };
}

test("PostgreSQL backfill, failover, bounded pages and canonical recovery on a simulated QIE history", async (context) => {
  const pool = indexPool(url);
  let client = await pool.connect();
  const scope = indexScope(target);
  const fixture = registryFixture();
  const rpc = fixture.reader({ max: 900n });
  const readers = [fixture.reader({ fail: true }), fixture.reader({ receiptFails: true, max: 900n }), rpc];
  const config = { target, firstBlock, reader: rpc };
  await client.query(await readFile(new URL("./migrations/001_verified_registry.sql", import.meta.url), "utf8"));
  assert.equal(await indexState(client, scope), undefined, "Use a disposable database with no existing fixture state.");
  context.after(async () => {
    delete process.env.POURLEDGER_INDEX_READ_DATABASE_URL;
    await client.query("DELETE FROM registry_index.sync WHERE scope=$1", [scope]);
    client.release();
    await pool.end();
  });
  await initializeIndex(client, scope, firstBlock, target.confirmations);
  await assert.rejects(verifyRange([fixture.reader({ omit: "ProjectRoleUpdated" }), rpc], target, firstBlock, fixture.early, null, emptyCounts), /did not independently agree/);
  await assert.rejects(verifyRange([fixture.reader({ omit: "LotAssignedToElement" }), fixture.reader({ omit: "LotAssignedToElement" })], target, firstBlock, fixture.early, null, emptyCounts), /Missing or truncated/);
  await assert.rejects(verifyRange([fixture.reader({ duplicate: true }), rpc], target, firstBlock, fixture.early, null, emptyCounts), /did not independently agree/);
  await assert.rejects(verifyRange([fixture.reader({ corruptCode: true }), fixture.reader({ corruptCode: true })], target, firstBlock, fixture.early, null, emptyCounts), /did not independently agree/);
  await assert.rejects(verifyRange([rpc, rpc], { ...target, registry: addr }, firstBlock, fixture.early, null, emptyCounts), /did not independently agree/);
  await assert.rejects(syncCycle(client, { target, firstBlock, readers: [fixture.reader({ chain: 1 }), rpc] }), /Fewer than two RPC/);
  const first = await syncCycle(client, { target, firstBlock, readers });
  assert.equal(first.ready, false);
  const interrupted = await indexState(client, scope);
  client.release(true);
  client = await pool.connect();
  assert.equal((await initializeIndex(client, scope, firstBlock, 2)).tip, interrupted.tip);
  await assert.rejects(initializeIndex(client, scope, firstBlock + 1n, 2), /differs/);
  const staleRows = await indexEvents(pool, target, BigInt(interrupted.tip), "LotAssignedToElement", { lotId: 1n });
  await assert.rejects(appendIndexRange(client, scope, interrupted.tip, {
    end_block: String(BigInt(interrupted.tip) + 1n), block_hash: fixture.blockHash(BigInt(interrupted.tip) + 1n), counts: interrupted.counts,
  }, [staleRows.rows[0]], initialHead - 1n), { code: "23505" });
  assert.equal((await indexState(client, scope)).tip, interrupted.tip);
  assert.equal((await recentCheckpoints(client, scope))[0].end_block, interrupted.tip);
  process.env.POURLEDGER_INDEX_READ_DATABASE_URL = url;
  await assert.rejects(loadPassport({ ...target, kind: "lot", id: 1n }, config), /incomplete/);
  let range = first.range;
  for (let n = 0; n < 150; n++) {
    const result = await syncCycle(client, { target, firstBlock, readers }, range);
    range = result.range;
    if (result.ready) break;
  }
  const ready = await indexState(client, scope);
  assert.equal(ready.status, "ready");
  assert.equal(ready.tip, String(initialHead - 1n));
  assert.ok(BigInt(ready.tip) - firstBlock > 50_000n);
  const element = parseCoordinates({ chain: "1990", registry: target.registry, kind: "element", id: "1" });
  const lot = parseCoordinates({ chain: "1990", registry: target.registry, kind: "lot", id: "1" });
  for (const coordinates of [element, lot]) {
    const name = coordinates.kind;
    assert.equal(passportPath(coordinates), `/passport/1990/${target.registry.toLowerCase()}/${name}/1`);
    const all = [];
    let cursor;
    do {
      const passport = await loadPassport(coordinates, config, { assignments: parseEventCursor(cursor) });
      assert.equal(passport.projectId, 3n);
      assert.ok(passport.assignments.length <= 16);
      all.push(...passport.assignments.map(({ assignmentId }) => assignmentId));
      cursor = passport.assignmentNext;
    } while (cursor);
    assert.deepEqual(all, Array.from({ length: 45 }, (_, index) => BigInt(index + 1)));
  }
  const workspace = await loadProjects(config, 3n);
  assert.equal(workspace.records.roles[0].enabled, false);
  assert.equal(workspace.records.lots[0].assigned, 45n);
  assert.equal((await indexEvents(pool, target, BigInt(ready.tip), "TestEvidenceAttached", { entityId: 1n })).rows[0].args.testId, 1n);
  assert.equal((await indexEvents(pool, target, BigInt(ready.tip), "ProjectRoleUpdated", { projectId: 3n, account: addr, role: 1 })).rows.length, 2);
  await client.query("UPDATE registry_index.sync SET checked_at=now()-interval '3 minutes' WHERE scope=$1", [scope]);
  await assert.rejects(passportReader(config), /stale/);
  await indexStatus(client, scope, "ready", BigInt(ready.tip));
  await assert.rejects(passportReader({ ...config, reader: { ...rpc, getBlockNumber: async () => initialHead + 13n } }), /recent/);
  fixture.advance();
  const entered = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const heldPeer = fixture.reader({ beforeLogs() { entered.resolve(); return resume.promise; } });
  const advancing = syncCycle(client, { target, firstBlock, readers: [rpc, heldPeer] });
  try {
    await Promise.race([entered.promise, advancing]);
    assert.equal((await indexState(pool, scope)).tip, ready.tip);
    assert.equal((await loadPassport(lot, config)).blockNumber, BigInt(ready.tip));
  } finally { resume.resolve(); }
  assert.equal((await advancing).ready, true);
  const advanced = await indexState(pool, scope);
  assert.equal(advanced.status, "ready");
  assert.equal(advanced.tip, String(fixture.head - 1n));
  assert.equal(advanced.target, advanced.tip);
  fixture.reorg();
  await assert.rejects(passportReader(config), /checkpoint does not match/);
  const synced = await syncCycle(client, { target, firstBlock, readers }, 2_000n);
  assert.equal(synced.ready, true);
  assert.equal((await indexState(client, scope)).generation, "1");
  assert.equal((await loadProjects(config, 3n)).records.roles[0].enabled, true);
  await client.query("DELETE FROM registry_index.events WHERE scope=$1 AND name='LotAssignedToElement' AND entity_id=45", [scope]);
  await assert.rejects(loadPassport(lot, config), /total assigned quantity/);
  delete process.env.POURLEDGER_INDEX_READ_DATABASE_URL;
  await assert.rejects(loadPassport(element, config), /verified indexer/);
});
