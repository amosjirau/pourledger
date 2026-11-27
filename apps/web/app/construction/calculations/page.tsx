import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentAccount, sessionCookie } from "../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../lib/professional/database.ts";
import { Calculator } from "./calculator.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title:"Engineering calculations | PourLedger",robots:{index:false,follow:false} };
export default async function CalculationsPage() {
  if (!constructionEnabled()) notFound();
  if (!await currentAccount(await constructionPool(),(await cookies()).get(sessionCookie)?.value)) redirect("/construction");
  return <main className="live-shell"><a href="/construction">Construction workspace</a><h1>Engineering calculations</h1><Calculator /></main>;
}
