import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { keccak256, stringToHex } from "viem";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { startRecording } from "./demo-media.mjs";
import { exerciseDemoOperator } from "./demo-operator-browser.mjs";
import { verifyPresentedFile } from "./demo-collect.mjs";
import { demoConfiguration } from "../lib/demo-verify.ts";

const chainId = 31337;
const artifactUrl = new URL("../../../out/PourLedgerRegistry.sol/PourLedgerRegistry.json", import.meta.url);
const artifact = JSON.parse(await readFile(artifactUrl, "utf8"));
const anvilPath = process.env.POURLEDGER_ANVIL_BIN || "/workspace/.local/bin/anvil";
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/usr/bin/chromium";
const children = [];
let browser;
let stopRecording;
const captureDir = process.env.POURLEDGER_CAPTURE ? resolve(process.env.POURLEDGER_CAPTURE) : undefined;
const serve = process.argv.includes("--serve");
const useFixture = process.argv.includes("--fixture");
const operator = process.argv.includes("--operator");
const recordMedia = captureDir && !process.argv.includes("--screenshots-only");
const transactions = [];
const stage = async (seconds) => { if (recordMedia) await delay(seconds * 1000); };

async function port() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const selected = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return selected;
}

function start(command, args, env = process.env) {
  const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  const process = { child, output: "", error: undefined };
  children.push(process);
  child.on("error", (error) => { process.error = error; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (data) => { process.output = (process.output + data).slice(-5000); });
  }
  return process;
}

async function waitFor(check, process) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (process.error) throw process.error;
    if (process.child.exitCode !== null) throw new Error("Service exited during startup.");
    try {
      if (await check()) return;
    } catch {
      // Startup can leave a port briefly unavailable.
    }
    await delay(150);
  }
  throw new Error("Service did not become ready.");
}

