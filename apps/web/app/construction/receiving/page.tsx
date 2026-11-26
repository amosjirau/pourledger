import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentAccount, sessionCookie } from "../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../lib/professional/database.ts";
import { listDocuments } from "../../../lib/professional/documents.ts";
import { id, text, WorkspaceError } from "../../../lib/professional/input.ts";
import { requireMember, requireProject } from "../../../lib/professional/projects.ts";
import { formatQuantity, quantity, units } from "../../../lib/professional/quantities.ts";
import { authorRoles, deliveriesFor, deliveryFields, deliveryInspection, type Inspection, inspectionFields, materials, receivingRoles, reviewRoles } from "../../../lib/professional/receiving.ts";
import { WorkspaceForm } from "../workspace-form.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Material deliveries and inspections | PourLedger", robots: { index: false, follow: false } };
const showQuantity = (value: string) => formatQuantity(quantity(value, true));
const stateLabel: Record<string,string> = {
  draft: "Draft", submitted: "Submitted", under_review: "Under review", revision_required: "Revision required",
  accepted: "Accepted", partially_accepted: "Partially accepted", rejected: "Rejected",
};

function RevisionInputs({ record, delivery }: { record?: Inspection; delivery: string }) {
  return <>
    <input type="hidden" name="delivery" value={delivery} />
    {record && <><input type="hidden" name="inspection" value={record.id} /><input type="hidden" name="revision" value={record.revision} /></>}
  </>;
}

