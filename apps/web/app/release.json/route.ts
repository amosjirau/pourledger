import { productionRevision } from "../../lib/release-revision.ts";

export const dynamic = "force-dynamic";

export function GET() {
  const revision = productionRevision(process.env);
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  return revision
    ? Response.json(revision, { headers })
    : new Response(null, { status: 404, headers });
}
