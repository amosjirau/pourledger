import type { Pool } from "pg";
import { WorkspaceError } from "./input.ts";
import { requireProject } from "./projects.ts";
import { formatQuantity, quantity } from "./quantities.ts";

export function csvField(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  // Prevent spreadsheet formula evaluation after a file is opened by a recipient.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export async function deliveryCsv(db: Pool, actor: string, organization: string, projectId: string, search: string) {
  const project = await requireProject(db, actor, organization, projectId);
  const { rows } = await db.query<{ reference: string; delivery_date: string; material: string; supplier: string; delivery_note: string; line: string;
    quantity: string; unit: string; metadata: Record<string,string>; mir: string | null; status: string | null; accepted: string | null;
    rejected: string | null; quarantined: string | null }>(`SELECT d.reference,d.delivery_date::text,d.material,d.supplier,d.delivery_note,d.line,
    d.quantity::text,d.unit,d.metadata,i.reference AS mir,i.status,i.accepted::text,i.rejected::text,i.quarantined::text
    FROM construction.deliveries d LEFT JOIN construction.inspection_requests i
    ON (i.organization_id,i.project_id,i.delivery_id)=(d.organization_id,d.project_id,d.id)
    WHERE d.organization_id=$1 AND d.project_id=$2 AND
    ($3='' OR position(lower($3) in lower(d.reference||' '||d.supplier||' '||d.material||' '||d.delivery_note))>0)
    ORDER BY d.delivery_date,d.id LIMIT 1001`, [organization,projectId,search]);
  if (rows.length > 1000) throw new WorkspaceError("Use a narrower filter to export up to 1,000 delivery records.");
  const columns = ["Project","Project revision","Delivery reference","Date","Material","Description","Supplier","Manufacturer","Delivery note","Line",
    "Purchase order","Batch or heat","Grade","Received","Unit","MIR reference","Workspace decision","Accepted","Rejected","Quarantined"];
  const decimal = (value: string | null) => value === null ? "" : formatQuantity(quantity(value,true));
  const lines = [columns, ...rows.map((row) => [project.code, project.revision, row.reference, row.delivery_date, row.material, row.metadata.description,
    row.supplier, row.metadata.manufacturer, row.delivery_note, row.line, row.metadata.purchaseOrder, row.metadata.batch, row.metadata.grade,
    decimal(row.quantity), row.unit, row.mir, row.status, decimal(row.accepted), decimal(row.rejected), decimal(row.quarantined)])];
  return "\uFEFF" + lines.map((line) => line.map(csvField).join(",")).join("\r\n") + "\r\n";
}
