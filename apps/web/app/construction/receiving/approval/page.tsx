import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { LiveWallet } from "../../../../components/LiveWallet.tsx";
import { currentAccount, sessionCookie } from "../../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../../lib/professional/database.ts";
import { id, text, WorkspaceError } from "../../../../lib/professional/input.ts";
import { registryApproval } from "../../../../lib/professional/registry-approval.ts";

export const dynamic = "force-dynamic";
export const metadata = { title:"Prepare a registry inspection decision | PourLedger",robots:{index:false,follow:false} };

export default async function ApprovalPage({ searchParams }: {
  searchParams:Promise<{ organization?:string;project?:string;delivery?:string;lot?:string }>;
}) {
  if (!constructionEnabled()) notFound();
  const query = await searchParams;
  let organization:string, project:string, delivery:string, lot:string;
  try {
    organization=id(query.organization); project=id(query.project); delivery=id(query.delivery);
    lot=text(query.lot,"a registry lot ID",78);
    if (!/^[1-9]\d*$/.test(lot)) notFound();
  } catch (error) { if (error instanceof WorkspaceError) notFound(); throw error; }
  const db=await constructionPool();
  const actor=await currentAccount(db,(await cookies()).get(sessionCookie)?.value);
  if (!actor) redirect("/construction");
  const base=`organization=${organization}&project=${project}&delivery=${delivery}`;
  let review:Awaited<ReturnType<typeof registryApproval>>;
  try { review=await registryApproval(db,actor.id,organization,project,delivery,lot); }
  catch (error) {
    const notice=error instanceof WorkspaceError ? error.message : "The reviewed decision or registry lot could not be verified.";
    return <main className="live-shell"><a href={`/construction/receiving?${base}`}>Return to the delivery</a>
      <h1>Registry decision unavailable</h1><p role="status">{notice}</p></main>;
  }
  async function recheck() {
    "use server";
    const db=await constructionPool();
    const actor=await currentAccount(db,(await cookies()).get(sessionCookie)?.value);
    if (!actor) throw new Error("Sign in again and review the inspection.");
    return (await registryApproval(db,actor.id,organization,project,delivery,lot)).intent;
  }
  return <main className="live-shell"><a href={`/construction/receiving?${base}`}>Return to the delivery</a>
    <h1>Review the registry decision</h1>
    <section className="live-panel">
      <h2>Inspection {review.reference} · Lot {review.intent.lotId}</h2>
      <p>{review.intent.decision === "2" ? "Accept in full" : review.intent.decision === "3" ? "Partially accept" : "Reject"} · {review.intent.quantity} {review.unit} accepted</p>
      <p className="live-mono">Evidence digest {review.intent.conditionHash}</p>
      <p><a href={`/construction/documents/${review.document}?organization=${organization}&project=${project}&revision=${review.documentRevision}`}>Download the locked evidence revision</a></p>
      <p>The designated inspector confirms the signature and transaction in the connected wallet. A confirmed registry decision is terminal.</p>
    </section>
    <LiveWallet target={review.target} lockedRegistry={{ action:"decision",read:recheck }} />
  </main>;
}
