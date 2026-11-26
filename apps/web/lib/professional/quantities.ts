import { WorkspaceError } from "./input.ts";

const scale = 1_000_000n;
export const units = ["kg", "t", "m", "m²", "m³", "L", "each", "bags"] as const;

export function quantity(value: unknown, zero = false) {
  if (typeof value !== "string" || !/^\d{1,14}(?:\.\d{1,6})?$/.test(value)) {
    throw new WorkspaceError("Enter a quantity with at most 14 whole digits and 6 decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * scale + BigInt(fraction.padEnd(6, "0"));
  if (!zero && amount === 0n) throw new WorkspaceError("Quantity must be greater than zero.");
  return amount;
}

export function formatQuantity(amount: bigint) {
  const whole = amount / scale;
  const rest = (amount % scale).toString().padStart(6, "0").replace(/0+$/, "");
  return rest ? `${whole}.${rest}` : String(whole);
}

export function registryQuantity(amount: bigint) {
  if (amount <= 0n || amount % scale !== 0n) throw new WorkspaceError("The registry requires an exact, positive whole-unit quantity. No rounding was applied.");
  return amount / scale;
}

export function reconcileInspection(total: bigint, accepted: bigint, rejected: bigint, quarantined: bigint) {
  if (total <= 0n || [accepted, rejected, quarantined].some((amount) => amount < 0n) || accepted + rejected + quarantined !== total) {
    throw new WorkspaceError("Accepted, rejected and quarantined quantities must add up to the delivery quantity.");
  }
  if (accepted === total) return "accepted";
  return accepted === 0n ? "rejected" : "partially_accepted";
}
