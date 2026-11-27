import { WorkspaceError } from "./input.ts";

function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0 || value > 1e9) throw new WorkspaceError(`Enter a positive supported ${label}.`);
  return value;
}

export function circularArea(diameterMm: number) {
  return Math.PI * positive(diameterMm, "diameter") ** 2 / 4;
}

export function rectangularConcreteVolume(lengthM: number, widthM: number, depthM: number, count = 1) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 1_000_000) throw new WorkspaceError("Enter a positive whole count.");
  return positive(lengthM, "length") * positive(widthM, "width") * positive(depthM, "depth") * count;
}

export function specimenStrength(loadKn: number, shape: "cube" | "cylinder", breadthMm: number, widthMm?: number) {
  const areaMm2 = shape === "cylinder" ? circularArea(breadthMm)
    : positive(breadthMm, "loaded face breadth") * positive(widthMm ?? breadthMm, "loaded face width");
  return { areaMm2, strengthMpa: 1000 * positive(loadKn, "failure load") / areaMm2 };
}

export function requiredBarCount(requiredMetres:number, barLengthMetres:number) {
  return Math.ceil(positive(requiredMetres,"total required length") / positive(barLengthMetres,"individual bar length"));
}

export function utilization(accepted:number, allocated:number) {
  const basis = positive(accepted,"accepted quantity");
  if (!Number.isFinite(allocated) || allocated < 0 || allocated > basis) throw new WorkspaceError("Allocated quantity must be within the accepted quantity.");
  return { percent:100*allocated/basis, remaining:basis-allocated };
}

export function siValue(input:number, from:"mm"|"m"|"kg"|"t"|"L"|"m³", to:"mm"|"m"|"kg"|"t"|"L"|"m³") {
  const units = { mm:["length",0.001], m:["length",1],kg:["mass",1],t:["mass",1000],L:["volume",0.001],"m³":["volume",1] } as const;
  if (!Number.isFinite(input) || input < 0 || input > 1e9) throw new WorkspaceError("Enter a nonnegative supported quantity.");
  if (units[from]?.[0] !== units[to]?.[0] || !units[from] || !units[to]) throw new WorkspaceError("Choose units of the same physical quantity.");
  return input * units[from][1] / units[to][1];
}

export function dateAfter(date: string, days: number) {
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) throw new WorkspaceError("Enter a test age between 1 and 365 days.");
  const value = new Date(date + "T00:00:00Z");
  if (!Number.isFinite(value.getTime())) throw new WorkspaceError("Enter a valid sampling date.");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
