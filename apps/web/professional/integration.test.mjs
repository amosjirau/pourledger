import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { indexPool } from "../lib/indexer/store.ts";
import { acceptInvite, currentAccount, mintInvite, signIn, signOut } from "../lib/professional/accounts.ts";
import { downloadDocument, listDocumentRevisions, saveDocument } from "../lib/professional/documents.ts";
import { designRegister, reviewSpecification, saveElement, saveSpecification } from "../lib/professional/design.ts";
import { csvField, deliveryCsv } from "../lib/professional/export.ts";
import { addProjectMember, inviteMember, projectsFor, requireProject, saveProject } from "../lib/professional/projects.ts";
import { quantity, registryQuantity } from "../lib/professional/quantities.ts";
import { addDelivery, deliveriesFor, deliveryInspection, saveInspection } from "../lib/professional/receiving.ts";

const url = new URL(process.env.POURLEDGER_CONSTRUCTION_TEST_DATABASE_URL ?? "postgres://invalid.invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /_test$/.test(url.pathname), "Use an isolated construction test database.");
const form = (fields) => {
  const values = new FormData();
  for (const [key,value] of Object.entries(fields)) values.append(key, value);
  return values;
};

test("synthetic onboarding, tenant isolation, document integrity and reviewed material inspection", async (context) => {
  const db = indexPool(url.href);
  context.after(() => db.end());
  const tag = randomUUID().slice(0, 10);
  const password = "Unique test password for synthetic workspace only!";
  const invite = async (organization, role, name, by) => {
    const address = `${tag}-${name}@example.invalid`;
    const token = by ? await inviteMember(db, by, organization, address, role) : await mintInvite(db, organization, address, role);
    const grant = await acceptInvite(db, token, address, `Synthetic ${name}`, password);
    await assert.rejects(acceptInvite(db, token, address, `Synthetic ${name}`, password), /invalid or expired/);
    return { ...(await currentAccount(db, grant.value)), grant };
  };
  const org = (await db.query("INSERT INTO construction.organizations(name) VALUES ($1) RETURNING id", [`Synthetic ${tag}`])).rows[0].id;
  const other = (await db.query("INSERT INTO construction.organizations(name) VALUES ($1) RETURNING id", [`Synthetic other ${tag}`])).rows[0].id;
  const owner = await invite(org, "administrator", "owner");
  const outsider = await invite(other, "administrator", "other");
  const inspector = await invite(org, "inspector", "inspector", owner.id);
  const auditor = await invite(org, "auditor", "auditor", owner.id);
  const consultant = await invite(org, "consultant", "consultant", owner.id);
  await assert.rejects(signIn(db, owner.email, "incorrect password"), /incorrect/);
  const login = await signIn(db, owner.email, password);
  assert.equal((await currentAccount(db, login.value)).id, owner.id);
  await signOut(db, login.value);
  assert.equal(await currentAccount(db, login.value), undefined);
  await assert.rejects(inviteMember(db, auditor.id, org, `${tag}-bad@example.invalid`, "administrator"), /access/);

  const project = { code: "SYN-01", name: "Synthetic foundation works", status: "active", start: "2026-11-01", completion: "2026-12-01", chain_project_id: "3" };
  const created = await saveProject(db, owner.id, org, form(project));
  assert.equal((await projectsFor(db, inspector.id, org)).entries.length, 0);
  await assert.rejects(requireProject(db, outsider.id, org, created.id), /access/);
  await assert.rejects(requireProject(db, outsider.id, other, created.id), /access/);
  await addProjectMember(db, owner.id, org, created.id, inspector.id);
  await addProjectMember(db, owner.id, org, created.id, auditor.id);
  await addProjectMember(db, owner.id, org, created.id, consultant.id);
  assert.equal((await projectsFor(db, inspector.id, org)).entries.length, 1);
  const updated = await saveProject(db, owner.id, org, form({ ...project, project: created.id, revision: "1", description: "Synthetic data only" }));
  assert.equal(updated.revision, 2);
  await assert.rejects(saveProject(db, owner.id, org, form({ ...project, project: created.id, revision: "1" })), /changed/);

  const specification = { reference:"SYN-SPEC", edition:"Test edition", project_revision:"R1", title:"Synthetic reinforcement specification",
    classification:"contract specification", publisher:"https://example.invalid/synthetic-document", criteria:"Synthetic test criteria",
    authority:"Project consultant", applicability:"Only the synthetic test project" };
  const spec = await saveSpecification(db, owner.id, org, created.id, form(specification));
  await assert.rejects(saveSpecification(db, owner.id, org, created.id, form({ ...specification, publisher:"file:///etc/passwd" })), /HTTPS/);
  const review = form({ decision:"approved", basis:"Confirmed the synthetic test scope." });
  await assert.rejects(reviewSpecification(db, inspector.id, org, created.id, spec.id, review), /access/);
  await reviewSpecification(db, consultant.id, org, created.id, spec.id, review);
  assert.equal((await designRegister(db, auditor.id, org, created.id, "specifications")).entries[0].state, "approved");
  const element = await saveElement(db, owner.id, org, created.id, form({ reference:"C3", kind:"Column", status:"planned", drawing:"S-01", revision:"P1" }));
  assert.equal((await designRegister(db, auditor.id, org, created.id, "elements")).entries[0].id, element.id);
  await assert.rejects(designRegister(db, outsider.id, org, created.id, "elements"), /access/);

  const docForm = { reference: "CERT-001", kind: "mill-certificate", title: "Synthetic mill certificate" };
  const doc = await saveDocument(db, owner.id, org, created.id,
    form({ ...docForm, file: new File(["%PDF-1.4\nSynthetic test certificate\n%%EOF\n"], "certificate.pdf", { type:"application/pdf" }) }));
  const proof = await downloadDocument(db, inspector.id, org, created.id, doc.id, 1);
  assert.match(proof.bytes.toString(), /Synthetic test certificate/);
  await assert.rejects(downloadDocument(db, outsider.id, other, created.id, doc.id, 1), /access/);
  await assert.rejects(saveDocument(db, auditor.id, org, created.id, form(docForm)), /access/);
  await assert.rejects(saveDocument(db, owner.id, org, created.id,
    form({ ...docForm, file: new File(["invalid contents"], "certificate.pdf", { type:"application/pdf" }) })), /contents/);
  assert.equal((await listDocumentRevisions(db, owner.id, org, created.id, doc.id)).entries.length, 1);

  const received = { reference:"DEL-001", material:"Reinforcing steel", supplier:"Synthetic supplier", note:"DN-100", line:"1",
    date:"2026-11-20", quantity:"100.125", unit:"kg", description:"Synthetic reinforcement only", condition:"Packaging intact" };
  const delivery = await addDelivery(db, owner.id, org, created.id, form(received));
  await assert.rejects(addDelivery(db, owner.id, org, created.id, form({ ...received, reference:"DEL-002" })), { code:"23505" });
  await assert.rejects(addDelivery(db, auditor.id, org, created.id, form({ ...received, reference:"DEL-003", line:"2" })), /access/);
  await assert.rejects(addDelivery(db, owner.id, org, created.id, form({ ...received, quantity:"1.0000001" })), /decimal/);
  assert.throws(() => registryQuantity(quantity("100.125")), /whole-unit/);
  assert.equal(registryQuantity(quantity("100.000")), 100n);
  assert.equal((await deliveriesFor(db, auditor.id, org, created.id, "reinforcing")).entries[0].id, delivery.id);

  const inspection = { delivery:delivery.id, reference:"MIR-001", date:"2026-11-20", specification:"Synthetic project criterion",
    criteria:"Synthetic test only", checklist:"Certificate received", observations:"Declared grades recorded",
    document:doc.id, evidence_revision:"1" };
  assert.equal(await saveInspection(db, owner.id, org, created.id, form({ ...inspection, operation:"submit" })), "submitted");
  let state = (await deliveryInspection(db, owner.id, org, created.id, delivery.id)).inspection;
  const transition = () => ({ delivery:delivery.id, inspection:state.id, revision:String(state.revision) });
  await assert.rejects(saveInspection(db, auditor.id, org, created.id, form({ ...transition(), operation:"review" })), /access/);
  assert.equal(await saveInspection(db, inspector.id, org, created.id, form({ ...transition(), operation:"review" })), "under_review");
  state = (await deliveryInspection(db, owner.id, org, created.id, delivery.id)).inspection;
  const decision = { ...transition(), operation:"decide", accepted:"80", rejected:"10", quarantined:"10.125", reason:"Synthetic discrepancy resolved in this exercise only" };
  await assert.rejects(saveInspection(db, inspector.id, org, created.id, form({ ...decision, quarantined:"1" })), /add up/);
  const concurrent = await Promise.allSettled([1,2].map(() => saveInspection(db, inspector.id, org, created.id, form(decision))));
  assert.equal(concurrent.filter((result) => result.status === "fulfilled" && result.value === "partially_accepted").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
  state = (await deliveryInspection(db, auditor.id, org, created.id, delivery.id)).inspection;
  assert.equal(state.evidence_digest, proof.keccak);
  assert.equal(state.accepted, "80.000000");
  assert.equal(state.quarantined, "10.125000");
  const csv = await deliveryCsv(db, auditor.id, org, created.id, "reinforcing");
  assert.match(csv, /"100\.125","kg","MIR-001","partially_accepted","80","10","10\.125"/);
  assert.equal(csvField("  =UNSAFE"), "\"'  =UNSAFE\"");
  await assert.rejects(deliveryCsv(db, outsider.id, other, created.id, ""), /access/);
  const audit = await db.query("SELECT count(*)::int AS total FROM construction.audit WHERE project_id=$1", [created.id]);
  assert.ok(audit.rows[0].total >= 9);
});
