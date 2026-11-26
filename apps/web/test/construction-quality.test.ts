import test from "node:test";
import assert from "node:assert/strict";
import { inspectionItems, materialInspection, nominalRebarMass, recordBytes } from "../lib/construction-quality.ts";
const scope = { chainId: 1990, registry: "0xABC", project: "3", lot: "1", declared: "100", unit: "kg" };
function form() {
  const data = new FormData();
  for (const key of ["inspection reference", "revision", "delivery reference", "material description", "standard and edition", "clause or ITP reference", "project acceptance criteria", "disposition"]) data.set(key, "Fixture");
  for (const [key] of inspectionItems) { data.set(key, "satisfactory"); data.set(key + "-note", "Reviewed"); }
  data.set("accepted", "100");
  return data;
}
test("inspection evidence is scoped, deterministic and explicitly unapproved", () => {
  const a = materialInspection(form(), scope);
  assert.equal(a.proposedDecision, "accepted");
  assert.equal(a.status, "prepared-for-review");
  assert.equal(a.scope.lotId, "1");
  assert.equal(recordBytes(a), recordBytes(materialInspection(form(), scope)));
});
test("partial and rejected decisions derive from exact quantities", () => {
  const f = form(); f.set("accepted", "60");
  assert.equal(materialInspection(f, scope).proposedDecision, "partially-accepted");
  f.set("accepted", "0");
  assert.equal(materialInspection(f, scope).proposedDecision, "rejected");
});
test("invalid or conflicting inspection inputs fail closed", () => {
  const f = form(); f.set("accepted", "101");
  assert.throws(() => materialInspection(f, scope), /exceeds/);
  f.set("accepted", "100"); f.set("condition", "nonconforming");
  assert.throws(() => materialInspection(f, scope), /conflicts/);
  f.set("condition", "satisfactory"); f.delete("condition-note");
  assert.throws(() => materialInspection(f, scope), /Complete/);
});
test("nominal steel mass and invalid dimensions", () => {
  const result = nominalRebarMass(16, 12, 20);
  assert.ok(Math.abs(result.totalKg - 378.805) < 0.01);
  assert.throws(() => nominalRebarMass(16, 12, 1.5));
  assert.throws(() => nominalRebarMass(0, 12, 1));
});
