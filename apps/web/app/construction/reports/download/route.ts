import { cookies } from "next/headers";
import { currentAccount, sessionCookie } from "../../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../../lib/professional/database.ts";
import { id, text, WorkspaceError } from "../../../../lib/professional/input.ts";
import { requireProject } from "../../../../lib/professional/projects.ts";
import { projectReport } from "../../../../lib/professional/report.ts";

const headers = { "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox" };
const missing = () => new Response("Report unavailable.",{ status:404,headers });
export async function GET(request:Request) {
  if (!constructionEnabled()) return missing();
  try {
    const db = await constructionPool();
    const account = await currentAccount(db,(await cookies()).get(sessionCookie)?.value);
    if (!account) return missing();
    const params = new URL(request.url).searchParams;
    const organization = id(params.get("organization")), project = id(params.get("project"));
    try { await requireProject(db,account.id,organization,project); }
    catch (error) { if (error instanceof WorkspaceError) return missing(); throw error; }
    const report = await projectReport(db,account.id,organization,project,params.get("report"),text(params.get("search"),"a reference filter",120,false));
    return new Response(new Uint8Array(report.bytes),{ headers:{ ...headers,"Content-Type":"application/pdf",
      "Content-Disposition":`attachment; filename="pourledger-${report.kind}.pdf"`,"Content-Length":String(report.bytes.length) } });
  } catch (error) {
    if (error instanceof WorkspaceError) return new Response(error.message,{ status:422,headers });
    console.error("Construction PDF report failed.");
    return new Response("Report temporarily unavailable.",{ status:503,headers });
  }
}
