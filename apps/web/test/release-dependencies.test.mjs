import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const check = fileURLToPath(new URL("../scripts/check-release-dependencies.mjs", import.meta.url));

test("the WSL release reuses a complete legacy npm ci install and rejects lock or disk drift", async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), "pourledger-deps-"));
  context.after(() => rm(cwd, { recursive: true, force: true }));
  const save = (name, value) => writeFile(join(cwd, name), JSON.stringify(value));
  const next = { version: "1.0.0", integrity: "fixture", resolved: "https://example.invalid/next.tgz" };
  const root = { dependencies: { next: next.version } };
  const foreign = { version: "1.0.0", optional: true, os: ["unavailable-os"] };
  await mkdir(join(cwd, "node_modules/.bin"), { recursive: true });
  await mkdir(join(cwd, "node_modules/next"));
  await writeFile(join(cwd, "node_modules/.bin/next"), "", { mode: 0o700 });
  await save("package.json", root);
  await save("package-lock.json", { packages: { "": root, "node_modules/next": next, "node_modules/foreign": foreign } });
  const status = () => spawnSync(process.execPath, [check], { cwd }).status;
  assert.equal(status(), 1);
  await save("node_modules/.package-lock.json", { packages: { "node_modules/next": next } });
  await save("node_modules/next/package.json", { version: next.version });
  assert.equal(status(), 0);
  await save("node_modules/next/package.json", { version: "2.0.0" });
  assert.equal(status(), 1);
  await save("node_modules/next/package.json", { version: next.version });
  await save("node_modules/.package-lock.json", { packages: { "node_modules/next": { ...next, integrity: "different" } } });
  assert.equal(status(), 1);
});
