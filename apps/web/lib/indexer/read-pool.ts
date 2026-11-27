import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:net";
import type { Pool } from "pg";
import { Client } from "ssh2";
import { indexPool } from "./store.ts";

let reader: Promise<Pool> | undefined;

export function indexReadConfigured() {
  return Boolean(process.env.POURLEDGER_INDEX_READ_DATABASE_URL || process.env.POURLEDGER_DB_SSH_HOST);
}

export function indexReadPool() {
  reader ??= openReader().catch(() => {
    reader = undefined;
    throw new Error("Registry index connection configuration is unavailable.");
  });
  return reader;
}

async function openReader() {
  const url = process.env.POURLEDGER_INDEX_READ_DATABASE_URL;
  if (!url) throw new Error("Set the index reader database URL.");
  if (!process.env.POURLEDGER_DB_SSH_HOST) return indexPool(url);
  return tunneledPool(url);
}

let tunnel: Promise<{ port: number; ca: Buffer; servername: string }> | undefined;

export async function tunneledPool(url: string, max = 3) {
  const remote = new URL(url);
  if (!["postgres:", "postgresql:"].includes(remote.protocol) || remote.hostname !== "127.0.0.1" ||
    remote.port !== "5432" || !remote.username || !remote.password || remote.search || remote.hash) {
    throw new Error("Use a loopback PostgreSQL URL without connection options for the SSH transport.");
  }
  tunnel ??= startTunnel().catch((error) => { tunnel = undefined; throw error; });
  const { port, ca, servername } = await tunnel;
  remote.port = String(port);
  return indexPool(remote.toString(), max, { ca, servername, rejectUnauthorized: true });
}

async function startTunnel() {
  const { POURLEDGER_DB_SSH_HOST: host, POURLEDGER_DB_SSH_PORT: portSetting, POURLEDGER_DB_SSH_USER: username,
    POURLEDGER_DB_SSH_KEY: key, POURLEDGER_DB_SSH_HOST_KEY: hostKey, POURLEDGER_DB_TLS_CA: caSetting,
    POURLEDGER_DB_TLS_NAME: servername } = process.env;
  const port = Number(portSetting ?? "22");
  if (!host || !/^[a-z0-9][a-z0-9.-]{0,252}$/i.test(host) ||
    !Number.isInteger(port) || port < 1 || port > 65_535 ||
    !username || !/^[a-z][a-z0-9_-]{0,31}$/.test(username) || !key ||
    !hostKey || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(hostKey) || !caSetting || !servername) {
    throw new Error("The database tunnel requires a pinned SSH host and PostgreSQL certificate.");
  }
  const privateKey = Buffer.from(key, "base64");
  const ca = Buffer.from(caSetting, "base64");
  const expected = Buffer.from(hostKey.slice(7), "base64");
  let session: Promise<Client> | undefined;
  let active = 0;
  let idleTimer: NodeJS.Timeout | undefined;

  function connect() {
    if (session) return session;
    const client = new Client();
    const pending = new Promise<Client>((resolve, reject) => {
      client.once("ready", () => resolve(client));
      client.on("error", reject);
      client.once("close", () => {
        reject(new Error("Database tunnel closed."));
        if (session === pending) session = undefined;
      });
      client.connect({ host, port, username, privateKey, readyTimeout: 5_500,
        keepaliveInterval: 10_000, keepaliveCountMax: 2, algorithms: { serverHostKey: ["ssh-ed25519"] },
        hostVerifier: (offered: Buffer) => timingSafeEqual(createHash("sha256").update(offered).digest(), expected) });
    });
    session = pending;
    void pending.catch(() => { if (session === pending) session = undefined; client.destroy(); });
    return pending;
  }

  const server = createServer({ pauseOnConnect: true }, (socket) => {
    if (idleTimer) clearTimeout(idleTimer);
    active++;
    socket.on("error", () => socket.destroy());
    socket.once("close", () => {
      active--;
      if (active === 0) {
        idleTimer = setTimeout(() => {
          const unused = session;
          session = undefined;
          void unused?.then((client) => client.end(), () => {});
        }, 5_000).unref();
      }
    });
    socket.setTimeout(25_000, () => socket.destroy());
    const forward = async () => {
      const current = connect();
      const client = await current;
      if (socket.destroyed) return;
      const stream = await new Promise<import("ssh2").ClientChannel>((resolve, reject) => {
        client.forwardOut("127.0.0.1", socket.remotePort ?? 0, "127.0.0.1", 5432,
          (error, forwarded) => error ? reject(error) : resolve(forwarded));
      }).catch((error) => {
        if (session === current) session = undefined;
        client.destroy();
        throw error;
      });
      if (socket.destroyed) { stream.destroy(); return; }
      stream.on("error", () => socket.destroy());
      stream.once("close", () => socket.destroy());
      socket.once("close", () => stream.destroy());
      socket.pipe(stream).pipe(socket);
      socket.resume();
    };
    void forward().catch(() => socket.destroy());
  });
  server.maxConnections = 8;
  server.unref();
  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Database tunnel could not bind.");
  return { port: address.port, ca, servername };
}
