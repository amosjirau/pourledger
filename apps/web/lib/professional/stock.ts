import type { Pool, PoolClient } from "pg";
import { transact } from "./database.ts";
import { calendarDate, id, pick, revision, type Role, text, WorkspaceError } from "./input.ts";
import { managers, requireProject } from "./projects.ts";
import { formatQuantity, quantity } from "./quantities.ts";
import { deliveryInspection } from "./receiving.ts";

export const movementKinds = { allocate:"Allocate to an element", release:"Release uninstalled allocation", installed:"Record installation evidence",
  returned:"Return unallocated accepted stock",waste:"Record unallocated accepted stock wastage" } as const;
type Kind = keyof typeof movementKinds;
export const movementAuthors: readonly Role[] = [...managers,"site_engineer","structural_engineer","quantity_surveyor","storekeeper"];
export const installers: readonly Role[] = ["site_engineer","structural_engineer"];

type StockTotals = { allocated:string; installed:string; returned:string; waste:string; element_allocated:string; element_installed:string };
async function movementTotals(db:Pool|PoolClient, organization:string, project:string, delivery:string, element:string|null = null) {
  const { rows:[value] } = await db.query<StockTotals>(`SELECT
    COALESCE(sum(CASE kind WHEN 'allocate' THEN quantity WHEN 'release' THEN -quantity ELSE 0 END),0)::text AS allocated,
    COALESCE(sum(quantity) FILTER (WHERE kind='installed'),0)::text AS installed,
    COALESCE(sum(quantity) FILTER (WHERE kind='returned'),0)::text AS returned,
    COALESCE(sum(quantity) FILTER (WHERE kind='waste'),0)::text AS waste,
    COALESCE(sum(CASE kind WHEN 'allocate' THEN quantity WHEN 'release' THEN -quantity ELSE 0 END) FILTER(WHERE element_id=$4),0)::text AS element_allocated,
    COALESCE(sum(quantity) FILTER (WHERE kind='installed' AND element_id=$4),0)::text AS element_installed
    FROM construction.stock_movements WHERE organization_id=$1 AND project_id=$2 AND delivery_id=$3`, [organization,project,delivery,element]);
  return value;
}

export async function stockRegister(db:Pool, actor:string, organization:string, project:string, delivery:string, after?:string) {
  const details = await deliveryInspection(db,actor,organization,project,delivery);
  const accepted = quantity(details.inspection?.accepted ?? "0",true);
  const [totals,movements] = await Promise.all([
    movementTotals(db,organization,project,delivery),
    db.query<{id:string;kind:Kind;reference:string;quantity:string;movement_date:string;work_package:string;notes:string;element:string|null}>(`
      SELECT m.id,m.kind,m.reference,m.quantity::text,m.movement_date::text,m.work_package,m.notes,e.reference AS element
      FROM construction.stock_movements m LEFT JOIN construction.elements e
      ON (m.organization_id,m.project_id,m.element_id)=(e.organization_id,e.project_id,e.id)
      WHERE m.organization_id=$1 AND m.project_id=$2 AND m.delivery_id=$3 AND ($4::uuid IS NULL OR m.id>$4) ORDER BY m.id LIMIT 21`,
    [organization,project,delivery,after ?? null]),
  ]);
  const allocated = quantity(totals.allocated,true), installed = quantity(totals.installed,true);
  const returned = quantity(totals.returned,true), waste = quantity(totals.waste,true);
  return { ...details, accepted, allocated, installed, returned,waste, available:accepted-allocated-returned-waste,
    onHand:accepted-installed-returned-waste, movements:movements.rows.slice(0,20),
    more:movements.rows.length > 20 ? movements.rows[19].id : undefined };
}

