import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { demoMainnetRegistry, demoProductionOrigin } from "../lib/demo-run.ts";
import { buildPacket } from "../scripts/release-packet.mjs";
import { verifyVercel } from "../scripts/vercel-release.mjs";

const sha = "a".repeat(40);
const previousSha = "b".repeat(40);
const projectId = "prj_fixture";
const hostname = new URL(demoProductionOrigin).hostname;

function vercelFixture({ linked = true, alreadyLive = false, queued = false } = {}) {
  let alias = alreadyLive ? "dpl_expected" : "dpl_old";
  let posts = 0;
  let checks = 0;
  const request = async (path, body) => {
    if (path === `/v4/aliases/${hostname}`) return { alias: hostname, deployment: { id: alias } };
    if (path === `/v9/projects/${projectId}`) return {
      id: projectId, name: "pourledger", rootDirectory: "apps/web",
      link: { type: "github", org: "amosjirau", repo: linked ? "pourledger" : "unrelated", productionBranch: "main", repoId: 42 },
    };
    if (path.startsWith("/v13/deployments/dpl_")) return {
      id: path.split("/").at(-1), projectId, target: "production", readyState: "READY",
      meta: { githubCommitSha: path.endsWith("dpl_expected") ? sha : previousSha },
    };
    if (path.startsWith("/v6/deployments?")) return {
      deployments: queued ? [{ target: "production", readyState: "QUEUED", meta: { githubCommitSha: sha } }] : [],
    };
    if (path === "/v13/deployments") {
      posts++;
      assert.deepEqual(body, { project: projectId, name: "pourledger", target: "production", gitSource: { type: "github", repoId: 42, ref: "main", sha } });
      return { id: "dpl_expected" };
    }
    assert.fail(`Unexpected fixture request ${path}`);
  };
  return {
    request, sourceCommit: sha,
    wait: async () => { if (posts || queued) alias = "dpl_expected"; },
    assertRemote: () => { checks++; },
    counts: () => ({ posts, checks }),
  };
}

test("Vercel release reuses the live or queued reviewed revision without requesting a second deployment", async () => {
  for (const fixture of [vercelFixture({ alreadyLive: true }), vercelFixture({ queued: true })]) {
    const proof = await verifyVercel({ ...fixture, publish: true });
    assert.equal(proof.sourceCommit, sha);
    assert.equal(proof.deploymentId, "dpl_expected");
    assert.deepEqual(fixture.counts(), { posts: 0, checks: 0 });
  }
});

test("Vercel release requires the linked project and publish flag, checks Git again and waits for the exact alias", async () => {
  const readOnly = vercelFixture();
  await assert.rejects(verifyVercel(readOnly), /has not served/);
  assert.deepEqual(readOnly.counts(), { posts: 0, checks: 0 });
  const wrongProject = vercelFixture({ linked: false });
  await assert.rejects(verifyVercel({ ...wrongProject, publish: true }), /must be linked/);
  assert.deepEqual(wrongProject.counts(), { posts: 0, checks: 0 });
  const moved = vercelFixture();
  await assert.rejects(verifyVercel({ ...moved, publish: true, assertRemote() { throw new Error("GitHub main moved"); } }), /main moved/);
  assert.deepEqual(moved.counts(), { posts: 0, checks: 0 });
  const approved = vercelFixture();
  assert.equal((await verifyVercel({ ...approved, publish: true })).status, "verified");
  assert.deepEqual(approved.counts(), { posts: 1, checks: 1 });
});

test("submission generator gates wrong scope, changed deployment and altered files", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "pourledger-packet-fixture-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  await mkdir(join(directory, "mainnet-demo"));
  const save = (name, value) => writeFile(join(directory, name), JSON.stringify(value));
  const proof = { status: "verified", method: "vercel-api", sourceCommit: sha, publicOrigin: demoProductionOrigin, deploymentId: "dpl_fixture" };
  await save("vercel-before.json", proof);
  await save("vercel-after.json", { ...proof, deploymentId: "dpl_different" });
  await save("mainnet-read.json", { sourceCommit: sha, registryCheck: { status: "verified", observedChainId: 1990 }, ownerDeploymentRecord: {
    registry: demoMainnetRegistry, transactionHash: `0x${"f".repeat(64)}`,
  } });
  const evidence = "Synthetic test fixture bytes";
  const signature = createHash("sha256").update(evidence).digest("hex");
  const names = ["synthetic-element-desktop.png", "synthetic-element-mobile.png", "synthetic-lot-desktop.png", "synthetic-lot-mobile.png", "inspection.txt", "assignment.txt"];
  for (const name of names) await writeFile(join(directory, "mainnet-demo", name), evidence);
  for (const device of ["desktop", "mobile"]) await writeFile(join(directory, `public-workspace-${device}.png`), evidence);
  const demo = {
    sourceCommit: sha, chainId: 1990, registry: demoMainnetRegistry, scope: "synthetic-local-anvil", submissionReady: true,
    transactions: ["project", "inspector", "engineer", "element", "register", "decision", "assign"].map((key, index) => ({
      key, id: "1", hash: `0x${String(index + 1).repeat(64)}`, blockHash: `0x${"a".repeat(64)}`, block: "12148099",
    })),
    passports: ["element", "lot"].map((kind) => ({ kind, id: "1", status: "verified", url: `${demoProductionOrigin}/passport/1990/${demoMainnetRegistry.toLowerCase()}/${kind}/1` })),
    files: names.map((filename) => ({ filename, sha256: signature })),
  };
  await save("mainnet-demo/manifest.json", demo);
  await assert.rejects(buildPacket(directory), /production revision changed/);
  await save("vercel-after.json", proof);
  await assert.rejects(buildPacket(directory), /synthetic-local-anvil/);
  await save("mainnet-demo/manifest.json", { ...demo, scope: "synthetic-qie-mainnet" });
  await writeFile(join(directory, "mainnet-demo", "inspection.txt"), "Modified fixture bytes");
  await assert.rejects(buildPacket(directory), { code: "ERR_ASSERTION" });
  await writeFile(join(directory, "mainnet-demo", "inspection.txt"), evidence);
  await buildPacket(directory);
  assert.match(await readFile(join(directory, "SUBMISSION.md"), "utf8"), /The entire construction workflow is synthetic/);
});
