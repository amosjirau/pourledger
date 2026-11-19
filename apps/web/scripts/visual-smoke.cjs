const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.POURLEDGER_BASE_URL || "http://127.0.0.1:3000";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/usr/bin/chromium";
let browser;

(async () => {
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(await page.title(), "PourLedger — Structural element passport demo");
  await page.getByText("Synthetic demo data", { exact: true }).waitFor();
  await page.getByText("Not connected to a chain", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Beam B1", exact: true }).waitFor();
  await page.getByText("No test supplied", { exact: true }).first().waitFor();
  await page.getByLabel("Demo QR code for synthetic element B1").waitFor();
  await page.screenshot({ path: "/tmp/pourledger-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.content <= dimensions.viewport,
    `mobile page overflows horizontally: ${dimensions.content}px > ${dimensions.viewport}px`,
  );
  await page.screenshot({ path: "/tmp/pourledger-mobile.png", fullPage: true });

  console.log(
    `visual smoke passed: desktop and 390px mobile; screenshots in /tmp/pourledger-{desktop,mobile}.png`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
});
