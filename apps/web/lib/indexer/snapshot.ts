import type { Pool } from "pg";
import { sameHex, type RegistryTarget } from "../chain.ts";
import { countNames } from "./events.ts";
import { indexPool, indexScope, indexState } from "./store.ts";
import { chainCounts, type Reader } from "./sync.ts";

let pool: Pool | undefined;
export const indexMaxLag = 12n;
const maxAgeMs = 120_000;

export async function verifiedIndexSnapshot(target: RegistryTarget, firstBlock: bigint, confirmedHead: bigint, reader: Reader) {
  const url = process.env.POURLEDGER_INDEX_READ_DATABASE_URL;
  if (!url) return undefined;
  pool ??= indexPool(url);
  const db = pool;
  const scope = indexScope(target);
  const readState = () => indexState(db, scope).catch(() => { throw new Error("Registry index is unavailable."); });
  const state = await readState();
  const ageMs = state ? Date.now() - state.checked_at.getTime() : Infinity;
  if (!state || state.first_block !== String(firstBlock) || state.confirmations !== target.confirmations || state.status !== "ready" ||
      state.target !== state.tip || !state.tip_hash || ageMs < -5_000 || ageMs > maxAgeMs) {
    throw new Error("Registry index is incomplete, stale or configured for a different deployment.");
  }
  const blockNumber = BigInt(state.tip);
  if (blockNumber > confirmedHead || confirmedHead - blockNumber > indexMaxLag) {
    throw new Error("Registry index has not verified a sufficiently recent confirmed block.");
  }
  const [block, counts] = await Promise.all([reader.getBlock({ blockNumber }), chainCounts(reader, target, blockNumber)]);
  if (!block.hash || block.number !== blockNumber || !sameHex(block.hash, state.tip_hash) ||
      countNames.some((name) => counts[name] !== state.counts[name])) {
    throw new Error("Registry index checkpoint does not match canonical registry counters or block hash.");
  }
  return {
    db, blockNumber, checkedHash: block.hash, lag: confirmedHead - blockNumber,
    async verifyUnchanged() {
      const end = await readState();
      if (!end || end.generation !== state.generation || BigInt(end.tip) < blockNumber || end.status !== "ready") {
        throw new Error("Registry index changed during verification. Retry the request.");
      }
    },
  };
}
