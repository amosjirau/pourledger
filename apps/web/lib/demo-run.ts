import { keccak256, stringToHex, type Address, type Hash } from "viem";
import type { ActionName } from "./actions.ts";
import { address, digest, sameHex, type RegistryTarget } from "./chain.ts";
import type { ExpectedEvent } from "./receipt.ts";

export const demoMainnetRegistry = "0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63";
export const demoMainnetBlock = 12_148_098n;
export const demoProductionOrigin = "https://pourledger-one.vercel.app";
export const demoRoles = ["supervisor", "supplier", "inspector", "engineer", "lab"] as const;
type DemoRole = typeof demoRoles[number];
export const stepLabels = {
  project: "Create synthetic project",
  inspector: "Grant inspector role",
  engineer: "Grant engineer role",
  labRole: "Grant optional lab role",
  element: "Create Column C3",
  register: "Register 100 kg of rebar",
  decision: "Accept 100 kg of rebar",
  assign: "Assign 60 kg to Column C3",
  lab: "Attach synthetic lab evidence",
} as const;
export type StepKey = keyof typeof stepLabels;
export type DemoAttempt = { nonce: number; calldataHash: Hash; hash?: Hash };
export type DemoRun = {
  version: 1;
  runId: string;
  chainId: number;
  registry: Address;
  accounts: Partial<Record<DemoRole, Address>>;
  attempts: Partial<Record<StepKey, DemoAttempt>>;
};
export type VerifiedStep = { key: StepKey; hash: Hash; block: string; blockHash: Hash; id?: string };
export type DemoProgress = {
  verified: VerifiedStep[];
  next?: StepKey;
  state: "ready" | "recover" | "pending" | "reverted" | "complete";
  snapshotBlock: string;
  snapshotHash: Hash;
  passportHistoryAvailable: boolean;
};
type Step = { action: ActionName; account: Address; form: FormData; expected: ExpectedEvent; key: StepKey };

export function demoSteps(run: DemoRun): StepKey[] {
  return run.accounts.lab ? ["project", "inspector", "engineer", "labRole", "element", "register", "decision", "assign", "lab"]
    : ["project", "inspector", "engineer", "element", "register", "decision", "assign"];
}

export function demoText(run: DemoRun, text: string) {
  return `SYNTHETIC POURLEDGER DEMONSTRATION ${run.runId}\n${text}\n`;
}

export function demoEvidence(run: DemoRun) {
  return {
    "inspection.txt": demoText(run, "Synthetic record for full acceptance of 100 kg of rebar. No physical inspection took place."),
    "assignment.txt": demoText(run, "Synthetic allocation of 60 kg of rebar to Column C3. No material was installed."),
    ...(run.accounts.lab ? {
      "lab.txt": demoText(run, "Synthetic bytes for digest verification. No sample was tested and no scientific result is asserted."),
    } : {}),
  };
}

const hashText = (text: string) => keccak256(stringToHex(text));