export async function elementStock(db:Pool, actor:string, organization:string, project:string, element:string) {
  await requireProject(db,actor,organization,project);
  return (await db.query<{ delivery_id:string; reference:string; supplier:string; unit:string; quantity:string }>(`
    SELECT d.id AS delivery_id,d.reference,d.supplier,d.unit,
      sum(CASE m.kind WHEN 'allocate' THEN m.quantity WHEN 'release' THEN -m.quantity ELSE 0 END)::text AS quantity
    FROM construction.stock_movements m JOIN construction.deliveries d
    ON (m.organization_id,m.project_id,m.delivery_id)=(d.organization_id,d.project_id,d.id)
    WHERE m.organization_id=$1 AND m.project_id=$2 AND m.element_id=$3
    GROUP BY d.id HAVING sum(CASE m.kind WHEN 'allocate' THEN m.quantity WHEN 'release' THEN -m.quantity ELSE 0 END)>0
    ORDER BY d.reference,d.id LIMIT 100`, [organization,project,element])).rows;
}

export async function addMovement(db:Pool, actor:string, organization:string, project:string, form:FormData) {
  const delivery = id(form.get("delivery"));
  const kind = pick(form.get("kind"),Object.keys(movementKinds) as Kind[],"stock movement");
  const element = form.get("element") ? id(form.get("element")) : null;
  if (["allocate","release","installed"].includes(kind) !== Boolean(element)) throw new WorkspaceError("Select an element only for allocation, release or installation.");
  const amount = quantity(form.get("quantity"));
  const reference = text(form.get("reference"),"a movement reference",60).toUpperCase();
  const date = calendarDate(text(form.get("date"),"movement date",10),"movement date");
  const work = text(form.get("work_package"),"work package",160,false);
  const notes = text(form.get("notes"),"recorded movement basis",800);
  const proof = form.get("evidence") ? text(form.get("evidence"),"a filed document revision",60).split(":") : null;
  if (proof && proof.length !== 2) throw new WorkspaceError("Select a valid document revision.");
  const document = proof ? id(proof[0]) : null;
  const version = proof ? revision(proof[1]) : null;
  if (kind === "installed" && !document) throw new WorkspaceError("A filed site evidence revision is required for installation.");
  return transact(db,async (tx) => {
    await requireProject(tx,actor,organization,project,kind === "installed" ? installers : movementAuthors);
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,16))", [delivery]);
    const { rowCount } = await tx.query("SELECT id FROM construction.deliveries WHERE organization_id=$1 AND project_id=$2 AND id=$3",
      [organization,project,delivery]);
    if (!rowCount) throw new WorkspaceError("Delivery unavailable.");
    const { rows:[material] } = await tx.query<{accepted:string}>(`SELECT accepted::text FROM construction.inspection_requests
      WHERE organization_id=$1 AND project_id=$2 AND delivery_id=$3 AND status IN ('accepted','partially_accepted')`,[organization,project,delivery]);
    if (!material) throw new WorkspaceError("A reviewed workspace acceptance is required before moving stock.");
    const totals = await movementTotals(tx,organization,project,delivery,element);
    const free = quantity(material.accepted,true) - quantity(totals.allocated,true) - quantity(totals.returned,true) - quantity(totals.waste,true);
    const uninstalled = quantity(totals.element_allocated,true) - quantity(totals.element_installed,true);
    if (amount > (kind === "release" || kind === "installed" ? uninstalled : free)) {
      throw new WorkspaceError("The requested quantity exceeds the eligible stock or uninstalled allocation.");
    }
    const { rows:[record] } = await tx.query<{id:string}>(`INSERT INTO construction.stock_movements
      (organization_id,project_id,delivery_id,element_id,reference,kind,quantity,movement_date,work_package,notes,document_id,document_revision,actor)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [organization,project,delivery,element,reference,kind,formatQuantity(amount),date,work,notes,document,version,actor]);
    await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,payload)
      VALUES ($1,$2,$3,$4,$5,$6)`, [organization,project,actor,record.id,`stock.${kind}`,{ delivery,element,quantity:formatQuantity(amount),document,version }]);
    return record;
  });
}
