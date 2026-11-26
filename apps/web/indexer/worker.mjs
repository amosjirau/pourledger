import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { createPublicClient, http } from "viem";
import { qieMainnetChainId, sameHex } from "../lib/chain.ts";
import { demoMainnetBlock, demoMainnetRegistry } from "../lib/demo-run.ts";
import { deployment } from "../lib/deployment.ts";
import { indexRpcPolicy } from "../lib/indexer/rpc-policy.ts";
import { indexPool, indexScope, indexState, indexStatus, initializeIndex } from "../lib/indexer/store.ts";
import { syncCycle } from "../lib/indexer/sync.ts";

const mode = process.argv[2] ?? "worker";
const database = process.env.POURLEDGER_INDEX_DATABASE_URL;
if (!database) throw new Error("Set POURLEDGER_INDEX_DATABASE_URL for the index writer.");
const pool = indexPool(database);

async function run() {
  if (mode === "migrate") {
    await pool.query(readFileSync(new URL("./migrations/001_verified_registry.sql", import.meta.url), "utf8"));
    console.log("Verified registry index migration applied.");
    return;
  }
  if (mode !== "worker" && mode !== "backfill") throw new Error("Use migrate, backfill, or worker.");
  const { target, firstBlock } = deployment();
  if (target.chainId === qieMainnetChainId && (!sameHex(target.registry, demoMainnetRegistry) || firstBlock !== demoMainnetBlock)) {
    throw new Error("Index configuration does not match the pinned Mainnet registry and deployment block.");
  }
  const { verificationMode, endpoints } = indexRpcPolicy(target.chainId, process.env.POURLEDGER_INDEX_VERIFICATION_MODE,
    process.env.POURLEDGER_INDEX_RPC_URLS, process.env.POURLEDGER_INDEX_RPC_OPERATORS);
  const readers = endpoints.map((url) => createPublicClient({ transport: http(url.href, {
    timeout: 8_000, retryCount: 0, maxResponseBodySize: 8 * 1024 * 1024, fetchOptions: { redirect: "error" },
  }), cacheTime: 0 }));
  const scope = indexScope(target);
  const db = await pool.connect();
  let health;
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    const lock = await db.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS held", [scope]);
    if (!lock.rows[0].held) throw new Error("An index writer is already active for this registry.");
    await initializeIndex(db, scope, firstBlock, target.confirmations);
    if (mode === "worker") {
      health = createServer({ requestTimeout: 10_000, headersTimeout: 5_000 }, async (request, response) => {
        if (request.method !== "GET" || request.url !== "/healthz") { response.writeHead(404).end(); return; }
        try {
          const state = await indexState(pool, scope);
          const lag = state?.target ? String(BigInt(state.target) - BigInt(state.tip)) : null;
          const ageMs = state ? Date.now() - state.checked_at.getTime() : null;
          const ready = state?.status === "ready" && lag === "0" && ageMs !== null && ageMs >= -5_000 && ageMs < 120_000;
          response.writeHead(ready ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
          response.end(JSON.stringify({ ready, scope, verificationMode, status: state?.status, indexedThrough: state?.tip,
            confirmedTarget: state?.target, lagBlocks: lag, lastCheckAgeMs: ageMs, error: state?.error }));
        } catch {
          response.writeHead(503).end("Index database unavailable.");
        }
      });
      await new Promise((resolve, reject) => {
        health.once("error", reject);
        health.listen(Number(process.env.POURLEDGER_INDEX_HEALTH_PORT ?? 7350), process.env.POURLEDGER_INDEX_HEALTH_HOST ?? "127.0.0.1", resolve);
      });
    }
    let range = 512n;
    let failures = 0;
    while (!shutdown.signal.aborted) {
      let pause = 0;
      try {
        const result = await syncCycle(db, { target, firstBlock, readers }, range);
        range = result.range;
        failures = 0;
        if (result.ready) {
          if (mode === "backfill") { console.log("Backfill reached the verified confirmed head."); return; }
          pause = 4_000;
        }
      } catch (error) {
        const message = error instanceof Error && !("code" in error) && error.constructor === Error
          ? error.message : "Database or RPC operation failed.";
        await indexStatus(db, scope, "error", null, message.slice(0, 200));
        console.error(`Registry indexing stopped this cycle: ${message.slice(0, 200)}`);
        if (mode === "backfill") throw new Error("Backfill paused. Rerunning resumes at the committed checkpoint.");
        pause = Math.min(60_000, 2_000 * 2 ** Math.min(failures++, 5));
      }
      if (pause) await sleep(pause, undefined, { signal: shutdown.signal }).catch(() => {});
    }
  } finally {
    await new Promise((resolve) => health ? health.close(resolve) : resolve());
    // Destroying the writer session releases its advisory lock without leaking it to the pool.
    db.release(true);
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error && !preciseSecretError(error) ? error.message : "Registry indexing command failed. Check the database and RPC configuration.");
  process.exitCode = 1;
} finally {
  await pool.end();
}

function preciseSecretError(error) {
  return "code" in error || error.constructor !== Error;
}
