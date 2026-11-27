import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { currentAccount, sessionCookie } from "../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../lib/professional/database.ts";
import { type Notice, projectInbox } from "../../lib/professional/inbox.ts";
import { projectFields, projectStatuses, roles, WorkspaceError } from "../../lib/professional/input.ts";
import { managers, membersFor, organizationsFor, type Project, projectHistory, projectsFor, requireProject } from "../../lib/professional/projects.ts";
import { WorkspaceForm } from "./workspace-form.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Construction workspace | PourLedger", robots: { index: false, follow: false } };

const workspace = (organization: string, project?: string) =>
  `/construction?organization=${organization}${project ? `&project=${project}` : ""}`;

function AccountForms() {
  return <div className="workspace-layout">
    <section className="live-panel">
      <h2>Sign in</h2>
      <WorkspaceForm task="login" submit="Sign in">
        <label>Email <input type="email" name="email" autoComplete="username" required /></label>
        <label>Password <input type="password" name="password" autoComplete="current-password" required /></label>
      </WorkspaceForm>
    </section>
    <section className="live-panel">
      <h2>Accept an invitation</h2>
      <WorkspaceForm task="accept-invite" submit="Join organization">
        <label>Invitation code <input name="invitation" maxLength={43} autoComplete="off" required /></label>
        <label>Invited email <input type="email" name="email" autoComplete="email" required /></label>
        <label>Name <input name="person" maxLength={160} autoComplete="name" required /></label>
        <label>Password <input type="password" name="password" minLength={12} autoComplete="new-password" required /></label>
        <p>Use your existing password if you already have an account.</p>
      </WorkspaceForm>
    </section>
  </div>;
}

function ProjectForm({ organization, project }: { organization: string; project?: Project }) {
  return <WorkspaceForm task="project" organization={organization} project={project?.id} submit={project ? "Save revision" : "Create project"}>
    {project && <input type="hidden" name="revision" value={project.revision} />}
    <label>Project reference <input name="code" maxLength={50} defaultValue={project?.code} required /></label>
    <label>Project name <input name="name" maxLength={160} defaultValue={project?.name} required /></label>
    <label>QIE registry project ID (optional) <input name="chain_project_id" inputMode="numeric" pattern="[0-9]+" maxLength={78} defaultValue={project?.chain_project_id ?? ""} /></label>
    <p>The registry reference associates a public project with these private workspace records.</p>
    <label>Status <select name="status" defaultValue={project?.metadata.status ?? "planned"}>
      {projectStatuses.map((status) => <option key={status}>{status}</option>)}
    </select></label>
    {Object.entries(projectFields).map(([key, label]) => <label key={key}>{label}
      <input name={key} type={key === "start" || key === "completion" ? "date" : "text"} maxLength={1000}
        defaultValue={project?.metadata[key as keyof typeof projectFields]} />
    </label>)}
  </WorkspaceForm>;
}

