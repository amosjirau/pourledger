import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DemoOperator } from "../../../components/DemoOperator";
import { demoConfiguration, isOperatorHost } from "../../../lib/demo-verify.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "PourLedger · Synthetic demonstration operator", robots: { index: false, follow: false } };

export default async function OperatorPage() {
  if (!isOperatorHost(await headers())) notFound();
  try {
    return <DemoOperator target={demoConfiguration().target} />;
  } catch {
    notFound();
  }
}
