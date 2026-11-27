import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentAccount, sessionCookie } from "../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../lib/professional/database.ts";
import { documentEditors, documentKinds, listDocumentRevisions, listDocuments } from "../../../lib/professional/documents.ts";
import { id, revision, type Role, WorkspaceError } from "../../../lib/professional/input.ts";
import { managers, type Project, requireMember, requireProject } from "../../../lib/professional/projects.ts";
import { WorkspaceForm } from "../workspace-form.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project documents | PourLedger", robots: { index: false, follow: false } };

const fileInput = <label>Document file <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg" required /></label>;

export default async function DocumentsPage({ searchParams }: {
  searchParams: Promise<{ organization?: string; project?: string; after?: string; document?: string; before?: string }>;
}) {
  if (!constructionEnabled()) notFound();
  const db = await constructionPool();
  const account = await currentAccount(db, (await cookies()).get(sessionCookie)?.value);
  if (!account) redirect("/construction");
  const query = await searchParams;
  let view: {organization:string;project:Project;role:Role;documents:Awaited<ReturnType<typeof listDocuments>>;
    history?:Awaited<ReturnType<typeof listDocumentRevisions>>;document?:string};
  try {
    const organization = id(query.organization);
    const project = await requireProject(db, account.id, organization, id(query.project));
    const role = await requireMember(db, account.id, organization);
    const documents = await listDocuments(db, account.id, organization, project.id, query.after ? id(query.after) : undefined);
    const document = query.document ? id(query.document) : undefined;
    const history = document ? await listDocumentRevisions(db, account.id, organization, project.id, document,
      query.before ? revision(query.before) : undefined) : undefined;
    view = { organization, project, role, documents, history, document };
  } catch (error) { if (error instanceof WorkspaceError) notFound(); throw error; }
  const { organization, project, role, documents, history, document } = view;
  const permitted = documentEditors.includes(role);
  const location = `organization=${organization}&project=${project.id}`;
  const link = (document: string, version: number) => `/construction/documents/${document}?${location}&revision=${version}`;
  return <main className="live-shell">
    <a href={`/construction?${location}`}>{project.code} · {project.name}</a>
    <h1>Project documents</h1>
    {history && document && <section className="live-panel">
      <h2>Revision history</h2>
      {history.entries.length === 0 && <p>No revisions are visible for this reference.</p>}
      <ul>{history.entries.map((entry) => <li key={entry.revision}>
        <a href={link(document, entry.revision)}>Revision {entry.revision} · {entry.file_name}</a>
        <p className="live-mono">SHA-256 {entry.sha256}</p>
      </li>)}</ul>
      {history.more && <a href={`/construction/documents?${location}&document=${document}&before=${history.more}`}>Older revisions</a>}
    </section>}
    <section className="live-panel">
      <h2>Document register</h2>
      {documents.entries.length === 0 && <p>No documents have been filed for this project.</p>}
      {documents.entries.map((entry) => <article key={entry.id}>
        <h3>{entry.reference} · {entry.title}</h3>
        <p>{documentKinds[entry.kind]} · Revision {entry.revision} · {entry.archived_at ? "Archived" : "Current"}</p>
        <p><a href={link(entry.id, entry.revision)}>Download {entry.file_name}</a> ·{" "}
          <a href={`/construction/documents?${location}&document=${entry.id}`}>Revision history</a></p>
        <details><summary>File digests</summary><p className="live-mono">SHA-256 {entry.sha256}</p><p className="live-mono">Keccak-256 {entry.keccak}</p></details>
        {permitted && !entry.archived_at && <details><summary>Upload revision</summary>
          <WorkspaceForm task="save-document" organization={organization} project={project.id} submit="Save revision">
            <input type="hidden" name="document" value={entry.id} /><input type="hidden" name="revision" value={entry.revision} />{fileInput}
          </WorkspaceForm>
        </details>}
        {managers.some((manager) => manager === role) && !entry.archived_at && <WorkspaceForm task="archive-document"
          organization={organization} project={project.id} submit="Archive document">
          <input type="hidden" name="document" value={entry.id} />
        </WorkspaceForm>}
      </article>)}
      {documents.more && <a href={`/construction/documents?${location}&after=${documents.more}`}>More documents</a>}
    </section>
    {permitted && <section className="live-panel">
      <h2>File a project document</h2>
      <p>PDF, PNG or JPEG, up to 3 MiB. Files are available only to users with project access.</p>
      <WorkspaceForm task="save-document" organization={organization} project={project.id} submit="Save document">
        <label>Document reference <input name="reference" maxLength={60} required /></label>
        <label>Title <input name="title" maxLength={160} required /></label>
        <label>Document type <select name="kind">{Object.entries(documentKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {fileInput}
      </WorkspaceForm>
    </section>}
  </main>;
}
