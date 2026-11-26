import type { Pool } from "pg";
import { transact } from "./database.ts";
import { calendarDate, id, pick, revision, text, type Role, WorkspaceError } from "./input.ts";
import { managers, requireProject } from "./projects.ts";
import { formatQuantity, quantity, reconcileInspection, units } from "./quantities.ts";

export const materials = ["Reinforcing steel", "Cement", "Ready-mixed concrete", "Fine aggregate", "Coarse aggregate",
  "Concrete blocks", "Structural steel", "Admixture", "Water", "Other"] as const;
export const receivingRoles: readonly Role[] = [...managers, "site_engineer", "storekeeper", "supplier"];
export const authorRoles: readonly Role[] = [...managers, "site_engineer", "inspector"];
export const reviewRoles: readonly Role[] = ["inspector", "consultant"];
export const deliveryFields = {
  description: "Material description", manufacturer: "Manufacturer", purchaseOrder: "Purchase order",
  batch: "Batch or heat number", grade: "Specified grade", dimensions: "Dimensions", storage: "Storage location",
  specification: "Applicable specification", condition: "Delivery condition",
} as const;
export const inspectionFields = {
  specification: "Specification and approved standard editions", criteria: "Project acceptance criteria", checklist: "Checklist results",
  observations: "Observations", remarks: "Remarks", correctiveAction: "Corrective action",
} as const;
export type Delivery = { id: string; reference: string; material: string; supplier: string; delivery_note: string; line: string;
  delivery_date: string; quantity: string; unit: string; metadata: Record<string,string> };
export type Inspection = { id: string; delivery_id: string; reference: string; status: string; revision: number; author: string;
  reviewer: string | null; inspection_date: string | null; metadata: Record<string,string>; accepted: string | null; rejected: string | null;
  quarantined: string | null; document_id: string | null; document_revision: number | null; evidence_digest: string | null };

function formMetadata(form: FormData, fields: Record<string,string>, required?: readonly string[]) {
  return Object.fromEntries(Object.entries(fields).map(([key, label]) => [key, text(form.get(key), label, 800, required?.includes(key) ?? false)]));
}

export async function addDelivery(db: Pool, actor: string, organization: string, project: string, form: FormData) {
  const reference = text(form.get("reference"), "a delivery reference", 60).toUpperCase();
  const kind = pick(form.get("material"), materials, "material category");
  const supplier = text(form.get("supplier"), "a supplier", 160);
  const note = text(form.get("note"), "a delivery note", 80).toUpperCase();
  const line = text(form.get("line"), "a delivery note line", 30).toUpperCase();
  const date = calendarDate(text(form.get("date"), "a delivery date", 10), "delivery date");
  const count = formatQuantity(quantity(form.get("quantity")));
  const unit = pick(form.get("unit"), units, "unit of measure");
  const metadata = formMetadata(form, deliveryFields, ["description", "condition"]);
  return transact(db, async (tx) => {
    await requireProject(tx, actor, organization, project, receivingRoles);
    const { rows: [record] } = await tx.query<{id: string}>(`INSERT INTO construction.deliveries
      (organization_id,project_id,reference,material,supplier,supplier_key,delivery_note,line,delivery_date,quantity,unit,metadata,author)
      VALUES ($1,$2,$3,$4,$5,lower($5),$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [organization, project, reference, kind, supplier, note, line, date, count, unit, metadata, actor]);
    await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,payload)
      VALUES ($1,$2,$3,$4,'delivery.received',$5)`, [organization, project, actor, record.id, { quantity: count, unit }]);
    return record;
  });
}

export async function deliveriesFor(db: Pool, actor: string, organization: string, project: string, filter: string, cursor?: string) {
  await requireProject(db, actor, organization, project);
  const { rows } = await db.query<Delivery>(`SELECT id,reference,material,supplier,delivery_note,line,delivery_date::text,
    quantity::text,unit,metadata FROM construction.deliveries
    WHERE organization_id=$1 AND project_id=$2 AND ($3::uuid IS NULL OR id>$3)
      AND ($4='' OR position(lower($4) in lower(reference||' '||supplier||' '||material||' '||delivery_note))>0)
    ORDER BY id LIMIT 21`, [organization, project, cursor ?? null, filter]);
  return { entries: rows.slice(0, 20), more: rows.length > 20 ? rows[19].id : undefined };
}

export async function deliveryInspection(db: Pool, actor: string, organization: string, project: string, delivery: string) {
  await requireProject(db, actor, organization, project);
  const { rows: [record] } = await db.query<Delivery>(`SELECT id,reference,material,supplier,delivery_note,line,delivery_date::text,quantity::text,unit,metadata
    FROM construction.deliveries WHERE organization_id=$1 AND project_id=$2 AND id=$3`, [organization, project, delivery]);
  if (!record) throw new WorkspaceError("Delivery unavailable.");
  const { rows: [inspection] } = await db.query<Inspection>(`SELECT m.id,m.delivery_id,m.reference,m.status,m.revision,m.author,m.reviewer,
    m.inspection_date::text,m.metadata,m.accepted::text,m.rejected::text,m.quarantined::text,m.document_id,m.document_revision,r.keccak AS evidence_digest
    FROM construction.inspection_requests m LEFT JOIN construction.document_revisions r
      ON (r.organization_id,r.project_id,r.document_id,r.revision)=(m.organization_id,m.project_id,m.document_id,m.document_revision)
    WHERE m.organization_id=$1 AND m.project_id=$2 AND m.delivery_id=$3`, [organization, project, delivery]);
  return { delivery: record, inspection };
}

