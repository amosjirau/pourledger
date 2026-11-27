import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import jsQR from "jsqr";
import { chromium, devices } from "playwright";
import { PNG } from "pngjs";
import { passportPath } from "../lib/chain.ts";
import { demoEvidence, demoMainnetBlock, demoMainnetRegistry, demoProductionOrigin } from "../lib/demo-run.ts";
import { verifyPresentedFile } from "./demo-collect.mjs";

const url = new URL(process.env.POURLEDGER_SMOKE_ORIGIN ?? demoProductionOrigin);
assert.ok(url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "127.0.0.1"));
assert.equal(url.pathname, "/");
assert.ok(!url.username && !url.password && !url.hash && !url.search);
const runId = process.env.POURLEDGER_MAINNET_DEMO_RUN_ID;
assert.match(runId ?? "", /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
const files = demoEvidence({ runId, accounts: {} });
const firstBlockOutsideDirectWindow = demoMainnetBlock + 50_000n;
const minimumBlock = BigInt(process.env.POURLEDGER_SMOKE_MIN_BLOCK ?? firstBlockOutsideDirectWindow);
const capture = process.env.POURLEDGER_SMOKE_CAPTURE;
if (capture) await mkdir(capture, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [layout, device] of [["desktop", { viewport: { width: 1440, height: 1000 } }], ["mobile", devices["Pixel 7"]]]) {
    const context = await browser.newContext({ ...device, serviceWorkers: "block" });
    for (const kind of ["element", "lot"]) {
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const writes = [];
      await page.route("**/*", (route) => {
        const request = route.request();
        if (new URL(request.url()).origin !== url.origin) return route.abort();
        if (!["GET", "HEAD"].includes(request.method())) { writes.push(request.method()); return route.abort(); }
        const oidc = process.env.VERCEL_OIDC_TOKEN;
        return route.continue(oidc ? { headers: { ...request.headers(), "x-vercel-trusted-oidc-idp-token": oidc } } : {});
      });
      const path = passportPath({ chainId: 1990, registry: demoMainnetRegistry, kind, id: 1n });
      const response = await page.goto(new URL(path, url).href, { waitUntil: "domcontentloaded", timeout: 50_000 });
      assert.equal(response.status(), 200);
      assert.equal(page.url(), new URL(path, url).href);
      const verified = page.getByRole("heading", { name: kind === "lot" ? "Material lot 1" : "Structural element 1", exact: true });
      const unavailable = page.getByRole("heading", { name: "Passport verification unavailable", exact: true });
      await verified.or(unavailable).waitFor();
      if (await unavailable.isVisible()) throw new Error(`${kind} ${layout}: ${await page.getByRole("status").textContent()}`);
      await page.getByText("Project 3", { exact: true }).waitFor();
      const snapshot = await page.getByText(/^Receipt-validated through block /).textContent();
      const block = BigInt(snapshot?.match(/^Receipt-validated through block (\d+)/)?.[1] ?? "0");
      assert.ok(block >= minimumBlock, `Passport block ${block} is behind required block ${minimumBlock}.`);
      const assignment = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Assignment 1", exact: true }) });
      await assignment.getByText("Quantity 60 kg", { exact: true }).waitFor();
      await verifyPresentedFile(assignment, "assignment.txt", files["assignment.txt"]);
      if (kind === "lot") {
        await page.getByText("Declared 100 · Accepted 100 · Assigned 60 · Available 40 kg", { exact: true }).waitFor();
        const decision = page.locator(".live-panel").filter({ has: page.getByRole("heading", { name: "Delivery decision", exact: true }) });
        await verifyPresentedFile(decision, "inspection.txt", files["inspection.txt"]);
      }
      const bytes = PNG.sync.read(await page.locator(".live-qr svg").screenshot());
      assert.equal(jsQR(Uint8ClampedArray.from(bytes.data), bytes.width, bytes.height)?.data, demoProductionOrigin + path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      assert.deepEqual(writes, []);
      if (capture) await page.screenshot({ path: join(capture, `${kind}-${layout}.png`), fullPage: true });
      console.log(`${kind} ${layout}: block ${block}, canonical QR, exact file evidence`);
      await page.close();
    }
    await context.close();
  }
} finally { await browser.close(); }
