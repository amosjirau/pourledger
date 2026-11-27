import type { Pool, PoolClient } from "pg";
import { indexPool } from "../indexer/store.ts";
import { tunneledPool } from "../indexer/read-pool.ts";
import { WorkspaceError } from "./input.ts";

let connection: Promise<Pool> | undefined;
export const constructionEnabled = () => Boolean(process.env.POURLEDGER_CONSTRUCTION_DATABASE_URL);

export function constructionPool() {
  const url = process.env.POURLEDGER_CONSTRUCTION_DATABASE_URL;
  if (!url) throw new WorkspaceError("The construction workspace is unavailable.");
  connection ??= (process.env.POURLEDGER_DB_SSH_HOST ? tunneledPool(url, 4) : Promise.resolve(indexPool(url)))
    .catch(() => { connection = undefined; throw new WorkspaceError("The construction workspace is temporarily unavailable."); });
  return connection;
}

export async function transact<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function lockOrganization(client:PoolClient, organization:string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,6))",[organization]);
}
