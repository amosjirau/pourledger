import pg, { type PoolClient, type Pool } from "pg";
import type { Address, Hash } from "viem";
import type { RegistryTarget } from "../chain.ts";
import { type Counts, emptyCounts, type EventCursor, eventIdentity, type EventName, type EventPage, type EventRow, type IndexedEvent, restoreEvent } from "./events.ts";

export type Checkpoint = { end_block: string; block_hash: Hash; counts: Counts };
export type Sync = {
  first_block: string; confirmations: number; tip: string; tip_hash: Hash | null; counts: Counts;
  generation: string; target: string | null; status: "syncing" | "ready" | "error"; error: string | null; checked_at: Date;
};
export type EventFilters = { projectId?: bigint | readonly bigint[]; lotId?: bigint | readonly bigint[]; elementId?: bigint; entityId?: bigint; account?: Address; role?: number };
const columns = { projectId: "project_id", lotId: "lot_id", elementId: "element_id", entityId: "entity_id", account: "account", role: "role" } as const;
const pageSize = 16;
export const indexScope = (target: RegistryTarget) => `${target.chainId}:${target.registry.toLowerCase()}`;

export function indexPool(url: string, max = 4) {
  const pool = new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: 4_000,
    idleTimeoutMillis: 15_000, statement_timeout: 12_000, lock_timeout: 4_000, allowExitOnIdle: true });
  pool.on("error", () => { console.error("Registry index database connection failed."); });
  return pool;
}

export async function indexState(db: Pool | PoolClient, scope: string) {
  return (await db.query<Sync>("SELECT * FROM registry_index.sync WHERE scope = $1", [scope])).rows[0];
}

export async function initializeIndex(db: PoolClient, scope: string, firstBlock: bigint, confirmations: number) {
  await db.query(`INSERT INTO registry_index.sync(scope, first_block, confirmations, tip, counts, status)
    VALUES ($1,$2,$3,$4,$5,'syncing') ON CONFLICT DO NOTHING`, [scope, String(firstBlock), confirmations, String(firstBlock - 1n), emptyCounts]);
  const state = await indexState(db, scope);
  if (state.first_block !== String(firstBlock) || state.confirmations !== confirmations) throw new Error("Index deployment block or confirmation depth differs from the stored configuration.");
  return state;
}

export async function indexStatus(db: PoolClient, scope: string, status: Sync["status"], target: bigint | null, error: string | null = null) {
  await db.query("UPDATE registry_index.sync SET status=$2, target=COALESCE($3,target), error=$4, checked_at=now() WHERE scope=$1",
    [scope, status, target?.toString() ?? null, error]);
}

