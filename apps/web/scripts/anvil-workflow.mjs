import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { keccak256, stringToHex } from "viem";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const chainId = 31337;
const artifactUrl = new URL("../../../out/PourLedgerRegistry.sol/PourLedgerRegistry.json", import.meta.url);
const artifact = JSON.parse(await readFile(artifactUrl, "utf8"));
const anvilPath = process.env.POURLEDGER_ANVIL_BIN || "/workspace/.local/bin/anvil";
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/usr/bin/chromium";
const children = [];
let browser;

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
  const deploymentHash = await request("eth_sendTransaction", [{ from: supervisor, data: artifact.bytecode.object, gas: "0x989680" }]);
  let deploymentReceipt;
  await waitFor(async () => (deploymentReceipt = await request("eth_getTransactionReceipt", [deploymentHash])), node);
  assert.equal(deploymentReceipt.status, "0x1");
  const registry = deploymentReceipt.contractAddress.toLowerCase();

  const server = start(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(webPort)], {
    ...process.env,
    POURLEDGER_CHAIN_ID: String(chainId),
    POURLEDGER_REGISTRY: registry,
    POURLEDGER_RPC_URL: rpc,
    POURLEDGER_DEPLOYMENT_BLOCK: String(BigInt(deploymentReceipt.blockNumber)),
    POURLEDGER_CONFIRMATIONS: "1",
    POURLEDGER_PUBLIC_ORIGIN: origin,
  });
  await waitFor(async () => (await fetch(`${origin}/live`, { signal: AbortSignal.timeout(2_000) })).ok, server);
  browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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
      chain: "0x7bf",
      async request({ method, params }) {
        if (method === "eth_chainId") return this.chain;
        if (method === "eth_accounts" || method === "eth_requestAccounts") return this.account ? [this.account] : [];
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
  };
  const path = (kind, id) => `/passport/${chainId}/${registry}/${kind}/${id}`;

  await page.goto(`${origin}/live`);
  await panel.getByText("Local Anvil test wallet", { exact: true }).waitFor({ state: "attached" });
  await panel.getByRole("button", { name: "Connect wallet" }).click();
  await panel.getByRole("alert").filter({ hasText: "Network mismatch" }).waitFor();
  assert.equal(await panel.getByLabel("Registry action").count(), 0);
  await page.evaluate(() => {
    window.workflowWallet.chain = "0x7a69";
    window.workflowWallet.emit("chainChanged", "0x7a69");
  });
  await panel.getByText("Wallet chain 31337").waitFor();
  hideReceipts = true;
  await runAction("project", "Create project", { projectHash: hash("local project"), supervisor }, "Pending");
  hideReceipts = false;
  await panel.getByText("Confirmed", { exact: true }).waitFor();
  assert.match(await panel.innerText(), /Record ID 1/);
  lowGas = true;
  await runAction("project", "Create project", { projectHash: hash("local reverted project"), supervisor }, "Reverted");
  lowGas = false;
  console.log("Wallet discovery, chain mismatch, pending and reverted receipts, and project creation passed.");

  for (const [member, role] of [[inspector, "1"], [engineer, "2"], [lab, "3"]]) {
    await runAction("role", "Manage project role", { projectId: "1", member, role, enabled: "true" });
  }
  await runAction("element", "Create structural element", { projectId: "1", elementCodeHash: hash("B1"), elementType: "3" });
  assert.equal(await panel.getByRole("link", { name: "Open public passport" }).getAttribute("href"), path("element", 1));
  await account(supplier);
  for (const lot of ["accepted", "rejected"]) {
    await runAction("register", "Register supplier lot", {
      projectId: "1", lotHash: hash(lot), supplier, materialType: "1", quantity: "100", unitCode: hash("kg"),
    });
  }
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
  await runAction("decision", "Record inspector decision", acceptance);
  await runAction("decision", "Record inspector decision", { ...acceptance, lotId: "2", decision: "4", quantity: "0" });
  await account(engineer);
  await runAction("assign", "Assign lot to element", { lotId: "1", elementId: "1", quantity: "60", evidenceHash: hash("assignment bytes") });
  await account(lab);
  const labEvidence = { lotId: "1", sampleHash: hash("sample"), resultsHash: hash("results bytes") };
  await runAction("lab", "Attach designated-lab evidence", labEvidence);
  await runAction("lab", "Attach designated-lab evidence", labEvidence, "Signed · submission unverified");
  await account(supervisor);
  await runAction("role", "Manage project role", { projectId: "1", member: lab, role: "3", enabled: "false" });
  await account(lab);
  await runAction("lab", "Attach designated-lab evidence", { ...labEvidence, sampleHash: hash("sample 2") }, "Submission unverified");
  await panel.getByText("This wallet does not hold the required project role.").waitFor();
  await page.getByRole("button", { name: "Disconnect from PourLedger" }).click();
  await panel.getByRole("button", { name: "Connect wallet" }).waitFor();
  assert.equal(await panel.getByLabel("Registry action").count(), 0);
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
  const labFile = verifier.locator("article").filter({ has: verifier.getByRole("heading", { name: "Lab attestation 1" }) }).locator('input[type="file"]');
  await labFile.setInputFiles({ name: "local.txt", mimeType: "text/plain", buffer: Buffer.from("results bytes") });
  await verifier.getByText("Digest matches the recorded bytes.").waitFor();
  await labFile.setInputFiles({ name: "local.txt", mimeType: "text/plain", buffer: Buffer.from("altered bytes") });
  await verifier.getByText("Digest mismatch. These bytes differ from the recorded evidence.").waitFor();
  await verifier.goto(origin + path("lot", 2));
  await verifier.getByText("Rejected by designated inspector", { exact: true }).waitFor();
  await verifier.goto(origin + path("element", 1));
  await verifier.getByRole("heading", { name: "Structural element 1" }).waitFor();
  assert.equal(await verifier.getByRole("link", { name: "Material lot 1" }).getAttribute("href"), path("lot", 1));
  assert.equal(await verifier.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  for (const bad of [
    path("element", "01"), path("element", 999),
    path("element", 1).replace("/31337/", "/1983/"),
    path("element", 1).replace(registry, supervisor.toLowerCase()),
  ]) {
    assert.equal((await verifier.goto(origin + bad)).status(), 404);
    await verifier.getByRole("heading", { name: "Passport not found" }).waitFor();
  }
  await verifier.goto(origin);
  await verifier.getByText("Synthetic demo data", { exact: true }).waitFor();
  assert.equal(await verifier.getByText(/Receipt-validated through block/).count(), 0);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(verifierWrites, []);
  console.log("Wallet-free receipt-backed passport routes, QR coordinates, exact-byte file verification, mobile layout, and synthetic separation passed.");
}

try {
  await run();
} catch (error) {
  console.error(error);
  for (const { output } of children) if (output.trim()) console.error(output);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const { child } of children.reverse()) if (child.exitCode === null) child.kill("SIGTERM");
}
