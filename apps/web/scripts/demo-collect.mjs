import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import jsQR from "jsqr";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { anvilChainId, passportPath } from "../lib/chain.ts";
import { demoEvidence, demoProductionOrigin, demoStep, parseDemoRun } from "../lib/demo-run.ts";
import { demoConfiguration, verifyDemo } from "../lib/demo-verify.ts";

const sourceCommit = () => execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: new URL("../../../", import.meta.url), encoding: "utf8",
}).trim();

export async function collectDemo(journal, config, output, chromiumPath) {
  const run = parseDemoRun(journal, config.target);
  const confirmed = await verifyDemo(run, config);
  if (confirmed.state !== "complete") throw new Error("The demonstration is incomplete. No evidence manifest was produced.");
  const local = config.target.chainId === anvilChainId;
  const origin = local ? config.origin : demoProductionOrigin;
  const proof = (key) => confirmed.verified.find((step) => step.key === key);
  const coordinates = [["element", proof("element").id], ["lot", proof("register").id]];
  const screenshots = [];
  const passports = [];
  const evidence = demoEvidence(run);
  if (!origin) throw new Error("Set a passport origin before collecting screenshots.");
  await mkdir(output, { recursive: false });
  const browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
  try {
    for (const [kind, id] of coordinates) {
      const url = origin + passportPath({ ...config.target, kind, id: BigInt(id) });
      const viewports = [["desktop", 1240, 880], ["mobile", 390, 844]];
      const captures = [];
      let reason;
      for (const [device, width, height] of viewports) {
        const page = await browser.newPage({ viewport: { width, height }, serviceWorkers: "block" });
        page.setDefaultTimeout(8_000);
        try {
          await page.route("**/*", (route) => {
            const request = route.request();
            return new URL(request.url()).origin === origin && ["GET", "HEAD"].includes(request.method()) ? route.continue() : route.abort();
          });
          const response = await page.goto(url, { timeout: 20_000 });
          assert.equal(response?.status(), 200);
          assert.equal(page.url(), url);
          await page.getByRole("heading", { name: kind === "element" ? `Structural element ${id}` : `Material lot ${id}`, exact: true }).waitFor();
          await page.getByText(`Project ${proof("project").id}`, { exact: true }).waitFor();
          await page.getByText(new RegExp(`chain ${config.target.chainId}$`)).waitFor();
          await page.getByText(new RegExp(`^${config.target.registry}$`, "i")).waitFor();
          const snapshot = await page.getByText(/^Receipt-validated through block /).textContent();
          assert.ok(BigInt(snapshot.match(/^Receipt-validated through block (\d+) /)?.[1] ?? "0") >= BigInt(proof("assign").block));
          const relevant = kind === "element" ? ["element", "assign"] : ["register", "decision", "assign", ...(run.accounts.lab ? ["lab"] : [])];
          for (const key of relevant) await page.getByText(proof(key).hash, { exact: true }).waitFor();
          if (kind === "lot") {
            await page.getByText("Declared 100 · Accepted 100 · Assigned 60 · Available 40 kg", { exact: true }).waitFor();
            const section = run.accounts.lab
              ? page.getByRole("article").filter({ has: page.getByRole("heading", { name: `Lab attestation ${proof("lab").id}`, exact: true }) })
              : page.locator(".live-panel").filter({ has: page.getByRole("heading", { name: "Delivery decision", exact: true }) });
            const file = run.accounts.lab ? "lab.txt" : "inspection.txt";
            await section.locator('input[type="file"]').setInputFiles({ name: file, mimeType: "text/plain", buffer: Buffer.from(evidence[file]) });
            await page.getByText("Digest matches the recorded bytes.").waitFor();
          }
          const qr = PNG.sync.read(await page.locator(".live-qr svg").screenshot());
          assert.equal(jsQR(new Uint8ClampedArray(qr.data), qr.width, qr.height)?.data, url);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
          captures.push({ filename: `synthetic-${kind}-${device}.png`, bytes: await page.screenshot({ fullPage: true }) });
        } catch (error) {
          reason = `${device}: ${error instanceof Error ? error.message.split("\n")[0] : "verification failed"}`;
          captures.length = 0;
          break;
        } finally {
          await page.close();
        }
      }
      screenshots.push(...captures);
      passports.push({ kind, id, url, status: captures.length === 2 ? "verified" : "unverified", reason });
    }
  } finally {
    await browser.close();
  }
  const refreshed = await verifyDemo(run, config);
  if (refreshed.state !== "complete") throw new Error("Receipt verification changed during capture.");
  assert.deepEqual(refreshed.verified, confirmed.verified, "The verified receipt set changed during capture.");

  const files = [];
  for (const { filename, bytes } of [
    ...screenshots,
    ...Object.entries(evidence).map(([filename, text]) => ({ filename, bytes: Buffer.from(text) })),
  ]) {
    await writeFile(join(output, filename), bytes, { flag: "wx" });
    files.push({ filename, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const manifest = {
    version: 1, sourceCommit: sourceCommit(), scope: local ? "synthetic-local-anvil" : "synthetic-qie-mainnet",
    runId: run.runId, chainId: run.chainId, registry: run.registry, confirmations: config.target.confirmations,
    ...(local ? {} : { explorerOrigin: config.target.explorerOrigin }),
    registryDeploymentBlock: String(config.firstBlock), snapshotBlock: refreshed.snapshotBlock, snapshotHash: refreshed.snapshotHash,
    accounts: run.accounts, quantities: { material: "rebar", unit: "kg", declared: 100, accepted: 100, assigned: 60, available: 40 },
    transactions: refreshed.verified.map((record) => ({
      ...record, ...run.attempts[record.key], event: demoStep(run, record.key, refreshed.verified).expected,
    })),
    passports, files, submissionReady: !local && passports.every((item) => item.status === "verified"),
  };
  await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, (_key, value) => typeof value === "bigint" ? String(value) : value, 2)}\n`, { flag: "wx" });
  return manifest;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const [journalPath, output] = process.argv.slice(2);
  if (!journalPath || !output) throw new Error("Usage: npm run demo:collect -- <journal.json> <new-output-directory>");
  const file = await readFile(journalPath, "utf8");
  if (file.length > 8192) throw new Error("Journal exceeds the supported size.");
  try {
    const result = await collectDemo(JSON.parse(file), demoConfiguration(), output, process.env.PLAYWRIGHT_CHROMIUM_PATH);
    console.log(`Verified ${result.transactions.length} receipts. Evidence manifest written to ${join(output, "manifest.json")}.`);
    if (result.passports.some((item) => item.status === "unverified")) {
      console.error("Public passport capture is incomplete. The manifest reports the failed checks.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error && error.constructor === Error ? error.message : "Evidence collection failed. Check read-only RPC and browser access.");
    process.exitCode = 1;
  }
}
