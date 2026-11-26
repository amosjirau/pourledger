import { cookies } from "next/headers";
import { currentAccount, sessionCookie } from "../../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../../lib/professional/database.ts";
import { downloadDocument } from "../../../../lib/professional/documents.ts";
import { id, revision, WorkspaceError } from "../../../../lib/professional/input.ts";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" };
const missing = () => new Response("Document unavailable.", { status: 404, headers: privateHeaders });

export async function GET(request: Request, context: { params: Promise<{ document: string }> }) {
  if (!constructionEnabled()) return missing();
  try {
    const db = await constructionPool();
    const account = await currentAccount(db, (await cookies()).get(sessionCookie)?.value);
    if (!account) return missing();
    const query = new URL(request.url).searchParams;
    const record = await downloadDocument(db, account.id, id(query.get("organization")), id(query.get("project")),
      id((await context.params).document), revision(query.get("revision")));
    const name = encodeURIComponent(record.file_name).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(new Uint8Array(record.bytes), { headers: { ...privateHeaders, "Content-Type": record.media_type,
      "Content-Disposition": `attachment; filename*=UTF-8''${name}`, "Content-Length": String(record.bytes.length) } });
  } catch (error) {
    if (error instanceof WorkspaceError) return missing();
    console.error("Construction document download failed.");
    return new Response("Document service unavailable.", { status: 503, headers: privateHeaders });
  }
}
