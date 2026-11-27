import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { LiveWallet } from "../../../../components/LiveWallet.tsx";
import { currentAccount, sessionCookie } from "../../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../../lib/professional/database.ts";
import { id, WorkspaceError } from "../../../../lib/professional/input.ts";
import { registryDeclaration } from "../../../../lib/professional/registry-approval.ts";

export const dynamic = "force-dynamic";
export const metadata = { title:"Prepare a registry material declaration | PourLedger",robots:{index:false,follow:false} };

export default async function DeclarationPage({ searchParams }: {
  searchParams:Promise<{ organization?:string;project?:string;delivery?:string }>;
}) {
  if (!constructionEnabled()) notFound();
  const query = await searchParams;
  let organization:string, project:string, delivery:string;
  try { organization=id(query.organization);project=id(query.project);delivery=id(query.delivery); }
  catch (error) { if (error instanceof WorkspaceError) notFound(); throw error; }
  const db=await constructionPool();
  const actor=await currentAccount(db,(await cookies()).get(sessionCookie)?.value);
  if (!actor) redirect("/construction");
  const base=`organization=${organization}&project=${project}&delivery=${delivery}`;
  let declaration:Awaited<ReturnType<typeof registryDeclaration>>;
  try { declaration=await registryDeclaration(db,actor.id,organization,project,delivery); }
  catch (error) {
    const notice=error instanceof WorkspaceError ? error.message : "The requested registry declaration could not be verified.";
    return <main className="live-shell"><a href={`/construction/receiving?${base}`}>Return to the delivery</a>
      <h1>Registry declaration unavailable</h1><p role="status">{notice}</p></main>;
  }
  async function recheck(wallet:string) {
    "use server";
    const db=await constructionPool();
    const actor=await currentAccount(db,(await cookies()).get(sessionCookie)?.value);
    if (!actor) throw new Error("Sign in again and review the delivery.");
    return (await registryDeclaration(db,actor.id,organization,project,delivery,wallet)).intent;
  }
  return <main className="live-shell"><a href={`/construction/receiving?${base}`}>Return to the delivery</a>
    <h1>Review the registry declaration</h1>
    <section className="live-panel">
      <h2>{declaration.delivery.reference} · {declaration.delivery.material}</h2>
      <p>Registry project {declaration.intent.projectId} · {declaration.intent.quantity} {declaration.delivery.unit}</p>
      <p className="live-mono">Delivery digest {declaration.intent.lotHash}</p>
      <p>The connected supplier wallet reviews and submits the declaration. Retain the confirmed lot number for the inspection workflow.</p>
    </section>
    <LiveWallet target={declaration.target} lockedRegistry={{ action:"register",read:recheck }} />
  </main>;
}
