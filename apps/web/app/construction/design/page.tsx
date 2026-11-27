import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { passportPath } from "../../../lib/chain.ts";
import { demoMainnetRegistry, demoProductionOrigin } from "../../../lib/demo-run.ts";
import { currentAccount, sessionCookie } from "../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../lib/professional/database.ts";
import { designAuthors, designRegister, designReviewers, type Element, elementFields, elementKinds, elementStates,
  type Specification, specificationClasses, specificationFields } from "../../../lib/professional/design.ts";
import { id, type Role, WorkspaceError } from "../../../lib/professional/input.ts";
import { type Project, requireMember, requireProject } from "../../../lib/professional/projects.ts";
import { elementStock } from "../../../lib/professional/stock.ts";
import { formatQuantity, quantity } from "../../../lib/professional/quantities.ts";
import { WorkspaceForm } from "../workspace-form.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project specifications and elements | PourLedger", robots: { index: false, follow: false } };

function ElementForm({ organization, project, element }: { organization: string; project: string; element?: Element }) {
  return <WorkspaceForm task="element" organization={organization} project={project} submit={element ? "Save element revision" : "Register element"}>
    {element && <><input type="hidden" name="element" value={element.id} /><input type="hidden" name="element_revision" value={element.revision} /></>}
    <label>Element reference <input name="reference" maxLength={50} defaultValue={element?.reference} required /></label>
    <label>Type <select name="kind" defaultValue={element?.kind}>{Object.keys(elementKinds).map((kind) => <option key={kind}>{kind}</option>)}</select></label>
    <label>Construction status <select name="status" defaultValue={element?.metadata.status}>{elementStates.map((state) => <option key={state}>{state}</option>)}</select></label>
    {Object.entries(elementFields).map(([key,label]) =>
      <label key={key}>{label}<input name={key} maxLength={800} defaultValue={element?.metadata[key]} required={["drawing","revision"].includes(key)} /></label>)}
    <label>Confirmed registry element ID (optional) <input name="chain_element" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={78} defaultValue={element?.chain_element_id ?? ""} /></label>
  </WorkspaceForm>;
}

