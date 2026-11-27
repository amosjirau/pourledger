import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentAccount, sessionCookie } from "../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../lib/professional/database.ts";
import { id, type Role, WorkspaceError } from "../../../lib/professional/input.ts";
import { type Project, requireMember, requireProject } from "../../../lib/professional/projects.ts";
import { canReviewQuality, itpActivities, qualityDefinitions, qualityKind, type QualityKind,
  qualityPage, type QualityRecord } from "../../../lib/professional/quality-records.ts";
import { WorkspaceForm } from "../workspace-form.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title:"Quality registers | PourLedger",robots:{index:false,follow:false} };
type Selection = Awaited<ReturnType<typeof qualityPage>>["options"];
const linkLabels:Record<string,string> = { element:"Structural element",delivery:"Material delivery",specification:"Approved specification revision",
  related:"Related quality record",document:"Evidence document revision" };
const fieldOptions:Record<string,readonly string[]> = {
  activity:itpActivities,control:["Hold","Witness","Review","Surveillance"],shape:["cube","cylinder"],
};
const computedLabels:Record<string,string> = { assessment:"Review findings", loaded_area:"Loaded area (mm²)",strength:"Calculated result (MPa)" };

function QualityForm({ organization,project,kind,options,record }: {
  organization:string;project:string;kind:QualityKind;options:Selection;record?:QualityRecord;
}) {
  const definition = qualityDefinitions[kind];
  const fieldId = (name:string) => `${kind}-${record?.id ?? "new"}-${name}`;
  const selected:Record<string,string|null|undefined> = { element:record?.element_id,delivery:record?.delivery_id,
    specification:record?.specification_id,related:record?.related_id,document:record?.document_id ? `${record.document_id}:${record.document_revision}` : null };
  return <WorkspaceForm task="quality" organization={organization} project={project} submit="Save quality record">
    <input type="hidden" name="kind" value={kind} />
    {record ? <><input type="hidden" name="record" value={record.id} /><input type="hidden" name="revision" value={record.revision} /></>
      : <label>Record reference <input name="reference" maxLength={60} required /></label>}
    <label>Title <input name="title" maxLength={160} defaultValue={record?.title} required /></label>
    {definition.fields.map(([name,label,fieldType]) => <label key={name} htmlFor={fieldId(name)}>{label}
      {fieldOptions[name] ? <select id={fieldId(name)} name={name} defaultValue={record?.fields[name] ?? ""}><option value="">Select a value</option>
        {fieldOptions[name].map((value) => <option key={value}>{value}</option>)}</select>
        : <input id={fieldId(name)} name={name} type={fieldType === "date" ? "date" : "text"}
          inputMode={fieldType === "decimal" ? "decimal" : fieldType === "whole" ? "numeric" : undefined}
          maxLength={900} defaultValue={record?.fields[name]} />}
    </label>)}
    {[...definition.links,"document"].map((link) => {
      const selections = options.filter((item) => item.kind === link && item.id !== record?.id);
      const value = (item:Selection[number]) => link === "document" ? `${item.id}:${item.revision}` : item.id;
      const previous = selected[link];
      return <label key={link}>{kind === "laboratory" && link === "related" ? "Related concrete pour" : linkLabels[link]}
        <select name={link === "document" ? "evidence_link" : link} defaultValue={previous ?? ""}>
          <option value="">Choose a record</option>
          {previous && !selections.some((item) => value(item) === previous) && <option value={previous}>Retain linked record</option>}
          {selections.map((item) => <option key={value(item)} value={value(item)}>{item.label}{item.revision ? ` · Revision ${item.revision}` : ""}</option>)}
        </select>
      </label>;
    })}
    <label>Save as <select name="operation"><option value="draft">Draft</option><option value="submit">Submit for review</option></select></label>
  </WorkspaceForm>;
}

