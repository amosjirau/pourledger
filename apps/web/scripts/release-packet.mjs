import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { passportPath } from "../lib/chain.ts";
import { demoMainnetRegistry, demoProductionOrigin, stepLabels } from "../lib/demo-run.ts";

const sha = /^[0-9a-f]{40}$/;
const hash = /^0x[0-9a-f]{64}$/;
const explorer = "https://mainnet.qie.digital/tx/";

export async function buildPacket(directory) {
  const readJson = async (name) => JSON.parse(await readFile(join(directory, name), "utf8"));
  const [before, after, registry, demo] = await Promise.all([
    readJson("vercel-before.json"), readJson("vercel-after.json"), readJson("mainnet-read.json"),
    readJson("mainnet-demo/manifest.json"),
  ]);
  assert.deepEqual(after, before, "The production revision changed during the evidence run.");
  assert.equal(before.status, "verified");
  assert.ok(sha.test(before.sourceCommit));
  assert.equal(before.publicOrigin, demoProductionOrigin);
  assert.equal(registry.sourceCommit, before.sourceCommit);
  assert.equal(registry.registryCheck.status, "verified");
  assert.equal(registry.registryCheck.observedChainId, 1990);
  assert.equal(registry.ownerDeploymentRecord.registry, demoMainnetRegistry);
  assert.ok(hash.test(registry.ownerDeploymentRecord.transactionHash));
  assert.equal(demo.sourceCommit, before.sourceCommit);
  assert.equal(demo.scope, "synthetic-qie-mainnet");
  assert.equal(demo.submissionReady, true);
  assert.equal(demo.chainId, 1990);
  assert.equal(demo.registry, demoMainnetRegistry);
  assert.ok(demo.transactions.length === 7 || demo.transactions.length === 9);
  const details = (key) => demo.transactions.find((step) => step.key === key);
  const expectedSteps = ["project", "inspector", "engineer", ...(demo.transactions.length === 9 ? ["labRole"] : []),
    "element", "register", "decision", "assign", ...(demo.transactions.length === 9 ? ["lab"] : [])];
  assert.deepEqual(demo.transactions.map((step) => step.key), expectedSteps);
  assert.equal(new Set(demo.transactions.map((step) => step.hash)).size, expectedSteps.length);
  for (const step of demo.transactions) assert.ok(hash.test(step.hash) && hash.test(step.blockHash) && /^\d+$/.test(step.block));
  const passports = [];
  for (const [kind, step] of [["element", "element"], ["lot", "register"]]) {
    const id = details(step).id;
    assert.ok(/^[1-9]\d*$/.test(id));
    const url = demoProductionOrigin + passportPath({ chainId: 1990, registry: demoMainnetRegistry, kind, id: BigInt(id) });
    assert.deepEqual(demo.passports.find((item) => item.kind === kind), { kind, id, url, status: "verified" });
    passports.push({ kind, id, url });
  }
  const expectedFiles = ["synthetic-element-desktop.png", "synthetic-element-mobile.png", "synthetic-lot-desktop.png", "synthetic-lot-mobile.png", "inspection.txt", "assignment.txt", ...(demo.transactions.length === 9 ? ["lab.txt"] : [])];
  assert.deepEqual(demo.files.map((file) => file.filename).sort(), expectedFiles.sort());
  for (const { filename, sha256 } of demo.files) {
    const bytes = await readFile(join(directory, "mainnet-demo", filename));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256);
  }
  await Promise.all(["desktop", "mobile"].map((device) => readFile(join(directory, `public-workspace-${device}.png`))));
  const receipts = demo.transactions.map((step) => `| ${stepLabels[step.key]} | ${step.id ?? "—"} | ${step.block} | [Receipt](${explorer}${step.hash}) |`).join("\n");
  const copy = await readFile(new URL("../../../submission/SUBMISSION.md", import.meta.url), "utf8");
  const description = copy.split("## Ready-to-paste description\n")[1]?.split("\n## ")[0]?.trim();
  const originality = copy.split("## Original contribution\n")[1]?.split("\n## ")[0]?.trim();
  assert.ok(description && originality);
  await writeFile(join(directory, "SUBMISSION.md"), `# PourLedger · QIE Hackathon\n\nTrack **Commerce & Real World**\n\n${description}\n\n## Verified production release\n\nThe Vercel production alias served GitHub revision \`${before.sourceCommit}\` before and after public evidence capture. The existing registry on QIE Mainnet chain 1990 is \`${demoMainnetRegistry}\`. The creation receipt, canonical block, bytecode and EIP-712 domain were checked by read-only RPC. [Live workspace](${demoProductionOrigin}/live) · [Source](https://github.com/amosjirau/pourledger/commit/${before.sourceCommit}) · [Registry creation](${explorer}${registry.ownerDeploymentRecord.transactionHash})\n\n## Judge walkthrough\n\n1. Open the Column C3 passport and follow the linked engineer assignment for 60 kg. [Structural element ${passports[0].id}](${passports[0].url})\n2. Open the rebar lot passport. Compare the 100 kg declaration and acceptance, 60 kg assignment, and 40 kg remaining. [Material lot ${passports[1].id}](${passports[1].url})\n3. Scan either passport QR and follow the linked receipts. Verify the supplied synthetic file from [mainnet-demo](mainnet-demo/). The compiler-checked registry tracks the statements, role assignments, quantities and exact digests. Physical construction, civil identity and scientific validity require independent evidence.\n\nThe entire construction workflow is synthetic. Wallet addresses represent roles in a controlled demonstration. The demo establishes neither independent inspection nor adoption.\n\n| Action | Generated ID | Block | Proof |\n| --- | --- | --- | --- |\n${receipts}\n\nThe packet contains [the receipt and file manifest](mainnet-demo/manifest.json), four verified public passport screenshots, and [the read-only registry proof](mainnet-read.json).\n\n## Originality and AI assistance\n\n${originality}\n`, { flag: "wx" });
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    await buildPacket(process.argv[2]);
  } catch (error) {
    console.error(`The verified submission packet could not be generated. ${error instanceof Error ? error.message.split("\n")[0] : "Check the evidence."}`);
    process.exitCode = 1;
  }
}