export function demoStep(run: DemoRun, key: StepKey, verified: VerifiedStep[]): Step {
  const id = (step: StepKey) => BigInt(verified.find((item) => item.key === step)?.id ?? "0");
  const account = (role: DemoRole) => address(run.accounts[role] ?? "");
  const projectId = id("project");
  const elementId = id("element");
  const lotId = id("register");
  const supervisor = account("supervisor");
  const supplier = account("supplier");
  const scope = (reference: string) => hashText(demoText(run, reference));
  const evidence = demoEvidence(run);
  const step = (action: ActionName, signer: Address, inputs: ExpectedEvent["fields"], expected: ExpectedEvent): Step => {
    const form = new FormData();
    for (const [field, value] of Object.entries(inputs)) form.set(field, String(value));
    return { action, account: signer, form, expected, key };
  };
  switch (key) {
    case "project": {
      const fields = { projectHash: scope("Synthetic construction project"), supervisor };
      return step("project", supervisor, fields, { name: "ProjectCreated", fields: { ...fields, creator: supervisor }, generatedId: "projectId" });
    }
    case "inspector":
    case "engineer":
    case "labRole": {
      const member = account(key === "labRole" ? "lab" : key);
      const role = key === "inspector" ? 1 : key === "engineer" ? 2 : 3;
      return step("role", supervisor, { projectId, member, role, enabled: true }, {
        name: "ProjectRoleUpdated", fields: { projectId, account: member, role, enabled: true },
      });
    }
    case "element": {
      const fields = { projectId, elementCodeHash: scope("Column C3"), elementType: 2 };
      return step("element", supervisor, fields, { name: "ElementCreated", fields: { ...fields, creator: supervisor }, generatedId: "elementId" });
    }
    case "register": {
      const fields = { projectId, lotHash: scope("Synthetic 100 kg rebar lot"), supplier, materialType: 1, unitCode: hashText("kg") };
      return step("register", supplier, { ...fields, quantity: 100n }, {
        name: "MaterialLotRegistered", fields: { ...fields, declaredQuantity: 100n }, generatedId: "lotId",
      });
    }
    case "decision": {
      const inspector = account("inspector");
      const fields = { lotId, decision: 2, conditionHash: hashText(evidence["inspection.txt"]) };
      return step("decision", inspector, { ...fields, quantity: 100n }, {
        name: "LotDecisionRecorded", fields: { ...fields, inspector, projectId, acceptedQuantity: 100n },
      });
    }
    case "assign": {
      const engineer = account("engineer");
      const fields = { lotId, elementId, evidenceHash: hashText(evidence["assignment.txt"]) };
      return step("assign", engineer, { ...fields, quantity: 60n }, {
        name: "LotAssignedToElement", fields: { ...fields, engineer, usedQuantity: 60n }, generatedId: "assignmentId",
      });
    }
    case "lab": {
      const lab = account("lab");
      const fields = { lotId, sampleHash: scope("Synthetic lab sample"), resultsHash: hashText(evidence["lab.txt"] ?? "") };
      return step("lab", lab, fields, { name: "TestEvidenceAttached", fields: { ...fields, lab }, generatedId: "testId" });
    }
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid demonstration journal.");
  return value as Record<string, unknown>;
}

export function parseDemoRun(value: unknown, target: RegistryTarget): DemoRun {
  const root = object(value);
  if (root.version !== 1 || root.chainId !== target.chainId || typeof root.registry !== "string" || !sameHex(root.registry, target.registry) ||
      typeof root.runId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(root.runId)) {
    throw new Error("Journal does not match this chain, registry or format.");
  }
  const accounts: DemoRun["accounts"] = {};
  const roles = object(root.accounts);
  for (const role of demoRoles) {
    if (role === "lab" && roles[role] === undefined) continue;
    const value = roles[role];
    if (typeof value !== "string") throw new Error(`Enter a ${role} address.`);
    accounts[role] = address(value.trim());
  }
  const assignedAccounts = Object.values(accounts);
  if (new Set(assignedAccounts).size !== assignedAccounts.length) throw new Error("Assign a different wallet to each role.");
  const run: DemoRun = { version: 1, runId: root.runId, chainId: target.chainId, registry: target.registry, accounts, attempts: {} };
  const entries = object(root.attempts);
  const steps = demoSteps(run);
  const keys = Object.keys(entries);
  if (keys.some((key) => !steps.some((step) => step === key))) throw new Error("Journal has an unexpected action.");
  for (const [index, key] of steps.entries()) {
    if (index >= keys.length) break;
    const entry = object(entries[key]);
    if (typeof entry.nonce !== "number" || !Number.isSafeInteger(entry.nonce) || entry.nonce < 0 || typeof entry.calldataHash !== "string" ||
        (entry.hash !== undefined && typeof entry.hash !== "string") || (index < keys.length - 1 && !entry.hash)) {
      throw new Error("Journal has an incomplete or invalid attempt order.");
    }
    run.attempts[key] = { nonce: entry.nonce, calldataHash: digest(entry.calldataHash), hash: typeof entry.hash === "string" ? digest(entry.hash) : undefined };
  }
  return run;
}
