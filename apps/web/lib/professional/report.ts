import { readFile } from "node:fs/promises";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { Pool, PoolClient } from "pg";
import { create } from "qrcode";
import { passportPath } from "../chain.ts";
import { demoMainnetRegistry, demoProductionOrigin } from "../demo-run.ts";
import { transact } from "./database.ts";
import { pick, WorkspaceError } from "./input.ts";
import { requireProject } from "./projects.ts";

const reportQueries = {
  deliveries: `SELECT reference,delivery_date::text AS date,material,supplier,delivery_note,line,quantity::text,unit,metadata
    FROM construction.deliveries WHERE organization_id=$1 AND project_id=$2 AND ($3='' OR position(lower($3) in lower(reference))>0)
    ORDER BY delivery_date,reference LIMIT 101`,
  mir: `SELECT i.reference,i.status,i.revision,i.inspection_date::text AS date,d.reference AS delivery,d.unit,
    i.accepted::text,i.rejected::text,i.quarantined::text,i.metadata,a.name AS author,b.name AS reviewer,
    r.keccak AS evidence_digest
    FROM construction.inspection_requests i JOIN construction.deliveries d
      ON (d.organization_id,d.project_id,d.id)=(i.organization_id,i.project_id,i.delivery_id)
    JOIN construction.accounts a ON a.id=i.author LEFT JOIN construction.accounts b ON b.id=i.reviewer
    LEFT JOIN construction.document_revisions r ON
      (r.organization_id,r.project_id,r.document_id,r.revision)=(i.organization_id,i.project_id,i.document_id,i.document_revision)
    WHERE i.organization_id=$1 AND i.project_id=$2 AND ($3='' OR position(lower($3) in lower(i.reference))>0)
    ORDER BY i.reference LIMIT 101`,
  quality: `SELECT q.reference,q.title,q.state,q.revision,q.due_on::text,e.reference AS element,d.reference AS delivery,
    s.reference AS specification,q.fields,a.name AS author,b.name AS reviewer,r.keccak AS evidence_digest
    FROM construction.quality_records q
    JOIN construction.accounts a ON a.id=q.author LEFT JOIN construction.accounts b ON b.id=q.reviewer
    LEFT JOIN construction.elements e ON (e.organization_id,e.project_id,e.id)=(q.organization_id,q.project_id,q.element_id)
    LEFT JOIN construction.deliveries d ON (d.organization_id,d.project_id,d.id)=(q.organization_id,q.project_id,q.delivery_id)
    LEFT JOIN construction.specifications s ON (s.organization_id,s.project_id,s.id)=(q.organization_id,q.project_id,q.specification_id)
    LEFT JOIN construction.document_revisions r ON
      (r.organization_id,r.project_id,r.document_id,r.revision)=(q.organization_id,q.project_id,q.document_id,q.document_revision)
    WHERE q.organization_id=$1 AND q.project_id=$2 AND ($3='' OR position(lower($3) in lower(q.reference))>0)
      AND (($4='concrete' AND q.kind IN ('pour','laboratory')) OR q.kind=$4)
    ORDER BY q.reference LIMIT 101`,
  elements: `SELECT reference,kind,revision,chain_element_id::text,metadata FROM construction.elements
    WHERE organization_id=$1 AND project_id=$2 AND ($3='' OR position(lower($3) in lower(reference))>0)
    ORDER BY reference LIMIT 101`,
  stock: `SELECT m.reference,m.kind,m.movement_date::text AS date,d.reference AS delivery,d.unit,m.quantity::text,
    e.reference AS element,m.work_package,m.notes,a.name AS author
    FROM construction.stock_movements m JOIN construction.accounts a ON a.id=m.actor
    JOIN construction.deliveries d ON (d.organization_id,d.project_id,d.id)=(m.organization_id,m.project_id,m.delivery_id)
    LEFT JOIN construction.elements e ON (e.organization_id,e.project_id,e.id)=(m.organization_id,m.project_id,m.element_id)
    WHERE m.organization_id=$1 AND m.project_id=$2 AND ($3='' OR position(lower($3) in lower(d.reference))>0)
    ORDER BY m.movement_date,m.reference LIMIT 101`,
  reconciliation: `WITH totals AS (
    SELECT delivery_id, COALESCE(sum(CASE kind WHEN 'allocate' THEN quantity WHEN 'release' THEN -quantity ELSE 0 END),0) AS allocated,
      COALESCE(sum(quantity) FILTER (WHERE kind='installed'),0) AS installed,
      COALESCE(sum(quantity) FILTER (WHERE kind='returned'),0) AS returned,
      COALESCE(sum(quantity) FILTER (WHERE kind='waste'),0) AS waste
    FROM construction.stock_movements WHERE organization_id=$1 AND project_id=$2 GROUP BY delivery_id)
    SELECT d.reference,d.quantity AS received,d.unit,i.status AS decision,i.accepted,i.rejected,i.quarantined,
      COALESCE(t.allocated,0) AS allocated,COALESCE(t.installed,0) AS installed,COALESCE(t.returned,0) AS returned,COALESCE(t.waste,0) AS wastage,
      COALESCE(i.accepted,0)-COALESCE(t.allocated,0)-COALESCE(t.returned,0)-COALESCE(t.waste,0) AS available_to_allocate
    FROM construction.deliveries d LEFT JOIN construction.inspection_requests i
      ON (i.organization_id,i.project_id,i.delivery_id)=(d.organization_id,d.project_id,d.id)
    LEFT JOIN totals t ON t.delivery_id=d.id WHERE d.organization_id=$1 AND d.project_id=$2
      AND ($3='' OR position(lower($3) in lower(d.reference))>0) ORDER BY d.reference LIMIT 101`,
  summary: `SELECT 'Material deliveries' AS record_type,count(*)::text AS total FROM construction.deliveries WHERE organization_id=$1 AND project_id=$2
    UNION ALL SELECT 'Structural elements',count(*)::text FROM construction.elements WHERE organization_id=$1 AND project_id=$2
    UNION ALL SELECT 'Current documents',count(*)::text FROM construction.documents WHERE organization_id=$1 AND project_id=$2 AND archived_at IS NULL
    UNION ALL SELECT 'Specifications approved',count(*)::text FROM construction.specifications WHERE organization_id=$1 AND project_id=$2 AND state='approved'
    UNION ALL SELECT 'Quality records · '||kind||' · '||state,count(*)::text FROM construction.quality_records
      WHERE organization_id=$1 AND project_id=$2 GROUP BY kind,state`,
  evidence: `SELECT d.reference,d.title,d.kind,d.revision,
    CASE WHEN d.archived_at IS NULL THEN 'current' ELSE 'archived' END AS state,r.file_name,r.sha256,r.keccak
    FROM construction.documents d JOIN construction.document_revisions r
      ON (r.organization_id,r.project_id,r.document_id,r.revision)=(d.organization_id,d.project_id,d.id,d.revision)
    WHERE d.organization_id=$1 AND d.project_id=$2 AND ($3='' OR position(lower($3) in lower(d.reference))>0)
    ORDER BY d.reference LIMIT 101`,
} as const;