export default async function ReceivingPage({ searchParams }: {
  searchParams: Promise<{ organization?: string; project?: string; after?: string; search?: string; delivery?: string }>;
}) {
  if (!constructionEnabled()) notFound();
  const db = await constructionPool();
  const account = await currentAccount(db, (await cookies()).get(sessionCookie)?.value);
  if (!account) redirect("/construction");
  const query = await searchParams;
  let view;
  try {
    const organization = id(query.organization);
    const project = await requireProject(db, account.id, organization, id(query.project));
    const role = await requireMember(db, account.id, organization);
    const search = text(query.search, "a search term", 120, false);
    const entries = await deliveriesFor(db, account.id, organization, project.id, search, query.after ? id(query.after) : undefined);
    const detail = query.delivery ? await deliveryInspection(db, account.id, organization, project.id, id(query.delivery)) : undefined;
    const documents = detail && authorRoles.includes(role) ? await listDocuments(db, account.id, organization, project.id) : undefined;
    view = { organization, project, role, search, entries, detail, documents };
  } catch (error) { if (error instanceof WorkspaceError) notFound(); throw error; }
  const { organization, project, role, search, entries, detail, documents } = view;
  const context = `organization=${organization}&project=${project.id}`;
  const base = `/construction/receiving?${context}`;
  const record = detail?.inspection;
  const draftable = detail && authorRoles.includes(role) && (!record ||
    (record.author === account.id && ["draft","revision_required"].includes(record.status)));
  const evidenceOption = record?.document_id ? `${record.document_id}:${record.document_revision}` : undefined;
  return <main className="live-shell">
    <a href={`/construction?${context}`}>{project.code} · {project.name}</a>
    <h1>Material deliveries and inspections</h1>
    <section className="live-panel">
      <h2>Delivery register</h2>
      <form action="/construction/receiving">
        <input type="hidden" name="organization" value={organization} /><input type="hidden" name="project" value={project.id} />
        <label>Search by reference, supplier or material <input name="search" defaultValue={search} maxLength={120} /></label>
        <button>Search deliveries</button>
      </form>
      {entries.entries.length ? <ul>{entries.entries.map((entry) => <li key={entry.id}>
        <a href={`${base}&delivery=${entry.id}`}>{entry.reference} · {entry.material}</a> · {showQuantity(entry.quantity)} {entry.unit}</li>)}</ul>
        : <p>No deliveries match this view.</p>}
      {entries.more && <a href={`${base}&search=${encodeURIComponent(search)}&after=${entries.more}`}>More deliveries</a>}
    </section>
    {detail && <section className="live-panel">
      <h2>{detail.delivery.reference} · {detail.delivery.material}</h2>
      <p>{detail.delivery.supplier} · Delivery note {detail.delivery.delivery_note}, line {detail.delivery.line} · {detail.delivery.delivery_date}</p>
      <p>Received {showQuantity(detail.delivery.quantity)} {detail.delivery.unit}</p>
      <dl>{Object.entries(detail.delivery.metadata).filter(([, value]) => value).map(([key,value]) =>
        <div key={key}><dt>{deliveryFields[key as keyof typeof deliveryFields]}</dt><dd>{value}</dd></div>)}</dl>
      <h3>Material inspection request</h3>
      {record && <>
        <p>{record.reference} · {stateLabel[record.status]} · Revision {record.revision}{record.inspection_date && ` · ${record.inspection_date}`}</p>
        <dl>{Object.entries(record.metadata).filter(([, value]) => value).map(([key,value]) =>
          <div key={key}><dt>{inspectionFields[key as keyof typeof inspectionFields]}</dt><dd>{value}</dd></div>)}</dl>
        {record.accepted !== null && <p>Accepted {showQuantity(record.accepted)} · Rejected {showQuantity(record.rejected!)} ·{" "}
          Quarantined {showQuantity(record.quarantined!)} {detail.delivery.unit}</p>}
        {record.evidence_digest && <p className="live-mono">Evidence revision {record.document_revision} · Keccak-256 {record.evidence_digest}</p>}
        <p>Workspace inspection record. Registry attestations are shown in the live registry.</p>
      </>}
      {draftable && <WorkspaceForm task="inspection" organization={organization} project={project.id} submit="Save inspection">
        <RevisionInputs delivery={detail.delivery.id} record={record} />
        {!record && <label>Inspection reference <input name="reference" maxLength={60} required /></label>}
        <label>Inspection date <input name="date" type="date" defaultValue={record?.inspection_date ?? undefined} /></label>
        {Object.entries(inspectionFields).map(([key,label]) =>
          <label key={key}>{label}<input name={key} maxLength={800} defaultValue={record?.metadata[key]} /></label>)}
        <label>Filed evidence revision <select name="evidence" defaultValue={evidenceOption ?? ""}>
          <option value="">Choose a revision</option>
          {evidenceOption && !documents?.entries.some((item) => `${item.id}:${item.revision}` === evidenceOption) &&
            <option value={evidenceOption}>Keep the linked revision</option>}
          {documents?.entries.filter((item) => !item.archived_at).map((item) => <option key={item.id} value={`${item.id}:${item.revision}`}>
            {item.reference} · Revision {item.revision}</option>)}
        </select></label>
        <a href={`/construction/documents?${context}`}>File evidence in Project documents</a>
        <label>Save as <select name="operation"><option value="draft">Draft</option><option value="submit">Submit for review</option></select></label>
      </WorkspaceForm>}
      {record?.status === "submitted" && reviewRoles.includes(role) && record.author !== account.id &&
        <WorkspaceForm task="inspection" organization={organization} project={project.id} submit="Start review">
          <RevisionInputs delivery={detail.delivery.id} record={record} /><input type="hidden" name="operation" value="review" />
        </WorkspaceForm>}
      {record?.status === "under_review" && record.reviewer === account.id && reviewRoles.includes(role) && <>
        <WorkspaceForm task="inspection" organization={organization} project={project.id} submit="Record decision">
          <RevisionInputs delivery={detail.delivery.id} record={record} /><input type="hidden" name="operation" value="decide" />
          {[["accepted","Accepted"],["rejected","Rejected"],["quarantined","Quarantined"]].map(([key,label]) =>
            <label key={key}>{label} ({detail.delivery.unit}) <input name={key} inputMode="decimal" required /></label>)}
          <label>Inspection finding <input name="reason" maxLength={800} required /></label>
        </WorkspaceForm>
        <WorkspaceForm task="inspection" organization={organization} project={project.id} submit="Request revision">
          <RevisionInputs delivery={detail.delivery.id} record={record} /><input type="hidden" name="operation" value="return" />
          <label>Revision reason <input name="reason" maxLength={800} required /></label>
        </WorkspaceForm>
      </>}
    </section>}
    {receivingRoles.includes(role) && <section className="live-panel"><details><summary>Record a material delivery</summary>
      <WorkspaceForm task="receive" organization={organization} project={project.id} submit="Record delivery">
        <label>Delivery reference <input name="reference" maxLength={60} required /></label>
        <label>Material category <select name="material">{materials.map((material) => <option key={material}>{material}</option>)}</select></label>
        <label>Supplier <input name="supplier" maxLength={160} required /></label>
        <label>Delivery note number <input name="note" maxLength={80} required /></label>
        <label>Delivery note line <input name="line" maxLength={30} required /></label>
        <label>Delivery date <input name="date" type="date" required /></label>
        <label>Quantity <input name="quantity" inputMode="decimal" required /></label>
        <label>Unit <select name="unit">{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        {Object.entries(deliveryFields).map(([key,label]) =>
          <label key={key}>{label}<input name={key} maxLength={800} required={key === "description" || key === "condition"} /></label>)}
      </WorkspaceForm>
    </details></section>}
  </main>;
}
