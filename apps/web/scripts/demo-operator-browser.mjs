import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectDemo } from "./demo-collect.mjs";

export async function exerciseDemoOperator({ origin, browser, request, accounts, captureDir, config, chromiumPath }) {
  const [supervisor, supplier, inspector, engineer, lab] = accounts;
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1240, height: 880 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const includeLab = !process.argv.includes("--skip-lab");
  const counts = { sign: 0, send: 0 };
  let mode = "deny";
  let lostHash;
  await page.exposeBinding("demoRpc", async (_source, method, params) => {
    if (method === "eth_signTypedData_v4") counts.sign++;
    if (method === "eth_sendTransaction") {
      counts.send++;
      if (mode === "deny") return { denied: true };
      const hash = await request(method, mode === "revert" ? [{ ...params[0], gas: "0x6000" }] : params);
      if (mode === "lost") {
        lostHash = hash;
        return { lost: true };
      }
      return hash;
    }
    return request(method, params);
  });
  await page.addInitScript((supervisor) => {
    const listeners = new Map();
    const wallet = {
      account: sessionStorage.getItem("demo-test-account") || supervisor,
      network: sessionStorage.getItem("demo-test-chain") || "0x7bf",
      async request({ method, params }) {
        if (method === "eth_chainId") return this.network;
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [this.account];
        const result = await window.demoRpc(method, params);
        if (result?.denied) throw Object.assign(new Error("User rejected"), { code: 4001 });
        if (result?.lost) throw new Error("Injected provider lost the response");
        return result;
      },
      on(name, listener) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(listener);
      },
      removeListener(name, listener) { listeners.get(name)?.delete(listener); },
      use(account, chain) {
        this.account = account;
        this.network = chain;
        sessionStorage.setItem("demo-test-account", account);
        sessionStorage.setItem("demo-test-chain", chain);
        for (const listener of listeners.get("accountsChanged") ?? []) listener([account]);
        for (const listener of listeners.get("chainChanged") ?? []) listener(chain);
      },
    };
    window.demoWallet = wallet;
    window.addEventListener("eip6963:requestProvider", () => {
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { rdns: "io.rabby" }, provider: wallet } }));
    });
  }, supervisor);
  const account = (value, chain = "0x7a69") => page.evaluate(([value, chain]) => window.demoWallet.use(value, chain), [value, chain]);
  const next = page.locator("section").filter({ has: page.getByRole("heading", { name: "Next action", exact: true }) }).first();
  const prepare = next.getByRole("button", { name: "Prepare transaction", exact: true });
  const send = next.getByRole("button", { name: "Open transaction approval in Rabby", exact: true });
  const verify = next.getByRole("button", { name: "Refresh verification" });
  const approved = next.getByRole("checkbox", { name: /I reviewed the sender/ });
  await page.goto(`${origin}/operator/demo`);
  await page.getByRole("heading", { name: "Synthetic demonstration operator" }).waitFor();
  for (const [label, value] of [["Supervisor address", supervisor], ["Supplier address", supervisor], ["Inspector address", inspector], ["Engineer address", engineer]]) {
    await page.getByLabel(label).fill(value);
  }
  await page.getByRole("button", { name: "Save synthetic journal" }).click();
  await page.getByText("Assign a different wallet to each role.").waitFor();
  await page.getByLabel("Supplier address").fill(supplier);
  if (includeLab) await page.getByLabel("Lab address (optional)").fill(lab);
  await page.getByRole("button", { name: "Save synthetic journal" }).click();
  await page.getByText("Network mismatch. Switch Rabby to chain 31337.").waitFor();
  assert.equal(await prepare.isDisabled(), true);
  assert.equal(counts.send, 0);
  assert.equal(counts.sign, 0);
  await account(supervisor);
  await prepare.click();
  await send.waitFor();
  assert.equal(await send.isDisabled(), true);
  assert.equal(counts.send, 0);
  if (captureDir) await page.screenshot({ path: join(captureDir, "synthetic-local-review.png"), fullPage: true });
  await approved.check();
  await send.click();
  await page.getByText(/Rabby declined the transaction/).waitFor();

  await prepare.click();
  await approved.check();
  const otherTab = await context.newPage();
  await otherTab.goto(`${origin}/operator/demo`);
  await otherTab.evaluate(async () => {
    const key = Object.keys(localStorage).find((value) => value.startsWith("pourledger:operator:"));
    await new Promise((ready) => {
      void navigator.locks.request(key, async () => {
        await new Promise((done) => { window.unlockDemo = done; ready(); });
      });
    });
  });
  await send.click();
  await page.getByText("This journal is busy in another tab.").waitFor();
  assert.equal(counts.send, 1);
  await otherTab.evaluate(() => window.unlockDemo());
  await otherTab.close();

  mode = "revert";
  await send.click();
  await page.getByText(/Transaction hash saved/).waitFor();
  await verify.click();
  await next.getByRole("button", { name: "Clear confirmed revert for a manual retry" }).click();
  await prepare.click();
  await approved.check();
  mode = "lost";
  await send.click();
  await page.getByText(/The transaction outcome is unknown/).waitFor();
  assert.ok(lostHash);
  await page.reload();
  await page.getByText(/Submission reserved/).waitFor();
  assert.equal(await send.count(), 0);
  const unrelated = await request("eth_sendTransaction", [{ from: supplier, to: supplier, value: "0x0" }]);
  await next.getByLabel("Recovery transaction hash").fill(unrelated);
  await next.getByRole("button", { name: "Verify recovery hash" }).click();
  await page.getByText(/canonical receipt does not match/).waitFor();
  await next.getByLabel("Recovery transaction hash").fill(lostHash);
  await next.getByRole("button", { name: "Verify recovery hash" }).click();
  await next.getByRole("heading", { name: "Grant inspector role" }).waitFor();

  mode = "normal";
  await request("evm_setAutomine", [false]);
  await prepare.click();
  await approved.check();
  await send.click();
  await page.getByText(/Waiting for a canonical receipt/).waitFor();
  await page.reload();
  await page.getByText(/Waiting for a canonical receipt/).waitFor();
  assert.equal(await prepare.count(), 0);
  await request("evm_mine");
  await request("evm_setAutomine", [true]);
  await verify.click();
  await next.getByRole("heading", { name: "Grant engineer role" }).waitFor();

  const submit = async (label, sender, signed = false) => {
    await next.getByRole("heading", { name: label }).waitFor();
    await account(sender);
    if (signed) {
      const before = counts.send;
      await next.getByRole("button", { name: "Review and sign typed data in Rabby" }).click();
      await page.getByText(/Typed data signed/).waitFor();
      assert.equal(counts.send, before);
    } else await prepare.click();
    await approved.check();
    await send.click();
    await page.getByText(/Transaction hash saved/).waitFor();
    await verify.click();
  };
  await submit("Grant engineer role", supervisor);
  if (includeLab) await submit("Grant optional lab role", supervisor);
  await submit("Create Column C3", supervisor);
  await submit("Register 100 kg of rebar", supplier);
  await next.getByRole("heading", { name: "Accept 100 kg of rebar" }).waitFor();
  assert.equal(await next.getByRole("button", { name: "Review and sign typed data in Rabby" }).isDisabled(), true);
  await submit("Accept 100 kg of rebar", inspector, true);
  await submit("Assign 60 kg to Column C3", engineer, true);
  if (includeLab) await submit("Attach synthetic lab evidence", lab, true);
  await page.getByText(/Verified synthetic workflow complete/).waitFor();
  assert.equal(counts.sign, includeLab ? 3 : 2);
  assert.equal(counts.send, includeLab ? 11 : 9);
  assert.equal(await request("eth_chainId"), "0x7a69");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download journal" }).click()]);
  const exported = await readFile(await download.path(), "utf8");
  const run = JSON.parse(exported);
  assert.equal(run.attempts.project.hash, lostHash);
  const post = (body) => page.request.post(`${origin}/operator/demo/check`, { headers: { origin }, data: body });
  assert.equal((await post({ ...run, chainId: 1990 })).status(), 422);
  const assignment = run.attempts.assign;
  assert.equal((await post({ ...run, attempts: { ...run.attempts, assign: { ...assignment, nonce: assignment.nonce + 1 } } })).status(), 422);
  assert.equal((await page.request.post(`${origin}/operator/demo/check`, { headers: { origin: "https://pourledger-one.vercel.app" }, data: run })).status(), 404);

  const parent = captureDir ?? await mkdtemp(join(tmpdir(), "pourledger-operator-"));
  const output = join(parent, "synthetic-local-evidence");
  const manifest = await collectDemo(run, config, output, chromiumPath);
  assert.equal(manifest.scope, "synthetic-local-anvil");
  assert.equal(manifest.submissionReady, false);
  assert.equal(manifest.transactions.length, includeLab ? 9 : 7);
  assert.deepEqual(manifest.passports.map((passport) => passport.status), ["verified", "verified"], JSON.stringify(manifest.passports));
  assert.equal(manifest.files.filter((file) => file.filename.endsWith(".png")).length, 4);
  if (captureDir) {
    await download.saveAs(join(parent, "synthetic-local-journal.json"));
    await page.screenshot({ path: join(parent, "synthetic-local-operator.png"), fullPage: true });
  }
  await context.close();
  console.log(`Guided operator verified ${manifest.transactions.length} local receipts, reload/resume, duplicate guards, and four passport captures in ${output}.`);
}