export default async function ConstructionPage({ searchParams }: {
  searchParams: Promise<{ organization?: string; project?: string; after?: string }>;
}) {
  if (!constructionEnabled()) notFound();
  const db = await constructionPool();
  const account = await currentAccount(db, (await cookies()).get(sessionCookie)?.value);
  if (!account) return <main className="live-shell"><a href="/">PourLedger</a><h1>Construction workspace</h1><AccountForms /></main>;
  const query = await searchParams;
  const organizations = await organizationsFor(db, account.id);
  const organization = query.organization ? organizations.find((entry) => entry.id === query.organization) : organizations[0];
  if (!organization) {
    return <main className="live-shell"><a href="/construction">Construction workspace</a><h1>Organization access</h1>
      <p>No organization is available here. An administrator can issue an invitation.</p>
      <WorkspaceForm task="logout" submit="Sign out" />
    </main>;
  }
  const { id: organizationId, role } = organization;
  const after = typeof query.after === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(query.after) ? query.after : undefined;
  const listing = await projectsFor(db, account.id, organizationId, after);
  let project: Project | undefined;
  if (query.project) {
    if (typeof query.project !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(query.project)) notFound();
    try { project = await requireProject(db, account.id, organizationId, query.project); }
    catch (error) { if (error instanceof WorkspaceError) notFound(); throw error; }
  }
  const admin = role === "administrator";
  const manager = managers.some((candidate) => candidate === role);
  const members = admin ? await membersFor(db, account.id, organizationId) : [];
  const history = project ? await projectHistory(db, account.id, organizationId, project.id) : [];
  const notices = project ? await projectInbox(db,account.id,organizationId,project.id) : [];
  return <main className="live-shell">
    <a href="/live">Live registry</a>
    <h1>{organization.name}</h1>
    <p>{account.name} · {roles[role]}</p>
    <p><a href="/construction/calculations">Engineering calculations</a></p>
    {organizations.length > 1 && <nav aria-label="Organizations">
      <ul>{organizations.map((entry) => <li key={entry.id}><a href={workspace(entry.id)}>{entry.name}</a></li>)}</ul>
    </nav>}
    <section className="live-panel">
      <h2>Projects</h2>
      {listing.entries.length ? <ul>{listing.entries.map((entry) =>
        <li key={entry.id}><a href={workspace(organizationId, entry.id)}>{entry.code} · {entry.name}</a></li>)}</ul> : <p>No projects are available to you.</p>}
      {listing.more && <a href={`${workspace(organizationId)}&after=${listing.more}`}>More projects</a>}
    </section>
    {project && <section className="live-panel">
      <h2>{project.code} · {project.name}</h2>
      <p>Workspace information · Revision {project.revision}</p>
      {project.chain_project_id && <p>QIE project reference {project.chain_project_id}</p>}
      <p><a href={`/construction/documents?organization=${organizationId}&project=${project.id}`}>Project documents</a></p>
      <p><a href={`/construction/receiving?organization=${organizationId}&project=${project.id}`}>Material deliveries and inspections</a></p>
      <p><a href={`/construction/design?organization=${organizationId}&project=${project.id}`}>Specifications and structural elements</a></p>
      <p><a href={`/construction/quality?organization=${organizationId}&project=${project.id}`}>Quality registers and due work</a></p>
      <p><a href={`/construction/reports?organization=${organizationId}&project=${project.id}`}>Quality reports and handover</a></p>
      {notices.length > 0 && <><h3>Project inbox</h3><ul>{notices.map((item) => <li key={`${item.source}-${item.target}`}>
        <a href={noticeLink(item,organizationId,project.id)}>{item.reference} · {item.detail}</a>
        {item.due && ` · ${item.due}`}</li>)}</ul></>}
      <dl>{Object.entries(project.metadata).filter(([, value]) => value).map(([key, value]) =>
        <div key={key}><dt>{key === "status" ? "Status" : projectFields[key as keyof typeof projectFields]}</dt><dd>{value}</dd></div>)}</dl>
      {manager && <details><summary>Revise project information</summary><ProjectForm organization={organizationId} project={project} /></details>}
      {admin && members.length > 0 && <details><summary>Grant project access</summary>
        <WorkspaceForm task="add-project-member" organization={organizationId} project={project.id} submit="Grant access">
          <label>Organization member <select name="member" required>{members.map((member) =>
            <option key={member.id} value={member.id}>{member.name} · {roles[member.role]}</option>)}</select></label>
        </WorkspaceForm>
      </details>}
      {admin && members.some((member) => member.role !== "administrator") && <details><summary>Revoke project access</summary>
        <WorkspaceForm task="revoke-project-member" organization={organizationId} project={project.id} submit="Revoke access">
          <label>Organization member <select name="member" required>{members.filter((member) => member.role !== "administrator").map((member) =>
            <option key={member.id} value={member.id}>{member.name} · {roles[member.role]}</option>)}</select></label>
        </WorkspaceForm>
      </details>}
      <h3>Recent activity</h3>
      <ul>{history.map((entry) => <li key={entry.id}>{activity[entry.action] ?? entry.action} · {entry.name}
        {entry.revision ? ` · Revision ${entry.revision}` : ""} · <time dateTime={entry.created_at.toISOString()}>{entry.created_at.toISOString().slice(0, 10)}</time>
      </li>)}</ul>
    </section>}
    {admin && members.some((member) => member.id !== account.id) && <section className="live-panel"><details><summary>Disable organization access</summary>
      <p>This also removes project assignments and invalidates unused invitations for that address.</p>
      <WorkspaceForm task="disable-member" organization={organizationId} submit="Disable access">
        <label>Organization member <select name="member" required>{members.filter((member) => member.id !== account.id).map((member) =>
          <option key={member.id} value={member.id}>{member.name} · {roles[member.role]}</option>)}</select></label>
      </WorkspaceForm>
    </details></section>}
    {manager && <section className="live-panel"><details><summary>Create a project</summary><ProjectForm organization={organizationId} /></details></section>}
    {admin && <section className="live-panel"><h2>Invite a team member</h2>
      <WorkspaceForm task="invite-member" organization={organizationId} submit="Create invitation">
        <label>Work email <input type="email" name="email" maxLength={254} required /></label>
        <label>Role <select name="role" defaultValue="auditor">{Object.entries(roles).map(([value, label]) =>
          <option key={value} value={value}>{label}</option>)}</select></label>
      </WorkspaceForm>
    </section>}
    <WorkspaceForm task="logout" submit="Sign out" />
  </main>;
}

const activity: Record<string,string> = {
  "project.created": "Project created", "project.revised": "Project revised", "project.member_added": "Project access granted",
  "project.member_removed": "Project access revoked",
  "document.added": "Document added", "document.revised": "Document revised", "document.downloaded": "Document downloaded",
  "document.archived": "Document archived",
  "document.integrity_failed": "Stored document integrity check failed",
  "delivery.received": "Delivery recorded", "inspection.draft": "Inspection saved as draft", "inspection.submitted": "Inspection submitted",
  "inspection.under_review": "Inspection review started", "inspection.revision_required": "Inspection revision requested",
  "inspection.accepted": "Inspection accepted", "inspection.partially_accepted": "Inspection partially accepted",
  "inspection.rejected": "Inspection rejected",
  "specification.draft": "Specification revision filed", "specification.approved": "Specification revision approved",
  "specification.withdrawn": "Specification revision withdrawn", "element.created": "Structural element registered",
  "element.revised": "Structural element revised",
};

function noticeLink(notice:Notice, organization:string, project:string) {
  const base=`organization=${organization}&project=${project}`;
  if (notice.source === "inspection") return `/construction/receiving?${base}&delivery=${notice.target}`;
  if (notice.source === "quality") return `/construction/quality?${base}&kind=${notice.target_kind}&record=${notice.target}`;
  return `/construction/documents?${base}&document=${notice.target}`;
}