export const reports = {
  summary:"Project quality summary",deliveries:"Material delivery register",mir:"Material inspection requests",itp:"Inspection and test plans",
  wir:"Work inspection requests",ncr:"Nonconformance reports",reinforcement:"Reinforcement inspection register",concrete:"Concrete pour and test register",
  laboratory:"Laboratory test register",stock:"Material utilization register",reconciliation:"Material reconciliation",elements:"Structural element traceability",
  handover:"Quality handover dossier",
} as const;
type ReportKind = keyof typeof reports;
const qualityKinds = ["itp","wir","ncr","reinforcement","concrete","laboratory"] as const;
const dossier = ["summary","reconciliation","mir","elements",...qualityKinds,"evidence"] as const;
type SectionKind = typeof dossier[number] | "deliveries" | "stock";
type Rows = Record<string,unknown>[];
const labels:Record<string,string> = { evidence_digest:"Evidence digest (Keccak-256)", keccak:"Keccak-256", sha256:"SHA-256",
  chain_element_id:"Verified registry element reference", mir:"MIR", itp:"ITP", wir:"WIR", ncr:"NCR", due_on:"Due date" };
const label = (key:string) => labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replaceAll("_"," ");
const font = () => readFile(join(process.cwd(),"professional","fonts","DejaVuSans.ttf"))
  .catch(() => readFile(join(process.cwd(),"apps","web","professional","fonts","DejaVuSans.ttf")));

async function readSection(db:PoolClient, organization:string, project:string, kind:SectionKind, filter:string) {
  const quality = qualityKinds.some((type) => kind === type);
  const sql = quality ? reportQueries.quality : reportQueries[kind as Exclude<keyof typeof reportQueries,"quality">];
  const values = kind === "summary" ? [organization,project] : [organization,project,filter,...(quality ? [kind] : [])];
  const { rows } = await db.query(sql,values);
  if (rows.length > 100) throw new WorkspaceError("A report section exceeds 100 records. Select a project reference filter or export a smaller register.");
  return rows;
}