export default async function QualityPage({ searchParams }: {
  searchParams:Promise<{ organization?:string; project?:string; kind?:string; after?:string; record?:string }>;
}) {
  if (!constructionEnabled()) notFound();
  const db = await constructionPool();
  const account = await currentAccount(db,(await cookies()).get(sessionCookie)?.value);
  if (!account) redirect("/construction");
  const query = await searchParams;
  let view: {organization:string;project:Project;role:Role;kind:QualityKind;result:Awaited<ReturnType<typeof qualityPage>>};
  try {
    const organization = id(query.organization);
    const project = await requireProject(db,account.id,organization,id(query.project));
    const role = await requireMember(db,account.id,organization);
    const kind = query.kind ? qualityKind(query.kind) : "itp";
    const result = await qualityPage(db,account.id,organization,project.id,kind,query.after ? id(query.after) : undefined,query.record ? id(query.record) : undefined);
    view = { organization,project,role,kind,result };
  } catch (error) { if (error instanceof WorkspaceError) notFound(); throw error; }
  const { organization,project,role,kind,result } = view;
  const current = `/construction/quality?organization=${organization}&project=${project.id}`;
  const definition = qualityDefinitions[kind];
  const canAuthor = definition.authors.some((author) => author === role);
  const label = new Map<string,string>(definition.fields.map(([key,description]) => [key,description]));
  return <main className="live-shell">
    <a href={`/construction?organization=${organization}&project=${project.id}`}>{project.code} · {project.name}</a>
    <h1>{definition.title}</h1>
    <nav className="workspace-nav" aria-label="Quality registers">
      {Object.entries(qualityDefinitions).map(([slug,entry]) => <a key={slug} href={`${current}&kind=${slug}`}
        aria-current={slug === kind ? "page" : undefined}>{entry.title}</a>)}
    </nav>
    <section className="live-panel">
      <h2>Outstanding reviews and due dates</h2>
      {result.queue.length === 0 ? <p>No submitted or due records are in the current queue.</p> : <ul>{result.queue.map((record) =>
        <li key={record.id}><a href={`${current}&kind=${record.kind}&record=${record.id}#quality-${record.id}`}>{record.reference} · {record.title}</a>
          {record.due_on && ` · Due ${record.due_on}`}</li>)}</ul>}
    </section>
    <section className="live-panel">
      <h2>Register</h2>
      {query.record && <p><a href={`${current}&kind=${kind}`}>Show all records</a></p>}
      {result.entries.length === 0 && <p>No records have been filed in this register.</p>}
      {result.entries.map((record) => <article key={record.id} id={`quality-${record.id}`}>
        <h3>{record.reference} · {record.title}</h3>
        <p>{record.state.replaceAll("_"," ")} · Revision {record.revision}{record.due_on && ` · Due ${record.due_on}`}</p>
        <dl>{Object.entries(record.fields).filter(([, value]) => value).map(([key,value]) =>
          <div key={key}><dt>{label.get(key) ?? computedLabels[key]}</dt><dd>{value}</dd></div>)}</dl>
        {record.document_id && <p><a href={`/construction/documents/${record.document_id}?organization=${organization}&project=${project.id}&revision=${record.document_revision}`}>Download evidence revision</a></p>}
        {kind === "laboratory" && record.fields.strength && <p>Specimen calculation uses failure load in newtons divided by loaded area in mm². Conformity requires a reviewed project basis.</p>}
        {canAuthor && record.author === account.id && ["draft","revision_required"].includes(record.state) &&
          <details><summary>Revise record</summary><QualityForm organization={organization} project={project.id} kind={kind} options={result.options} record={record} /></details>}
        {canReviewQuality(role) && record.author !== account.id && record.state === "submitted" &&
          <WorkspaceForm task="quality" organization={organization} project={project.id} submit="Save review">
            <input type="hidden" name="kind" value={kind} /><input type="hidden" name="record" value={record.id} />
            <input type="hidden" name="revision" value={record.revision} />
            <label>Review decision <select name="operation"><option value={kind === "ncr" ? "close" : "review"}>{kind === "ncr" ? "Verify closure" : "Record review"}</option>
              <option value="return">Return for revision</option></select></label>
            <label>Findings or closure verification <input name="assessment" maxLength={1000} required /></label>
          </WorkspaceForm>}
      </article>)}
      {result.more && <a href={`${current}&kind=${kind}&after=${result.more}`}>More records</a>}
    </section>
    {canAuthor && <section className="live-panel"><h2>File a record</h2>
      <QualityForm organization={organization} project={project.id} kind={kind} options={result.options} />
    </section>}
  </main>;
}
