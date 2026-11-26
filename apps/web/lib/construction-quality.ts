export const inspectionItems = [
  ["delivery", "Delivery note and batch traceability"],
  ["certificate", "Material certificate reviewed"],
  ["identification", "Material identification and specified grade"],
  ["dimensions", "Dimensions and quantity checked"],
  ["condition", "Visual condition and storage"],
] as const;
export const outcomes = ["satisfactory", "nonconforming", "not-applicable"] as const;
export const references = [
  { code: "NIS 117:2024", description: "Steel bars for reinforcement of concrete", url: "https://library.son.gov.ng/NA?g=civil&s=2&t=groups-opac" },
  { code: "BS 4449", description: "Weldable reinforcing steel; confirm the project edition", url: "https://knowledge.bsigroup.com/products/steel-for-the-reinforcement-of-concrete-weldable-reinforcing-steel-bar-coil-and-decoiled-product-specification" },
  { code: "BS EN 12350-2:2019", description: "Fresh concrete slump test method", url: "https://knowledge.bsigroup.com/products/testing-fresh-concrete-slump-test-2" },
  { code: "BS EN 12390-3:2019", description: "Hardened concrete compressive strength test method", url: "https://knowledge.bsigroup.com/products/testing-hardened-concrete-compressive-strength-of-test-specimens-1" },
] as const;

function field(form: FormData, key: string, max = 256) {
  const value = form.get(key);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error("Complete " + key + " (maximum " + max + " characters).");
  return value.trim();
}
function integer(value: string, zero = false) {
  if (!/^(0|[1-9][0-9]{0,38})$/.test(value) || (!zero && value === "0") || BigInt(value) >= 2n ** 128n) throw new Error("Use a supported whole-number quantity or ID.");
  return BigInt(value);
}

export function materialInspection(form: FormData, scope: { chainId: number; registry: string; project: string; lot: string; declared: string; unit: string }) {
  const declared = integer(scope.declared);
  const accepted = integer(field(form, "accepted"), true);
  if (accepted > declared) throw new Error("Accepted quantity exceeds the declared quantity.");
  const checks = inspectionItems.map(([key, label]) => {
    const outcome = field(form, key);
    if (!outcomes.some((item) => item === outcome)) throw new Error("Select an inspection outcome.");
    return { key, label, outcome, observation: field(form, key + "-note", 500) };
  });
  if (!checks.some((check) => check.outcome === "satisfactory")) {
    if (accepted > 0n) throw new Error("Acceptance requires a recorded satisfactory check.");
  }
  if (accepted === declared && checks.some((check) => check.outcome === "nonconforming")) throw new Error("Full acceptance conflicts with an unresolved nonconforming check.");
  const decision = accepted === 0n ? "rejected" : accepted === declared ? "accepted" : "partially-accepted";
  return {
    schema: "pourledger.material-inspection.v1",
    status: "prepared-for-review",
    scope: { chainId: scope.chainId, registry: scope.registry.toLowerCase(), projectId: scope.project, lotId: scope.lot },
    reference: field(form, "inspection reference"), revision: field(form, "revision"),
    deliveryReference: field(form, "delivery reference"), materialDescription: field(form, "material description"),
    specification: { reference: field(form, "standard and edition"), clauseOrITP: field(form, "clause or ITP reference"), acceptanceCriteria: field(form, "project acceptance criteria", 1000) },
    checks,
    quantity: { declared: declared.toString(), accepted: accepted.toString(), unit: scope.unit },
    proposedDecision: decision,
    disposition: field(form, "disposition", 1000),
  };
}

export function recordBytes(record: ReturnType<typeof materialInspection>) {
  return JSON.stringify(record, null, 2) + "\n";
}

export function nominalRebarMass(diameterMm: number, lengthM: number, pieces: number) {
  if (![diameterMm, lengthM, pieces].every(Number.isFinite) || diameterMm <= 0 || lengthM <= 0 || !Number.isSafeInteger(pieces) || pieces <= 0) throw new Error("Enter positive dimensions and a whole number of bars.");
  const kgPerM = Math.PI * (diameterMm / 1000) ** 2 / 4 * 7850;
  const totalKg = kgPerM * lengthM * pieces;
  if (!Number.isFinite(totalKg)) throw new Error("Dimensions exceed the supported range.");
  return { kgPerM, totalKg };
}
