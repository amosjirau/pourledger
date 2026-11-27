import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentAccount, sessionCookie } from "../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../lib/professional/database.ts";
import { id, WorkspaceError } from "../../../lib/professional/input.ts";
import { type Project, requireProject } from "../../../lib/professional/projects.ts";
import { reports } from "../../../lib/professional/report.ts";

export const dynamic = "force-dynamic";
export const metadata = { title:"Quality reports and handover | PourLedger",robots:{index:false,follow:false} };
export default async function ReportsPage({ searchParams }: { searchParams:Promise<{ organization?:string; project?:string }> }) {
  if (!constructionEnabled()) notFound();
  const db = await constructionPool();
  const account = await currentAccount(db,(await cookies()).get(sessionCookie)?.value);
  if (!account) redirect("/construction");
  const params = await searchParams;
  let organization:string, project:Project;
  try { organization=id(params.organization); project=await requireProject(db,account.id,organization,id(params.project)); }
  catch (error) { if (error instanceof WorkspaceError) notFound(); throw error; }
  const context = `organization=${organization}&project=${project.id}`;
  return <main className="live-shell">
    <a href={`/construction?${context}`}>{project.code} · {project.name}</a>
    <h1>Quality reports and handover</h1>
    <section className="live-panel">
      <h2>Download a project PDF</h2>
      <form action="/construction/reports/download">
        <input type="hidden" name="organization" value={organization} /><input type="hidden" name="project" value={project.id} />
        <label>Report <select name="report">{Object.entries(reports).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Record reference filter <input name="search" maxLength={120} /></label>
        <button type="submit">Download PDF</button>
      </form>
      <p>Reports include record status and revision where available. Use a reference filter for larger registers.</p>
      <p><a href={`/construction/receiving/export?${context}`}>Download material delivery CSV</a></p>
    </section>
  </main>;
}