export async function projectReport(db:Pool, actor:string, organization:string, projectId:string, requested:unknown, filter:string) {
  const kind = pick(requested,Object.keys(reports) as ReportKind[],"report type");
  const sections:readonly SectionKind[] = kind === "handover" ? dossier : [kind];
  const { project, contents } = await transact(db,async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const project = await requireProject(tx,actor,organization,projectId);
    const contents:{ heading:string; rows:Rows }[] = [];
    let size = 0;
    for (const section of sections) {
      const rows = await readSection(tx,organization,projectId,section,filter);
      size += JSON.stringify(rows).length;
      if (size > 600_000) throw new WorkspaceError("Use a narrower filter to generate a smaller document.");
      contents.push({ heading:section === "evidence" ? "Current document revisions" : reports[section],rows });
    }
    return { project,contents };
  });
  const result = await renderReport(reports[kind],project.code,project.name,project.revision,project.chain_project_id,filter,contents);
  return { kind, bytes:result };
}

async function renderReport(title:string, code:string, project:string, revision:number, chain:string|null, filter:string,
  sections:{ heading:string; rows:Rows }[]) {
  const typeface = await font();
  return new Promise<Buffer>((resolve,reject) => {
    const pdf = new PDFDocument({ size:"A4", margin:52,bufferPages:true,info:{ Title:title, Subject:code, Creator:"PourLedger" } });
    const chunks:Buffer[] = [];
    pdf.on("data",(chunk:Buffer) => { chunks.push(chunk); });
    pdf.on("end",() => resolve(Buffer.concat(chunks)));
    pdf.on("error",reject);
    pdf.font(typeface).fillColor("#15392b").fontSize(10).text("POURLEDGER    /    PROJECT QUALITY RECORDS");
    pdf.moveDown(1.1).fontSize(24).text(title).moveDown(0.45);
    pdf.fillColor("#16221a").fontSize(12).text(`${code} · ${project}`);
    pdf.fontSize(9).text(`Project revision ${revision}    |    Issued ${new Date().toISOString().slice(0,10)} UTC`);
    if (chain) pdf.text(`QIE registry project reference: ${chain}`);
    if (filter) pdf.text(`Record reference filter: ${filter}`);
    pdf.text("Provenance: private construction workspace records. Review states are shown with each entry.").moveDown();
    const emit = (key:string,value:unknown) => {
      if (value === null || value === undefined || value === "") return;
      if (typeof value === "object") {
        for (const [name, field] of Object.entries(value)) emit(name,field);
      } else {
        pdf.fontSize(9).fillColor("#23342b").text(`${label(key)}: ${String(value)}`,{ lineGap:1 });
      }
    };
    const passport = (value:unknown) => {
      if (typeof value !== "string" || !/^[1-9]\d{0,77}$/.test(value)) return;
      const url = demoProductionOrigin + passportPath({ chainId:1990,registry:demoMainnetRegistry,kind:"element",id:BigInt(value) });
      if (pdf.y > 690) pdf.addPage();
      pdf.moveDown(0.4).fontSize(9).fillColor("#174839").text("Canonical public element passport",{ link:url,underline:true });
      const { modules } = create(url,{ errorCorrectionLevel:"M" });
      const unit = 78/(modules.size+8);
      const x = 52, y = pdf.y + 5;
      pdf.rect(x,y,78,78).fill("#ffffff");
      for (let row=0; row<modules.size; row++) for (let column=0; column<modules.size; column++) {
        if (modules.get(row,column)) pdf.rect(x+(column+4)*unit,y+(row+4)*unit,unit,unit).fill("#000000");
      }
      pdf.y = y + 84;
    };
    for (const section of sections) {
      if (pdf.y > 656) pdf.addPage();
      pdf.moveDown().fontSize(16).fillColor("#15392b").text(section.heading).moveDown(0.4);
      if (section.rows.length === 0) pdf.fontSize(9).fillColor("#34453b").text("No records in this section.");
      for (const row of section.rows) {
        if (pdf.y > 707) pdf.addPage();
        const reference = typeof row.reference === "string" ? row.reference : null;
        if (reference) pdf.fontSize(12).fillColor("#193c2e").text(reference);
        for (const [key,value] of Object.entries(row)) if (key !== "reference") emit(key,value);
        passport(row.chain_element_id);
        pdf.moveDown(0.65);
      }
    }
    const pages = pdf.bufferedPageRange();
    for (let index=0; index<pages.count; index++) {
      pdf.switchToPage(index);
      const bottom = pdf.page.margins.bottom;
      pdf.page.margins.bottom=20;
      pdf.fontSize(8).fillColor("#46574d").text(`PourLedger    ·    ${code}                                      ${index+1} / ${pages.count}`,
        52,pdf.page.height-35,{ width:491,align:"right",lineBreak:false });
      pdf.page.margins.bottom=bottom;
    }
    pdf.end();
  });
}
