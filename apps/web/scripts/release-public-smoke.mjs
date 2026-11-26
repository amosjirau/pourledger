import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { demoMainnetRegistry, demoProductionOrigin } from "../lib/demo-run.ts";

const output = process.argv[2];
if (!output) throw new Error("Supply a fresh release evidence directory.");
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, headless: true });
try {
  const captures = [];
  for (const [name, width, height] of [["desktop", 1240, 880], ["mobile", 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, serviceWorkers: "block" });
    page.setDefaultTimeout(25_000);
    page.setDefaultNavigationTimeout(45_000);
    console.log(`Checking public ${name} workspace.`);
    await page.route("**/*", (route) => {
      const request = route.request();
      return new URL(request.url()).origin === demoProductionOrigin && ["GET", "HEAD"].includes(request.method()) ? route.continue() : route.abort();
    });
    const response = await page.goto(`${demoProductionOrigin}/live`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    assert.equal(page.url(), `${demoProductionOrigin}/live`);
    await page.getByRole("heading", { name: "Live registry", exact: true }).waitFor();
    await page.getByText("QIE Mainnet · chain 1990", { exact: true }).waitFor();
    await page.getByText(new RegExp(`^${demoMainnetRegistry}$`, "i")).waitFor();
    try {
      await page.getByRole("region", { name: "Verified project workspace" }).waitFor();
    } catch {
      const status = await page.locator('[role="status"]').allTextContents();
      throw new Error(`Public ${name} workspace not verified. Page status: ${status.join(" | ").slice(0, 400) || "No status provided"}. Check Vercel RPC and history capacity.`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    captures.push({ name: `public-workspace-${name}.png`, data: await page.screenshot({ fullPage: true }) });
    const home = await page.goto(demoProductionOrigin, { waitUntil: 'domcontentloaded' });
    assert.equal(home?.status(), 200);
    assert.equal(new URL(page.url()).origin, demoProductionOrigin);
    await page.getByText("Synthetic demo data", { exact: true }).waitFor();
    const operator = await page.goto(`${demoProductionOrigin}/operator/demo`, { waitUntil: 'domcontentloaded' });
    assert.equal(operator?.status(), 404);
    await page.close();
  }
  for (const capture of captures) await writeFile(join(output, capture.name), capture.data, { flag: "wx" });
  console.log(`Public desktop and mobile release checks passed for ${demoProductionOrigin}.`);
} finally {
  await browser.close();
}
