import { cookies } from "next/headers";
import { currentAccount, sessionCookie } from "../../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../../lib/professional/database.ts";
import { deliveryCsv } from "../../../../lib/professional/export.ts";
import { id, text, WorkspaceError } from "../../../../lib/professional/input.ts";
import { requireProject } from "../../../../lib/professional/projects.ts";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response("Register unavailable.", { status: 404, headers });
export async function GET(request: Request) {
  if (!constructionEnabled()) return missing();
  try {
    const db = await constructionPool();
    const account = await currentAccount(db, (await cookies()).get(sessionCookie)?.value);
    if (!account) return missing();
    const params = new URL(request.url).searchParams;
    const organization = id(params.get("organization"));
    const project = id(params.get("project"));
    try { await requireProject(db, account.id, organization, project); }
    catch (error) { if (error instanceof WorkspaceError) return missing(); throw error; }
    const csv = await deliveryCsv(db, account.id, organization, project, text(params.get("search"),"a search term",120,false));
    return new Response(csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pourledger-delivery-register.csv"' } });
  } catch (error) {
    if (error instanceof WorkspaceError) return new Response(error.message, { status: 422, headers });
    console.error("Construction delivery export failed.");
    return new Response("Register temporarily unavailable.", { status: 503, headers });
  }
}
