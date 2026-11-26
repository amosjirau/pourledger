export class WorkspaceError extends Error {}

export const roles = {
  administrator: "Project administrator",
  project_manager: "Project manager",
  site_engineer: "Site engineer",
  structural_engineer: "Structural engineer",
  consultant: "Consultant",
  inspector: "QA/QC inspector",
  supplier: "Material supplier",
  laboratory: "Laboratory technician",
  storekeeper: "Storekeeper",
  quantity_surveyor: "Quantity surveyor",
  client_representative: "Client representative",
  auditor: "Read-only auditor",
} as const;
export type Role = keyof typeof roles;

export function pick<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value === "string" && choices.includes(value as T)) return value as T;
  throw new WorkspaceError(`Choose a valid ${label}.`);
}

export function text(value: unknown, label: string, limit: number, required = true) {
  const result = typeof value === "string" ? value.trim() : "";
  if ((required && !result) || result.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result)) {
    throw new WorkspaceError(`Enter ${label} using at most ${limit} characters.`);
  }
  return result;
}

export function email(value: unknown) {
  const result = text(value, "an email address", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(result)) throw new WorkspaceError("Enter a valid email address.");
  return result;
}

export function id(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new WorkspaceError("Choose an existing record.");
  }
  return value;
}

export function calendarDate(value: string, label: string) {
  if (value) {
    const timestamp = new Date(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(timestamp.getTime()) || timestamp.toISOString().slice(0, 10) !== value) {
      throw new WorkspaceError(`Enter a valid ${label}.`);
    }
  }
  return value;
}

export const projectFields = {
  contract: "Contract reference", location: "Location", client: "Client", contractor: "Main contractor",
  consultant: "Consultant", manager: "Project manager", engineer: "Responsible engineer",
  description: "Description", start: "Start date", completion: "Completion date",
  specifications: "Applicable specifications", drawings: "Drawing and revision references",
  packages: "Work packages", blocks: "Building blocks", levels: "Floors and levels", zones: "Structural zones",
} as const;
export const projectStatuses = ["planned", "active", "on hold", "completed", "closed"] as const;
type ProjectField = keyof typeof projectFields;
export type ProjectMetadata = Record<ProjectField, string> & { status: typeof projectStatuses[number] };

export function projectInput(form: FormData) {
  const metadata = Object.fromEntries(Object.entries(projectFields).map(([key, label]) =>
    [key, text(form.get(key), label, ["start", "completion"].includes(key) ? 10 : 1000, false)])) as Record<ProjectField, string>;
  calendarDate(metadata.start, "start date");
  calendarDate(metadata.completion, "completion date");
  if (metadata.start && metadata.completion && metadata.completion < metadata.start) {
    throw new WorkspaceError("Completion cannot be before the start date.");
  }
  const chainId = text(form.get("chain_project_id"), "a registry project ID", 78, false);
  if (chainId && (!/^\d+$/.test(chainId) || BigInt(chainId) === 0n || BigInt(chainId) >= 2n ** 256n)) {
    throw new WorkspaceError("Enter a valid registry project ID.");
  }
  return { code: text(form.get("code"), "a project reference", 50).toUpperCase(), name: text(form.get("name"), "a project name", 160),
    chainProjectId: chainId ? String(BigInt(chainId)) : null,
    metadata: { ...metadata, status: pick(form.get("status"), projectStatuses, "project status") } };
}

export function revision(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d{0,8}$/.test(value)) throw new WorkspaceError("Invalid record revision.");
  return Number(value);
}