export default async function DesignPage({ searchParams }: {
  searchParams: Promise<{ organization?: string; project?: string; register?: string; after?: string; element?:string }>;
}) {
  if (!constructionEnabled()) notFound();
  const db = await constructionPool();
  const account = await currentAccount(db, (await cookies()).get(sessionCookie)?.value);
  if (!account) redirect("/construction");
  const query = await searchParams;
  const register = query.register === "elements" ? "elements" : "specifications";
  let view: {organization:string;project:Project;role:Role;list:Awaited<ReturnType<typeof designRegister>>;
    traced?:Awaited<ReturnType<typeof elementStock>>};
  try {
    const organization = id(query.organization);
    const project = await requireProject(db, account.id, organization, id(query.project));
    const role = await requireMember(db, account.id, organization);
    const list = await designRegister(db, account.id, organization, project.id, register, query.after ? id(query.after) : undefined);
    const traced = query.element && register === "elements" ? await elementStock(db,account.id,organization,project.id,id(query.element)) : undefined;
    view = { organization, project, role, list, traced };
  } catch (error) { if (error instanceof WorkspaceError) notFound(); throw error; }
  const { organization, project, role, list, traced } = view;
  const context = `organization=${organization}&project=${project.id}`;
  const current = `/construction/design?${context}&register=${register}`;
  return <main className="live-shell">
    <a href={`/construction?${context}`}>{project.code} · {project.name}</a>
    <h1>{register === "elements" ? "Structural elements" : "Project specifications"}</h1>
    <nav className="workspace-nav" aria-label="Design registers">
      <a href={`/construction/design?${context}&register=specifications`}>Specifications</a>
      <a href={`/construction/design?${context}&register=elements`}>Structural elements</a>
    </nav>
    {traced && <section className="live-panel"><h2>Allocated deliveries</h2>
      {traced.length === 0 && <p>No warehouse allocations were recorded for this element.</p>}
      <ul>{traced.map((entry) => <li key={entry.delivery_id}>
        <a href={`/construction/receiving?${context}&delivery=${entry.delivery_id}`}>{entry.reference} · {entry.supplier}</a>
        {" · "}{formatQuantity(quantity(entry.quantity))} {entry.unit}</li>)}</ul>
    </section>}
    <section className="live-panel">
      <h2>{register === "elements" ? "Element register" : "Specification register"}</h2>
      {list.entries.length === 0 && <p>No records have been filed in this register.</p>}
      {register === "specifications" ? (list.entries as Specification[]).map((entry) => <article key={entry.id}>
        <h3>{entry.reference} · {entry.title}</h3>
        <p>{entry.classification} · {entry.edition} · Project revision {entry.project_revision} · {entry.state}</p>
        <p><a href={entry.publisher_url} rel="noreferrer">Source reference</a></p>
        <dl>{Object.entries(entry.criteria).filter(([,value]) => value).map(([key,value]) =>
          <div key={key}><dt>{specificationFields[key as keyof typeof specificationFields]}</dt><dd>{value}</dd></div>)}</dl>
        {designReviewers.includes(role) && entry.author !== account.id && entry.state !== "withdrawn" &&
          <WorkspaceForm task="review-specification" organization={organization} project={project.id} submit="Record review">
            <input type="hidden" name="specification" value={entry.id} />
            <label>Decision <select name="decision">{entry.state === "draft" && <option value="approved">Approve for project use</option>}<option value="withdrawn">Withdraw</option></select></label>
            <label>Review basis <input name="basis" maxLength={800} required /></label>
          </WorkspaceForm>}
      </article>) : (list.entries as Element[]).map((entry) => <article key={entry.id}>
        <h3>{entry.reference} · {entry.kind}</h3>
        <p>{entry.metadata.status} · Revision {entry.revision}</p>
        <dl>{Object.entries(entry.metadata).filter(([key,value]) => key !== "status" && value).map(([key,value]) =>
          <div key={key}><dt>{elementFields[key as keyof typeof elementFields]}</dt><dd>{value}</dd></div>)}</dl>
        {entry.chain_element_id && <p><a href={demoProductionOrigin + passportPath({ chainId: 1990, registry: demoMainnetRegistry,
          kind: "element", id: BigInt(entry.chain_element_id) })}>Open confirmed registry passport</a></p>}
        <p><a href={`${current}&element=${entry.id}`}>Trace allocated deliveries</a></p>
        {designAuthors.includes(role) && <details><summary>Revise element</summary><ElementForm organization={organization} project={project.id} element={entry} /></details>}
      </article>)}
      {list.more && <a href={`${current}&after=${list.more}`}>More records</a>}
    </section>
    {designAuthors.includes(role) && <section className="live-panel">
      <h2>{register === "specifications" ? "File a specification revision" : "Register a structural element"}</h2>
      {register === "elements" ? <ElementForm organization={organization} project={project.id} /> :
        <WorkspaceForm task="specification" organization={organization} project={project.id} submit="Save draft revision">
          <label>Reference <input name="reference" maxLength={80} required /></label>
          <label>Title <input name="title" maxLength={200} required /></label>
          <label>Edition and amendments <input name="edition" maxLength={100} required /></label>
          <label>Project revision <input name="project_revision" maxLength={25} required /></label>
          <label>Classification <select name="classification">{specificationClasses.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Publisher or controlled document URL <input type="url" name="publisher" maxLength={700} required /></label>
          {Object.entries(specificationFields).map(([key,label]) =>
            <label key={key}>{label}<input name={key} maxLength={800} required={["criteria","authority","applicability"].includes(key)} /></label>)}
        </WorkspaceForm>}
    </section>}
  </main>;
}