export async function saveInspection(db: Pool, actor: string, organization: string, project: string, form: FormData) {
  const delivery = id(form.get("delivery"));
  const inspection = form.get("inspection") ? id(form.get("inspection")) : null;
  const operation = pick(form.get("operation"), ["draft","submit","review","return","decide"] as const, "inspection action");
  return transact(db, async (tx) => {
    const reviewer = ["review","return","decide"].includes(operation);
    await requireProject(tx, actor, organization, project, reviewer ? reviewRoles : authorRoles);
    const { rows: [lot] } = await tx.query<{quantity: string; unit: string}>(`SELECT quantity::text,unit FROM construction.deliveries
      WHERE organization_id=$1 AND project_id=$2 AND id=$3`, [organization, project, delivery]);
    if (!lot) throw new WorkspaceError("Delivery unavailable.");
    const { rows: [current] } = await tx.query<Inspection>(`SELECT id,reference,status,author,reviewer,revision,document_id,document_revision
      FROM construction.inspection_requests WHERE organization_id=$1 AND project_id=$2 AND delivery_id=$3 FOR UPDATE`, [organization, project, delivery]);
    if (current && (current.id !== inspection || current.revision !== revision(form.get("revision")))) {
      throw new WorkspaceError("The inspection has changed. Reload before saving.");
    }
    if (!current && (inspection || reviewer)) throw new WorkspaceError("Create the inspection before requesting a review.");
    if (current && (reviewer ? current.author === actor : current.author !== actor)) {
      throw new WorkspaceError("The inspection author and reviewer must be different authorized people.");
    }
    const scope = [organization, project, delivery];
    let status: string;
    let audit: Record<string,unknown> = {};
    if (!reviewer) {
      if (current && !["draft","revision_required"].includes(current.status)) throw new WorkspaceError("This inspection is already submitted or decided.");
      const reference = current?.reference ?? text(form.get("reference"), "an inspection reference", 60).toUpperCase();
      const date = calendarDate(text(form.get("date"), "an inspection date", 10, operation === "submit"), "inspection date") || null;
      const metadata = formMetadata(form, inspectionFields, operation === "submit" ? ["specification","criteria","checklist","observations"] : []);
      const evidence = form.get("document") ? id(form.get("document")) : null;
      const evidenceRevision = evidence ? revision(form.get("evidence_revision")) : null;
      if (evidence) {
        const document = await tx.query(`SELECT 1 FROM construction.document_revisions WHERE organization_id=$1 AND project_id=$2 AND document_id=$3 AND revision=$4`,
          [organization, project, evidence, evidenceRevision]);
        if (!document.rowCount) throw new WorkspaceError("Select a document revision from this project.");
      }
      status = operation === "submit" ? "submitted" : "draft";
      const args = [...scope, reference, status, date, metadata, evidence, evidenceRevision, actor];
      if (!current) await tx.query(`INSERT INTO construction.inspection_requests
        (organization_id,project_id,delivery_id,reference,status,inspection_date,metadata,document_id,document_revision,author)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, args);
      else await tx.query(`UPDATE construction.inspection_requests SET reference=$4,status=$5,inspection_date=$6,
        metadata=$7,document_id=$8,document_revision=$9,revision=revision+1,reviewer=NULL
        WHERE organization_id=$1 AND project_id=$2 AND delivery_id=$3 AND author=$10`, args);
      audit = { reference, date, metadata, evidence, evidenceRevision };
    } else if (operation === "review" && current.status === "submitted") {
      status = "under_review";
      await tx.query(`UPDATE construction.inspection_requests SET status=$4,reviewer=$5,revision=revision+1
        WHERE organization_id=$1 AND project_id=$2 AND delivery_id=$3`, [...scope, status, actor]);
    } else if (current.status === "under_review" && actor === current.reviewer && operation === "return") {
      status = "revision_required";
      audit = { reason: text(form.get("reason"), "a revision reason", 800) };
      await tx.query(`UPDATE construction.inspection_requests SET status=$4,reviewer=NULL,revision=revision+1
        WHERE organization_id=$1 AND project_id=$2 AND delivery_id=$3`, [...scope, status]);
    } else if (current.status === "under_review" && actor === current.reviewer && operation === "decide") {
      const [accepted,rejected,quarantined] = ["accepted","rejected","quarantined"].map((field) => quantity(form.get(field), true));
      status = reconcileInspection(quantity(lot.quantity), accepted, rejected, quarantined);
      const { rows: [proof] } = await tx.query<{keccak: string}>(`SELECT keccak FROM construction.document_revisions
        WHERE organization_id=$1 AND project_id=$2 AND document_id=$3 AND revision=$4`,
      [organization, project, current.document_id, current.document_revision]);
      if (!proof) throw new WorkspaceError("A filed evidence revision is required for a reviewed decision.");
      const totals = [accepted,rejected,quarantined].map(formatQuantity);
      const finding = text(form.get("reason"), "an inspection finding", 800);
      await tx.query(`UPDATE construction.inspection_requests SET status=$4,accepted=$5,rejected=$6,quarantined=$7,revision=revision+1
        WHERE organization_id=$1 AND project_id=$2 AND delivery_id=$3`, [...scope, status, ...totals]);
      audit = { accepted: totals[0], rejected: totals[1], quarantined: totals[2], unit: lot.unit, digest: proof.keccak, finding };
    } else throw new WorkspaceError("This inspection action is unavailable for the current state.");
    await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,revision,payload)
      SELECT $1,$2,$4,id,$5,revision,$6 FROM construction.inspection_requests WHERE organization_id=$1 AND project_id=$2 AND delivery_id=$3`,
    [...scope, actor, `inspection.${status}`, audit]);
    return status;
  });
}
