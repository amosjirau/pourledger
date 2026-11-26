import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { indexPool } from "../lib/indexer/store.ts";
import { transact } from "../lib/professional/database.ts";

const url = process.env.POURLEDGER_CONSTRUCTION_ADMIN_DATABASE_URL;
if (!url) throw new Error("Set the construction schema administrator database URL.");
const db = indexPool(url, 1);
const path = new URL("./migrations/", import.meta.url);
try {
  await transact(db, async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('pourledger-construction-migrations',0))");
    await tx.query("CREATE SCHEMA IF NOT EXISTS construction");
    await tx.query("CREATE TABLE IF NOT EXISTS construction.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    const files = (await readdir(path)).filter((name) => /^\d{3}_[a-z_]+\.sql$/.test(name)).sort();
    for (const name of files) {
      const content = await readFile(new URL(name, path), "utf8");
      const checksum = createHash("sha256").update(content).digest("hex");
      const { rows: [applied] } = await tx.query("SELECT checksum FROM construction.schema_migrations WHERE name=$1", [name]);
      if (applied?.checksum === checksum) continue;
      if (applied) throw new Error(`An applied construction migration changed: ${name}`);
      await tx.query(content);
      await tx.query("INSERT INTO construction.schema_migrations(name,checksum) VALUES ($1,$2)", [name, checksum]);
      console.log(`Applied construction migration ${name}.`);
    }
  });
} finally { await db.end(); }
