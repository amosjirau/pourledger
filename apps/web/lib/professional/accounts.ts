import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Pool, PoolClient } from "pg";
import { lockOrganization, transact } from "./database.ts";
import { email, type Role, text, WorkspaceError } from "./input.ts";

const derive = promisify(scrypt);
const lifetime = 8 * 60 * 60;
const invalid = "The email address or password is incorrect.";
export const sessionCookie = "__Host-pourledger-session";
const token = () => randomBytes(32).toString("base64url");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const isToken = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
type Account = { id: string; email: string; name: string };
type Queryable = Pool | PoolClient;

function password(value: unknown) {
  if (typeof value !== "string" || value.length < 12 || Buffer.byteLength(value) > 256) {
    throw new WorkspaceError("Use a password with at least 12 characters and at most 256 UTF-8 bytes.");
  }
  return value;
}

async function hashPassword(value: string, salt = randomBytes(16).toString("hex")) {
  const result = await derive(value, salt, 64) as Buffer;
  return `${salt}:${result.toString("hex")}`;
}

async function passwordMatches(value: string, stored?: string) {
  const reference = stored ?? `${"0".repeat(32)}:${"0".repeat(128)}`;
  const actual = await hashPassword(value, reference.split(":")[0]);
  return timingSafeEqual(Buffer.from(actual), Buffer.from(reference)) && Boolean(stored);
}

async function consumeAttempt(db: Queryable, key: string) {
  const result = await db.query(`INSERT INTO construction.auth_rate AS r (key,attempts,expires_at) VALUES ($1,1,now()+interval '15 minutes')
    ON CONFLICT (key) DO UPDATE SET
      attempts=CASE WHEN r.expires_at<=now() THEN 1 ELSE r.attempts+1 END,
      expires_at=CASE WHEN r.expires_at<=now() THEN excluded.expires_at ELSE r.expires_at END
    WHERE r.expires_at<=now() OR r.attempts<10 RETURNING attempts`, [digest(key)]);
  if (result.rowCount !== 1) throw new WorkspaceError("Too many attempts. Try again in 15 minutes.");
}

async function session(db: Queryable, accountId: string) {
  const value = token();
  const expires = new Date(Date.now() + lifetime * 1000);
  await db.query("INSERT INTO construction.sessions (token_hash,account_id,expires_at) VALUES ($1,$2,$3)", [digest(value), accountId, expires]);
  return { value, expires };
}

export async function signIn(db: Pool, rawEmail: unknown, rawPassword: unknown) {
  const address = email(rawEmail);
  const value = typeof rawPassword === "string" && Buffer.byteLength(rawPassword) <= 256 ? rawPassword : "";
  await consumeAttempt(db, `login:${address}`);
  const { rows: [account] } = await db.query<Account & { password_hash: string }>(
    "SELECT id,email,name,password_hash FROM construction.accounts WHERE email=$1", [address]);
  if (!await passwordMatches(value, account?.password_hash)) throw new WorkspaceError(invalid);
  return session(db, account.id);
}

export async function currentAccount(db: Pool, value: unknown) {
  if (!isToken(value)) return undefined;
  const { rows: [account] } = await db.query<Account>(`SELECT a.id,a.email,a.name FROM construction.sessions s
    JOIN construction.accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()`, [digest(value)]);
  return account;
}

export async function signOut(db: Pool, value: unknown) {
  if (isToken(value)) await db.query("DELETE FROM construction.sessions WHERE token_hash=$1", [digest(value)]);
}

export async function mintInvite(db: Queryable, organization: string, address: string, role: Role, actor?: string) {
  const value = token();
  await db.query(`INSERT INTO construction.invites(token_hash,organization_id,email,role,created_by,expires_at)
    VALUES ($1,$2,$3,$4,$5,now()+interval '48 hours')`, [digest(value), organization, address, role, actor ?? null]);
  return value;
}

export async function acceptInvite(db: Pool, code: unknown, rawEmail: unknown, rawName: unknown, rawPassword: unknown) {
  const address = email(rawEmail);
  const name = text(rawName, "your name", 160);
  const value = password(rawPassword);
  if (!isToken(code)) throw new WorkspaceError("The invitation is invalid or expired.");
  await consumeAttempt(db, `invite:${address}`);
  return transact(db, async (tx) => {
    const { rows: [matched] } = await tx.query<{organization_id:string}>(`SELECT organization_id FROM construction.invites
      WHERE token_hash=$1 AND email=$2 AND consumed_at IS NULL AND expires_at>now()`,[digest(code),address]);
    if (!matched) throw new WorkspaceError("The invitation is invalid or expired.");
    await lockOrganization(tx,matched.organization_id);
    const { rows: [invite] } = await tx.query<{organization_id: string; role: Role}>(`SELECT organization_id,role
      FROM construction.invites WHERE token_hash=$1 AND email=$2 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`, [digest(code), address]);
    if (!invite) throw new WorkspaceError("The invitation is invalid or expired.");
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [address]);
    const { rows: [existing] } = await tx.query<{id: string; password_hash: string}>(
      "SELECT id,password_hash FROM construction.accounts WHERE email=$1", [address]);
    if (existing && !await passwordMatches(value, existing.password_hash)) throw new WorkspaceError(invalid);
    const account = existing ?? (await tx.query<{id: string}>(`INSERT INTO construction.accounts(email,name,password_hash)
      VALUES ($1,$2,$3) RETURNING id`, [address, name, await hashPassword(value)])).rows[0];
    const added = await tx.query(`INSERT INTO construction.members(organization_id,account_id,role) VALUES ($1,$2,$3)
      ON CONFLICT (organization_id,account_id) DO UPDATE SET role=excluded.role,disabled_at=NULL
      WHERE construction.members.disabled_at IS NOT NULL`, [invite.organization_id, account.id, invite.role]);
    await tx.query("UPDATE construction.invites SET consumed_at=now() WHERE token_hash=$1", [digest(code)]);
    if (added.rowCount) {
      await tx.query(`INSERT INTO construction.audit(organization_id,actor,entity_id,action,payload)
        VALUES ($1,$2,$2,'membership.joined',$3)`, [invite.organization_id, account.id, { role: invite.role }]);
    }
    return session(tx, account.id);
  });
}