async function run() {
  const anvilPort = await port();
  const webPort = await port();
  const rpc = `http://127.0.0.1:${anvilPort}/`;
  const origin = `http://127.0.0.1:${webPort}`;
  let id = 0;
  async function request(method, params = []) {
    const response = await fetch(rpc, {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(3_000),
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    return result.result;
  }

  const node = start(anvilPath, ["--silent", "--host", "127.0.0.1", "--port", String(anvilPort), "--chain-id", String(chainId)]);
  await waitFor(async () => await request("eth_chainId") === "0x7a69", node);
  const [supervisor, supplier, inspector, engineer, lab] = await request("eth_accounts");
  const preflightEnv = { ...process.env, POURLEDGER_CHAIN_ID: String(chainId), POURLEDGER_RPC_URL: rpc, POURLEDGER_DEPLOYER: supervisor };
  const preflight = JSON.parse((await promisify(execFile)(process.execPath, ["scripts/deployment-preflight.mjs"], { env: preflightEnv })).stdout);
  assert.equal(preflight.status, "UNSIGNED");
  assert.equal(preflight.chainId, chainId);
  await assert.rejects(promisify(execFile)(process.execPath, ["scripts/deployment-preflight.mjs"], {
    env: { ...preflightEnv, POURLEDGER_RPC_URL: "http://example.invalid/" },
  }), /Use a loopback Anvil RPC/);
  const registry = preflight.proposedAddress.toLowerCase();
  const creation = { from: supervisor, data: artifact.bytecode.object, gas: "0x989680" };
  let deployment = null;
  let fixtureRuntimeHash;
  if (useFixture) {
    const runtime = await request("eth_call", [creation, "latest"]);
    assert.match(runtime, /^0x[0-9a-f]{2,}$/i);
    await request("anvil_setCode", [registry, runtime]);
    assert.equal(await request("eth_getCode", [registry, "latest"]), runtime);
    assert.equal(await request("eth_blockNumber"), "0x0");
    fixtureRuntimeHash = keccak256(runtime);
  } else {
    const hash = await request("eth_sendTransaction", [creation]);
    let receipt;
    await waitFor(async () => (receipt = await request("eth_getTransactionReceipt", [hash])), node);
    assert.equal(receipt.status, "0x1");
    assert.equal(receipt.contractAddress.toLowerCase(), registry);
    assert.equal(BigInt(preflight.gasEstimate), BigInt(receipt.gasUsed));
    deployment = { hash, block: String(BigInt(receipt.blockNumber)), gas: String(BigInt(receipt.gasUsed)) };
  }

  const settings = {
    POURLEDGER_CHAIN_ID: String(chainId),
    POURLEDGER_REGISTRY: registry,
    POURLEDGER_RPC_URL: rpc,
    POURLEDGER_DEPLOYMENT_BLOCK: deployment?.block ?? "0",
    POURLEDGER_CONFIRMATIONS: "1",
    POURLEDGER_PUBLIC_ORIGIN: origin,
    POURLEDGER_DEMO_OPERATOR: operator ? "anvil" : "",
  };
  const server = start(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(webPort)], {
    ...process.env, ...settings,
  });
  await waitFor(async () => (await fetch(`${origin}/live`, { signal: AbortSignal.timeout(2_000) })).ok, server);
  browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
  if (operator) {
    Object.assign(process.env, settings);
    if (captureDir) await mkdir(captureDir, { recursive: true });
    async function prepareIndexedCapture() {
      if (!process.argv.includes("--indexed")) return demoConfiguration();
      const database = process.env.POURLEDGER_INDEX_TEST_DATABASE_URL;
      assert.ok(database && ["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname), "Use a disposable loopback index database.");
      const indexedPort = await port();
      const healthPort = await port();
      const indexedOrigin = `http://127.0.0.1:${indexedPort}`;
      const indexedSettings = { ...settings, POURLEDGER_PUBLIC_ORIGIN: indexedOrigin, POURLEDGER_INDEX_READ_DATABASE_URL: database };
      const workerEnv = { ...process.env, ...indexedSettings, POURLEDGER_INDEX_DATABASE_URL: database,
        POURLEDGER_INDEX_RPC_URLS: `${rpc},http://localhost:${anvilPort}/`, POURLEDGER_INDEX_HEALTH_PORT: String(healthPort) };
      await promisify(execFile)(process.execPath, ["indexer/worker.mjs", "migrate"], { env: workerEnv, timeout: 25_000 });
      await promisify(execFile)(process.execPath, ["indexer/worker.mjs", "backfill"], { env: workerEnv, timeout: 25_000 });
      const worker = start(process.execPath, ["indexer/worker.mjs", "worker"], workerEnv);
      await waitFor(async () => (await fetch(`http://127.0.0.1:${healthPort}/healthz`, { signal: AbortSignal.timeout(2_000) })).ok, worker);
      const indexedServer = start(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(indexedPort)], {
        ...process.env, ...indexedSettings,
      });
      await waitFor(async () => (await fetch(`${indexedOrigin}/live`, { signal: AbortSignal.timeout(2_000) })).ok, indexedServer);
      Object.assign(process.env, indexedSettings);
      console.log("The Anvil index caught up in PostgreSQL and the worker health endpoint is ready.");
      return demoConfiguration();
    }
    await exerciseDemoOperator({
      origin, browser, request, accounts: [supervisor, supplier, inspector, engineer, lab], captureDir, prepareCapture: prepareIndexedCapture, chromiumPath,
    });
    return;
  }
  assert.equal((await fetch(`${origin}/operator/demo`)).status, 404);
  const page = await browser.newPage({ viewport: captureDir ? { width: 1240, height: 880 } : { width: 390, height: 844 } });
  page.setDefaultTimeout(15_000);
  const externalRequests = [];
  const recordRequest = (outgoing) => {
    if (!outgoing.url().startsWith(origin + "/")) externalRequests.push(outgoing.url());
  };
  page.on("request", recordRequest);
  let hideReceipts = false;
  let signatureMode = "normal";
  let lowGas = false;
  await page.exposeBinding("anvilRequest", async (_source, method, params) => {
    if (method === "eth_getTransactionReceipt" && hideReceipts) return null;
    if (method === "eth_signTypedData_v4" && signatureMode === "malformed") return "0x01";
    if (method === "eth_signTypedData_v4" && signatureMode === "other") return request(method, [supplier, params[1]]);
    if (method === "eth_sendTransaction" && lowGas) return request(method, [{ ...params[0], gas: "0x6000" }]);
    return request(method, params);
  });
  await page.addInitScript(({ supervisor }) => {
    const listeners = new Map();
    const wallet = {
      account: supervisor,
      chain: sessionStorage.getItem("anvil-correct-chain") ? "0x7a69" : "0x7bf",
      async request({ method, params }) {
        if (method === "eth_chainId") return this.chain;
        if (method === "eth_accounts" || method === "eth_requestAccounts") return this.account ? [this.account] : [];
        if (this.rejectSign && method === "eth_signTypedData_v4") throw Object.assign(new Error("Wallet user rejected"), { code: 4001 });
        return window.anvilRequest(method, params);
      },
      on(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
      },
      removeListener(name, fn) { listeners.get(name)?.delete(fn); },
      emit(name, value) { for (const fn of listeners.get(name) ?? []) fn(value); },
    };
    window.workflowWallet = wallet;
    window.addEventListener("eip6963:requestProvider", () => {
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
        detail: { info: { uuid: "anvil-session-wallet", name: "Local Anvil test wallet" }, provider: wallet },
      }));
    });
  }, { supervisor });

  const hash = (text) => keccak256(stringToHex(text));
  const panel = page.getByRole("region", { name: "Wallet and registry transactions" });
  const account = async (next) => {
    await page.evaluate((value) => {
      window.workflowWallet.account = value;
      window.workflowWallet.emit("accountsChanged", value ? [value] : []);
    }, next);
    if (next) await panel.getByText(next, { exact: false }).first().waitFor();
  };
  const runAction = async (action, label, fields, outcome = "Confirmed") => {
    await panel.getByLabel("Registry action").selectOption(action);
    const form = panel.locator("form");
    for (const [field, value] of Object.entries(fields)) {
      const input = form.locator(`[name="${field}"]`);
      if (await input.evaluate((element) => element.tagName === "SELECT")) await input.selectOption(value);
      else await input.fill(value);
    }
    await form.getByRole("button", { name: label, exact: true }).click();
    await panel.getByText(outcome, { exact: true }).waitFor();
    if (outcome === "Confirmed" || outcome === "Reverted") {
      const tx = await panel.locator(".live-result code").textContent();
      const receipt = await request("eth_getTransactionReceipt", [tx]);
      assert.equal(receipt.status, outcome === "Confirmed" ? "0x1" : "0x0");
      transactions.push({ action, result: outcome, hash: tx, block: String(BigInt(receipt.blockNumber)), gas: String(BigInt(receipt.gasUsed)) });
    }
  };
  const path = (kind, id) => `/passport/${chainId}/${registry}/${kind}/${id}`;

  await page.goto(`${origin}/live`);
  if (captureDir) await mkdir(captureDir, { recursive: true });
  if (recordMedia) stopRecording = await startRecording(page, captureDir);
  const workspace = page.getByRole("region", { name: "Verified project workspace" });
  await workspace.getByText("No projects at this confirmation depth. Connect a wallet to create one.").waitFor();
  await stage(5);
  await panel.getByText("Local Anvil test wallet", { exact: true }).waitFor({ state: "attached" });
  await panel.getByRole("button", { name: "Connect wallet" }).click();
  await panel.getByRole("alert").filter({ hasText: "Network mismatch" }).waitFor();
  assert.equal(await panel.getByLabel("Registry action").count(), 0);
  await page.evaluate(() => {
    sessionStorage.setItem("anvil-correct-chain", "1");
    window.workflowWallet.chain = "0x7a69";
    window.workflowWallet.emit("chainChanged", "0x7a69");
  });
  await panel.getByText("Wallet chain 31337").waitFor();
  await panel.getByText("Hash a reference", { exact: true }).click();
  await panel.getByLabel("Project reference").fill("  local project  ");
  await panel.getByRole("button", { name: "Use reference digest" }).click();
  assert.equal(await panel.getByLabel("Project digest").inputValue(), hash("local project"));
  hideReceipts = true;
  await runAction("project", "Create project", { supervisor }, "Pending");
  hideReceipts = false;
  await panel.getByText("Confirmed", { exact: true }).waitFor();
  await panel.getByText("Record ID 1").waitFor();
  const projectHash = await panel.locator(".live-result code").textContent();
  const projectReceipt = await request("eth_getTransactionReceipt", [projectHash]);
  transactions.push({ action: "project", result: "Confirmed", hash: projectHash, block: String(BigInt(projectReceipt.blockNumber)), gas: String(BigInt(projectReceipt.gasUsed)) });
  await workspace.getByRole("heading", { name: "Project 1", exact: true }).waitFor();
  await stage(5);
  await page.reload();
  await panel.getByText("Wallet chain 31337").waitFor();
  lowGas = true;
  await runAction("project", "Create project", { projectHash: hash("local reverted project"), supervisor }, "Reverted");
  lowGas = false;
  console.log("Wallet discovery, chain mismatch, pending and reverted receipts, and project creation passed.");

  for (const [member, role] of [[inspector, "1"], [engineer, "2"], [lab, "3"]]) {
    await runAction("role", "Manage project role", { projectId: "1", member, role, enabled: "true" });
  }
  await workspace.getByText("Inspector · Granted").waitFor();
  await stage(5);
  await runAction("element", "Create structural element", { projectId: "1", elementCodeHash: hash("C3"), elementType: "2" });
  assert.equal(await panel.getByRole("link", { name: "Open public passport" }).getAttribute("href"), path("element", 1));
  await panel.getByLabel("Registry action").selectOption("register");
  const supplierField = panel.getByLabel("Supplier address");
  assert.equal((await supplierField.inputValue()).toLowerCase(), supervisor.toLowerCase());
  await account(supplier);
  assert.equal((await supplierField.inputValue()).toLowerCase(), supplier.toLowerCase());
  await panel.getByLabel("Common unit").selectOption(hash("kg"));
  assert.equal(await panel.getByLabel("Unit digest").inputValue(), hash("kg"));
  if (captureDir) await panel.screenshot({ path: join(captureDir, "lot-registration-desktop.png") });
  for (const lot of ["accepted", "rejected", "partial"]) {
    await runAction("register", "Register supplier lot", {
      projectId: "1", lotHash: hash(lot), materialType: "1", quantity: "100",
    });
  }
  await workspace.getByText("100 kg declared", { exact: true }).first().waitFor();
  await stage(5);
  const verifier = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const verifierWrites = [];
  verifier.on("request", recordRequest);
  verifier.on("request", (outgoing) => {
    if (outgoing.method() !== "GET" && outgoing.method() !== "HEAD") verifierWrites.push(outgoing.method());
  });
  await verifier.goto(origin + path("lot", 1));
  await verifier.getByText("Supplier declaration · awaiting inspector decision").waitFor();
  const acceptance = { lotId: "1", decision: "2", quantity: "100", conditionHash: hash("inspection bytes") };
  await runAction("decision", "Record inspector decision", acceptance, "Submission unverified");
  await panel.getByText("This wallet does not hold the required project role.").waitFor();

  await account(inspector);
  for (const mode of ["malformed", "other"]) {
    signatureMode = mode;
    await runAction("decision", "Record inspector decision", acceptance, "Submission unverified");
    if (mode === "other") await panel.getByText("Signature was produced by a different account.").waitFor();
  }
  signatureMode = "normal";
  await page.evaluate(() => { window.workflowWallet.rejectSign = true; });
  await runAction("decision", "Record inspector decision", acceptance, "Rejected in wallet");
  await page.evaluate(() => { window.workflowWallet.rejectSign = false; });
  await runAction("decision", "Record inspector decision", acceptance);
  await stage(8);
  await runAction("decision", "Record inspector decision", { ...acceptance, lotId: "2", decision: "4", quantity: "0" });
  await runAction("decision", "Record inspector decision", { ...acceptance, lotId: "3", decision: "3", quantity: "40" });
  await account(engineer);
  await runAction("assign", "Assign lot to element", { lotId: "1", elementId: "1", quantity: "101", evidenceHash: hash("assignment bytes") }, "Submission unverified");
  await panel.getByText(/exceeds the lot’s available quantity/).waitFor();
  await runAction("assign", "Assign lot to element", { lotId: "1", elementId: "1", quantity: "60", evidenceHash: hash("assignment bytes") });
  await workspace.getByText("40 kg available · 60 assigned").waitFor();
  await stage(8);
  await account(lab);
  const labEvidence = { lotId: "1", sampleHash: hash("sample"), resultsHash: hash("results bytes") };
  await panel.getByLabel("Registry action").selectOption("lab");
  await panel.getByText("Hash a reference", { exact: true }).click();
  await panel.getByLabel("Sample reference").fill("sample");
  await panel.getByRole("button", { name: "Use reference digest" }).click();
  await panel.locator('input[type="file"]').last().setInputFiles({
    name: "synthetic-laboratory-result.txt", mimeType: "text/plain", buffer: Buffer.from("results bytes"),
  });
  await panel.getByText("Digest calculated.", { exact: true }).waitFor();
  assert.equal(await panel.getByLabel("Sample digest").inputValue(), labEvidence.sampleHash);
  assert.equal(await panel.getByLabel("Results evidence digest").inputValue(), labEvidence.resultsHash);
  await runAction("lab", "Attach designated-lab evidence", { lotId: "1" });
  await runAction("lab", "Attach designated-lab evidence", labEvidence, "Submission unverified");
  await panel.getByText("This sample already has a designated-lab attestation.").waitFor();
  await account(supervisor);
  await runAction("role", "Manage project role", { projectId: "1", member: lab, role: "3", enabled: "false" });
  await workspace.getByText("Lab · Revoked").waitFor();
  await account(lab);
  await runAction("lab", "Attach designated-lab evidence", { ...labEvidence, sampleHash: hash("sample 2") }, "Submission unverified");
  await panel.getByText("This wallet does not hold the required project role.").waitFor();
  await page.getByRole("button", { name: "Disconnect from PourLedger" }).click();
  await panel.getByRole("button", { name: "Connect wallet" }).waitFor();
  assert.equal(await panel.getByLabel("Registry action").count(), 0);
  if (captureDir) await page.screenshot({ path: join(captureDir, "workspace-desktop.png"), fullPage: true });
  console.log("Role grants/revocation, supplier declarations, accepted/rejected deliveries, assignment, lab evidence, invalid signatures, duplicate sample, and disconnect passed.");

  await verifier.goto(origin + path("lot", 1));
  await verifier.getByText("Accepted by designated inspector", { exact: true }).waitFor();
  await verifier.getByRole("heading", { name: "Lab attestation 1" }).waitFor();
  await verifier.getByRole("heading", { name: "Assignment 1" }).waitFor();
  assert.equal(await verifier.getByRole("link", { name: "Share this passport" }).getAttribute("href"), origin + path("lot", 1));
  await verifier.locator(".live-qr svg").waitFor();
  assert.equal(await verifier.locator(".live-qr svg title").textContent(), "QR for this verified passport");
  const png = PNG.sync.read(await verifier.locator(".live-qr svg").screenshot());
  const decodedQr = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decodedQr?.data, origin + path("lot", 1));
  const labEntry = verifier.locator("article").filter({ has: verifier.getByRole("heading", { name: "Lab attestation 1" }) });
  await verifyPresentedFile(labEntry, "local.txt", "results bytes");
  await assert.rejects(verifyPresentedFile(labEntry, "local.txt", "altered bytes"), /evidence digest mismatched/);
  if (captureDir) await verifier.screenshot({ path: join(captureDir, "lot-mobile.png"), fullPage: true });
  await verifier.goto(origin + path("lot", 2));
  await verifier.getByText("Rejected by designated inspector", { exact: true }).waitFor();
  await verifier.goto(origin + path("lot", 3));
  await verifier.getByText("Partially accepted by designated inspector", { exact: true }).waitFor();
  await verifier.goto(origin + path("element", 1));
  await verifier.getByRole("heading", { name: "Structural element 1" }).waitFor();
  assert.equal(await verifier.getByRole("link", { name: "Material lot 1" }).getAttribute("href"), path("lot", 1));
  assert.equal(await verifier.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  if (captureDir) {
    await verifier.screenshot({ path: join(captureDir, "passport-mobile.png"), fullPage: true });
    await verifier.locator(".live-qr svg").screenshot({ path: join(captureDir, "local-passport-qr.png") });
    await page.goto(origin + path("element", 1));
    await page.getByRole("heading", { name: "Structural element 1" }).waitFor();
    await page.screenshot({ path: join(captureDir, "passport-desktop.png"), fullPage: true });
  }
  if (recordMedia) {
    await stage(14);
    await page.getByRole("link", { name: "Material lot 1" }).click();
    await page.getByRole("heading", { name: "Lab attestation 1" }).waitFor();
    await stage(10);
    await page.getByRole("heading", { name: "Engineer-attested assignments" }).scrollIntoViewIfNeeded();
    await stage(24);
    await stopRecording();
    stopRecording = undefined;
  }
  for (const bad of [
    path("element", "01"), path("element", 999),
    path("element", 1).replace("/31337/", "/1983/"),
    path("element", 1).replace(registry, supervisor.toLowerCase()),
  ]) {
    assert.equal((await verifier.goto(origin + bad)).status(), 404);
    await verifier.getByRole("heading", { name: "Passport not found" }).waitFor();
  }
  await verifier.goto(`${origin}/live`);
  await verifier.getByLabel("Passport type").selectOption("lot");
  await verifier.getByLabel("Record ID").fill("1");
  await verifier.getByRole("button", { name: "Find passport" }).click();
  await verifier.waitForURL(origin + path("lot", 1));
  await verifier.getByRole("heading", { name: "Material lot 1", exact: true }).waitFor();
  assert.equal((await verifier.goto(`${origin}/passport?chain=${chainId}&registry=${registry}&kind=lot&id=01`)).status(), 400);
  await verifier.goto(origin);
  await verifier.getByText("Synthetic demo data", { exact: true }).waitFor();
  if (captureDir) await verifier.screenshot({ path: join(captureDir, "synthetic-home-mobile.png"), fullPage: true });
  assert.equal(await verifier.getByText(/Receipt-validated through block/).count(), 0);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(verifierWrites, []);
  console.log("Wallet-free receipt-backed passport routes, QR coordinates, exact-byte file verification, mobile layout, and synthetic separation passed.");
  const evidence = {
    environment: "Ephemeral local Anvil, synthetic construction inputs, real local EVM receipts",
    chainId, registry, deployment, fixtureRuntimeHash,
    preflight: { creationCodeKeccak256: preflight.creationCodeKeccak256, normalizedRuntimeKeccak256: preflight.normalizedRuntimeKeccak256 },
    elementPassport: origin + path("element", 1), lotPassport: origin + path("lot", 1),
    accounts: { supervisor, supplier, inspector, engineer, lab }, transactions,
  };
  if (captureDir) await writeFile(join(captureDir, "local-receipts.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(deployment
    ? `Local registry ${registry} deployed in ${deployment.hash} (${deployment.gas} gas).`
    : `Local Anvil fixture ${registry} loaded from simulated runtime (${fixtureRuntimeHash}). No creation transaction.`);
  console.log(`Local passport verified at ${evidence.elementPassport}`);
  if (serve) {
    await browser.close();
    browser = undefined;
    console.log("Demo remains on loopback until SIGINT or SIGTERM.");
    await new Promise((done) => {
      process.once("SIGINT", done);
      process.once("SIGTERM", done);
    });
  }
}

try {
  await run();
} catch (error) {
  console.error(error);
  for (const { output } of children) if (output.trim()) console.error(output);
  process.exitCode = 1;
} finally {
  await stopRecording?.();
  await browser?.close();
  for (const { child } of children.reverse()) if (child.exitCode === null) child.kill("SIGTERM");
}
