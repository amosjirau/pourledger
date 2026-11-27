import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentAccount, sessionCookie } from "../../../../lib/professional/accounts.ts";
import { constructionEnabled, constructionPool } from "../../../../lib/professional/database.ts";
import { designRegister, type Element } from "../../../../lib/professional/design.ts";
import { listDocuments } from "../../../../lib/professional/documents.ts";
import { id, WorkspaceError } from "../../../../lib/professional/input.ts";
import { requireMember } from "../../../../lib/professional/projects.ts";
import { formatQuantity, quantity } from "../../../../lib/professional/quantities.ts";
import { installers, movementAuthors, movementKinds, stockRegister } from "../../../../lib/professional/stock.ts";
import { WorkspaceForm } from "../../workspace-form.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title:"Stock reconciliation | PourLedger", robots:{index:false,follow:false} };

export default async function StockPage({ searchParams }: {
  searchParams:Promise<{ organization?:string; project?:string; delivery?:string; after?:string }>;
}) {
  if (!constructionEnabled()) notFound();
  const db = await constructionPool();
  const user = await currentAccount(db,(await cookies()).get(sessionCookie)?.value);
  if (!user) redirect("/construction");
  const query = await searchParams;
  let view;
  try {
    const organization = id(query.organization), project = id(query.project), delivery = id(query.delivery);
    const stock = await stockRegister(db,user.id,organization,project,delivery,query.after ? id(query.after) : undefined);
    const role = await requireMember(db,user.id,organization);
    const elements = movementAuthors.includes(role) ? await designRegister(db,user.id,organization,project,"elements") : undefined;
    const documents = movementAuthors.includes(role) ? await listDocuments(db,user.id,organization,project) : undefined;
    view = { organization,project,delivery,stock,role,elements,documents };
  } catch (error) { if (error instanceof WorkspaceError) notFound(); throw error; }
  const { organization,project,delivery,stock,role,elements,documents } = view;
  const context = `organization=${organization}&project=${project}&delivery=${delivery}`;
  const unit = stock.delivery.unit;
  const balances = [
    ["Received",quantity(stock.delivery.quantity)],["Accepted",stock.accepted],
    ["Rejected",quantity(stock.inspection?.rejected ?? "0",true)],["Quarantined",quantity(stock.inspection?.quarantined ?? "0",true)],
    ["Allocated",stock.allocated],["Recorded installed",stock.installed],["Returned",stock.returned],["Wastage",stock.waste],
    ["Accepted stock on hand",stock.onHand],["Available to allocate",stock.available],
  ] as const;
  return <main className="live-shell">
    <a href={`/construction/receiving?${context}`}>Delivery {stock.delivery.reference}</a>
    <h1>Stock movements and reconciliation</h1>
    <section className="live-panel"><h2>{stock.delivery.material} · {stock.delivery.reference}</h2>
      {!stock.inspection?.accepted && <p>Awaiting a reviewed material decision.</p>}
      <dl>{balances.map(([label,amount]) => <div key={label}><dt>{label}</dt><dd>{formatQuantity(amount)} {unit}</dd></div>)}</dl>
      <p>Accepted on-hand stock includes uninstalled allocations. The warehouse ledger and field evidence are separate from registry assignments.</p>
    </section>
    <section className="live-panel"><h2>Movement history</h2>
      {stock.movements.length === 0 && <p>No stock movements recorded.</p>}
      {stock.movements.map((entry) => <article key={entry.id}>
        <h3>{entry.reference} · {movementKinds[entry.kind]}</h3>
        <p>{formatQuantity(quantity(entry.quantity))} {unit} · {entry.movement_date}{entry.element && ` · ${entry.element}`}</p>
        {entry.work_package && <p>Work package {entry.work_package}</p>}<p>{entry.notes}</p>
      </article>)}
      {stock.more && <a href={`/construction/receiving/stock?${context}&after=${stock.more}`}>More movements</a>}
    </section>
    {movementAuthors.includes(role) && stock.accepted > 0n && <section className="live-panel"><h2>Record a stock movement</h2>
      <WorkspaceForm task="stock" organization={organization} project={project} submit="Record movement">
        <input type="hidden" name="delivery" value={delivery} />
        <label>Movement reference <input name="reference" maxLength={60} required /></label>
        <label>Movement <select name="kind">{Object.entries(movementKinds).filter(([kind]) => kind !== "installed" || installers.includes(role))
          .map(([kind,label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
        <label>Quantity ({unit}) <input name="quantity" inputMode="decimal" required /></label>
        <label>Movement date <input name="date" type="date" required /></label>
        <label>Structural element <select name="element"><option value="">No element</option>
          {(elements?.entries as Element[] | undefined)?.map((element) => <option key={element.id} value={element.id}>
            {element.reference} · {element.kind} · {element.metadata.building || "—"} · {element.metadata.level || "—"}</option>)}</select></label>
        <label>Work package <input name="work_package" maxLength={160} /></label>
        <label>Movement basis <input name="notes" maxLength={800} required /></label>
        <label>Evidence document revision <select name="evidence"><option value="">No document</option>
          {documents?.entries.filter((entry) => !entry.archived_at).map((entry) => <option key={entry.id} value={`${entry.id}:${entry.revision}`}>
            {entry.reference} · Revision {entry.revision}</option>)}</select></label>
      </WorkspaceForm>
    </section>}
  </main>;
}