async function transaction(db: PoolClient, work: () => Promise<void>) {
  await db.query("BEGIN");
  try {
    await work();
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function appendIndexRange(db: PoolClient, scope: string, previous: string,
  checkpoint: Checkpoint, events: IndexedEvent[]) {
  await transaction(db, async () => {
    await db.query("INSERT INTO registry_index.checkpoints VALUES ($1,$2,$3,$4)",
      [scope, checkpoint.end_block, checkpoint.block_hash, checkpoint.counts]);
    if (events.length) {
      const rows = events.map((event) => ({
        block_no: String(event.blockNumber), log_index: event.logIndex, block_hash: event.blockHash, tx_hash: event.transactionHash,
        name: event.name, topics: event.topics, data: event.data, project_id: event.args.projectId?.toString(),
        lot_id: event.args.lotId?.toString(), element_id: event.args.elementId?.toString(), entity_id: eventIdentity(event)?.toString(),
        account: typeof event.args.account === "string" ? event.args.account.toLowerCase() : null,
        role: event.args.role, quantity: event.args.usedQuantity?.toString(),
      }));
      await db.query(`INSERT INTO registry_index.events
        SELECT $1,$2, block_no,log_index,block_hash,tx_hash,name,topics,data,project_id,lot_id,element_id,entity_id,account,role,quantity
        FROM jsonb_to_recordset($3::jsonb) AS entry(block_no bigint, log_index int, block_hash text, tx_hash text,
          name text, topics text[], data text, project_id numeric, lot_id numeric, element_id numeric, entity_id numeric,
          account text, role int, quantity numeric)`, [scope, checkpoint.end_block, JSON.stringify(rows)]);
    }
    const result = await db.query(`UPDATE registry_index.sync SET tip=$3, tip_hash=$4, counts=$5, checked_at=now()
      WHERE scope=$1 AND tip=$2`, [scope, previous, checkpoint.end_block, checkpoint.block_hash, checkpoint.counts]);
    if (result.rowCount !== 1) throw new Error("The indexing checkpoint changed during append.");
  });
}

export async function recentCheckpoints(db: PoolClient, scope: string) {
  return (await db.query<Checkpoint>("SELECT end_block, block_hash, counts FROM registry_index.checkpoints WHERE scope=$1 ORDER BY end_block DESC LIMIT 32", [scope])).rows;
}

export async function rollbackIndex(db: PoolClient, scope: string, checkpoint: Checkpoint | undefined, firstBlock: bigint) {
  const tip = checkpoint?.end_block ?? String(firstBlock - 1n);
  await transaction(db, async () => {
    await db.query("DELETE FROM registry_index.checkpoints WHERE scope=$1 AND end_block > $2", [scope, tip]);
    await db.query(`UPDATE registry_index.sync SET tip=$2, tip_hash=$3, counts=$4, generation=generation+1,
      status='syncing', checked_at=now() WHERE scope=$1`, [scope, tip, checkpoint?.block_hash ?? null, checkpoint?.counts ?? emptyCounts]);
  });
}

export async function indexEvents(db: Pool, target: RegistryTarget, snapshot: bigint, name: EventName,
  filters: EventFilters, cursor?: EventCursor, latestRoles = false): Promise<EventPage<IndexedEvent>> {
  const params: unknown[] = [indexScope(target), name, String(snapshot)];
  const rules = ["e.scope=$1", "e.name=$2", "e.block_no <= $3"];
  for (const key of Object.keys(filters) as (keyof EventFilters)[]) {
    const value = filters[key];
    if (value === undefined) continue;
    const many = Array.isArray(value);
    params.push(many ? value.map(String) : String(value).toLowerCase());
    rules.push(`e.${columns[key]} ${many ? `= ANY($${params.length}::numeric[])` : `= $${params.length}`}`);
  }
  if (cursor) {
    params.push(String(cursor.block), cursor.index);
    rules.push(`(e.block_no,e.log_index) > ($${params.length - 1},$${params.length})`);
  }
  if (latestRoles) rules.push(`NOT EXISTS (SELECT 1 FROM registry_index.events n
    WHERE n.scope=e.scope AND n.name='ProjectRoleUpdated' AND n.project_id=e.project_id AND n.account=e.account
      AND n.role=e.role AND n.block_no <= $3 AND (n.block_no,n.log_index) > (e.block_no,e.log_index))`);
  const { rows } = await db.query<EventRow>(`SELECT e.block_no,e.log_index,e.block_hash,e.tx_hash,e.name,e.topics,e.data
    FROM registry_index.events e WHERE ${rules.join(" AND ")} ORDER BY e.block_no,e.log_index LIMIT ${pageSize + 1}`, params);
  const last = rows[pageSize - 1];
  return { rows: rows.slice(0, pageSize).map((row) => restoreEvent(row, target.registry)),
    next: rows.length > pageSize ? `${last.block_no}.${last.log_index}` : undefined };
}

export async function indexedAssigned(db: Pool, target: RegistryTarget, snapshot: bigint, lot: bigint) {
  const { rows } = await db.query<{ assigned: string }>(`SELECT COALESCE(sum(quantity),0)::text AS assigned
    FROM registry_index.events WHERE scope=$1 AND name='LotAssignedToElement' AND lot_id=$2 AND block_no<=$3`,
  [indexScope(target), String(lot), String(snapshot)]);
  return BigInt(rows[0].assigned);
}
