import type { Pool } from "pg";
import { transact } from "./database.ts";
import { dateAfter, specimenStrength } from "./engineering.ts";
import { calendarDate, id, pick, revision, text, type Role, WorkspaceError } from "./input.ts";
import { managers, requireProject } from "./projects.ts";
import { formatQuantity, quantity } from "./quantities.ts";

const standardAuthors = [...managers, "site_engineer", "structural_engineer", "consultant", "inspector"] as const;
const reviewers = ["structural_engineer","consultant","inspector"] as const;
export const itpActivities = ["Reinforcement deliveries","Reinforcement fixing","Formwork","Concrete placement","Curing","Concrete testing","Foundation works","Other activity"] as const;
type Field = readonly [name: string, label: string, type?: "date" | "decimal" | "whole", required?: boolean];
type QualityDefinition = { title: string; authors: readonly Role[]; fields: readonly Field[]; links: readonly ("element" | "specification" | "delivery" | "related")[] };
export const qualityDefinitions = {
  itp: { title:"Inspection and test plans", authors:standardAuthors, links:["specification"],fields:[
    ["activity","Activity or template",undefined,true],["work_package","Work package",undefined,true],["stage","Inspection stage",undefined,true],
    ["test","Inspection or test requirement",undefined,true],["frequency","Frequency",undefined,true],["criteria","Project acceptance criteria",undefined,true],
    ["party","Responsible party",undefined,true],["control","Inspection point",undefined,true],["evidence","Required records",undefined,true],
  ] },
  wir: { title:"Work inspection requests", authors:standardAuthors, links:["element","specification"],fields:[
    ["location","Inspection location",undefined,true],["drawing","Drawing reference",undefined,true],["drawing_revision","Drawing revision",undefined,true],
    ["stage","Inspection stage",undefined,true],["requested","Requested date","date",true],["actual","Actual inspection date","date"],
    ["reinforcement","Bar diameter, spacing, cover, anchorage and laps"],["formwork","Formwork and dimensions"],
    ["surface","Cleanliness, embedded services and joints"],["observations","Check results and observations",undefined,true],["nonconformance","Nonconformances"],
  ] },
  ncr: { title:"Nonconformance reports", authors:standardAuthors, links:["element","specification","related","delivery"],fields:[
    ["description","Nonconformance",undefined,true],["requirement","Applicable requirement",undefined,true],
    ["severity","Project severity classification",undefined,true],["responsible","Responsible organization",undefined,true],
    ["containment","Immediate containment",undefined,true],["root_cause","Root cause"],["action","Proposed corrective action",undefined,true],
    ["target","Target completion date","date",true],["verification","Corrective-action verification"],
  ] },
  pour: { title:"Concrete pours", authors:standardAuthors, links:["element","specification","delivery"],fields:[
    ["mix","Mix designation and mix reference",undefined,true],["class","Specified strength class",undefined,true],
    ["supplier","Supplier",undefined,true],["batch","Batch number",undefined,true],["ticket","Delivery ticket",undefined,true],["date","Pour date","date",true],
    ["volume","Concrete volume (m³)","decimal",true],["slump","Slump result (mm)","decimal"],["criteria","Approved slump criteria"],
  ] },
  laboratory: { title:"Samples and laboratory tests", authors:[...standardAuthors,"laboratory"] as const, links:["element","delivery","related"],fields:[
    ["collection","Sample collection date","date",true],["sample","Sample or specimen ID",undefined,true],["location","Sampling location",undefined,true],
    ["collector","Collected by",undefined,true],["custody","Chain of custody",undefined,true],["laboratory","Laboratory",undefined,true],
    ["accreditation","Accreditation reference supplied by laboratory"],["method","Test method and edition",undefined,true],["curing","Curing conditions"],
    ["age","Scheduled test age (days)","whole"],["tested","Test date","date"],["result","Reported result"],
    ["shape","Specimen shape"],["breadth","Loaded face breadth or diameter (mm)","decimal"],["width","Second loaded face dimension (mm)","decimal"],
    ["load","Failure load (kN)","decimal"],["certificate","Certificate reference"],
  ] },
  reinforcement: { title:"Reinforcement inspections", authors:standardAuthors, links:["delivery","element","specification"],fields:[
    ["manufacturer","Manufacturer",undefined,true],["heat","Heat or batch number",undefined,true],["diameter","Nominal diameter (mm)","decimal",true],
    ["grade","Steel grade",undefined,true],["quantity","Measured or declared quantity and unit",undefined,true],["surface","Surface condition",undefined,true],
    ["marks","Identification markings"],["yield","Yield strength (MPa)","decimal"],["ultimate","Ultimate tensile strength (MPa)","decimal"],
    ["elongation","Elongation (%)","decimal"],["bend","Bend or rebend test reference"],["schedule","Bar bending schedule and revision"],
  ] },
} satisfies Record<string,QualityDefinition>;
export type QualityKind = keyof typeof qualityDefinitions;
export type QualityRecord = {
  id:string; reference:string; title:string; kind:QualityKind; state:string; revision:number; fields:Record<string,string>; due_on:string|null;
  element_id:string|null; delivery_id:string|null; specification_id:string|null; related_id:string|null;
  document_id:string|null; document_revision:number|null; author:string; reviewer:string|null;
};
const states = ["draft","submit","review","return","close"] as const;
const selection = (form:FormData, field:string) => form.get(field) ? id(form.get(field)) : null;
export const qualityKind = (value: unknown) => pick(value, Object.keys(qualityDefinitions) as QualityKind[], "quality register");
export const canReviewQuality = (role:Role) => reviewers.some((candidate) => candidate === role);

export function validateQualityFields(kind:QualityKind, form:FormData, submit:boolean) {
  const config:QualityDefinition = qualityDefinitions[kind];
  const fields:Record<string,string> = {};
  for (const [name,label,type,required] of config.fields) {
    let value = text(form.get(name),label,900,Boolean(submit && required));
    if (value && type === "date") value = calendarDate(value,label);
    if (value && type === "decimal") value = formatQuantity(quantity(value,name === "slump" || name === "elongation"));
    if (value && type === "whole" && !/^[1-9]\d{0,2}$/.test(value)) throw new WorkspaceError(`Enter a whole number for ${label.toLowerCase()}.`);
    fields[name] = value;
  }
  let due = fields.target || fields.requested || null;
  if (kind === "itp" && fields.control) pick(fields.control,["Hold","Witness","Review","Surveillance"] as const,"inspection point");
  if (kind === "itp" && fields.activity) pick(fields.activity,itpActivities,"activity template");
  if (kind === "laboratory") {
    if (fields.age && fields.collection) due = dateAfter(fields.collection,Number(fields.age));
    if (fields.tested && fields.collection && fields.tested < fields.collection) throw new WorkspaceError("The test date precedes sample collection.");
    if (fields.shape) pick(fields.shape,["cube","cylinder"] as const,"specimen shape");
    if (fields.load) {
      const shape = pick(fields.shape,["cube","cylinder"] as const,"specimen shape");
      if (!fields.breadth || !fields.tested) throw new WorkspaceError("A failure load requires loaded dimensions and the actual test date.");
      const result = specimenStrength(Number(fields.load),shape,Number(fields.breadth),fields.width ? Number(fields.width) : undefined);
      fields.loaded_area = result.areaMm2.toFixed(2);
      fields.strength = result.strengthMpa.toFixed(3);
    }
  }
  return { fields,due };
}

export async function qualityPage(db:Pool, actor:string, organization:string, project:string, kind:QualityKind, after?:string, selected?:string) {
  await requireProject(db,actor,organization,project);
  const [register,options,queue] = await Promise.all([
    db.query<QualityRecord>(`SELECT *,due_on::text AS due_on FROM construction.quality_records
      WHERE organization_id=$1 AND project_id=$2 AND kind=$3 AND ($4::uuid IS NULL OR id>$4) AND ($5::uuid IS NULL OR id=$5)
      ORDER BY id LIMIT 21`, [organization,project,kind,after ?? null,selected ?? null]),
    db.query<{ kind:string; id:string; label:string; revision?:number }>(`
      (SELECT 'element' kind,id,reference||' · '||kind label,NULL::integer revision FROM construction.elements WHERE organization_id=$1 AND project_id=$2 ORDER BY reference LIMIT 100)
      UNION ALL (SELECT 'delivery',id,reference||' · '||material,NULL FROM construction.deliveries WHERE organization_id=$1 AND project_id=$2 ORDER BY reference LIMIT 100)
      UNION ALL (SELECT 'specification',id,reference||' · '||project_revision,NULL FROM construction.specifications WHERE organization_id=$1 AND project_id=$2 AND state='approved' ORDER BY reference LIMIT 100)
      UNION ALL (SELECT 'related',id,reference||' · '||title,NULL FROM construction.quality_records WHERE organization_id=$1 AND project_id=$2 ORDER BY reference LIMIT 100)
      UNION ALL (SELECT 'document',id,reference||' · '||title,revision FROM construction.documents WHERE organization_id=$1 AND project_id=$2 AND archived_at IS NULL ORDER BY reference LIMIT 100)`,
    [organization,project]),
    db.query<Pick<QualityRecord,"id"|"reference"|"title"|"kind"|"state"|"due_on">>(`SELECT id,reference,title,kind,state,due_on::text
      FROM construction.quality_records WHERE organization_id=$1 AND project_id=$2 AND state NOT IN ('reviewed','closed')
      AND (state='submitted' OR (due_on IS NOT NULL AND due_on<=CURRENT_DATE+7))
      ORDER BY due_on NULLS LAST,id LIMIT 20`, [organization,project]),
  ]);
  return { entries:register.rows.slice(0,20), more:register.rows.length > 20 ? register.rows[19].id : undefined, options:options.rows, queue:queue.rows };
}

export async function saveQualityRecord(db:Pool, actor:string, organization:string, project:string, form:FormData) {
  const kind = qualityKind(form.get("kind"));
  const config:QualityDefinition = qualityDefinitions[kind];
  const action = pick(form.get("operation"),states,"quality record action");
  const recordId = selection(form,"record");
  const review = ["review","return","close"].includes(action);
  return transact(db,async (tx) => {
    await requireProject(tx,actor,organization,project,review ? reviewers : config.authors);
    const { rows:[existing] } = recordId ? await tx.query<QualityRecord>(`SELECT * FROM construction.quality_records
      WHERE organization_id=$1 AND project_id=$2 AND kind=$3 AND id=$4 FOR UPDATE`, [organization,project,kind,recordId]) : { rows:[] };
    if ((recordId && !existing) || (existing && existing.revision !== revision(form.get("revision")))) {
      throw new WorkspaceError("The record changed. Reload it before saving.");
    }
    if (review) {
      if (!existing || existing.author === actor) throw new WorkspaceError("A different authorized person must review this record.");
      if (existing.state !== "submitted" || (kind === "ncr" ? action === "review" : action === "close")) {
        throw new WorkspaceError("This action is unavailable for the current record state.");
      }
      if (action === "review" && kind === "laboratory" &&
        (!existing.fields.tested || !(existing.fields.result || existing.fields.strength) || !existing.document_id)) {
        throw new WorkspaceError("A tested result and report revision are required for laboratory review.");
      }
      if (action === "review" && kind === "wir" && !existing.fields.actual) {
        throw new WorkspaceError("Record the actual inspection date before reviewing this request.");
      }
      if (action === "close" && (!existing.fields.root_cause || !existing.fields.verification)) {
        throw new WorkspaceError("Closure requires a recorded root cause and corrective-action verification.");
      }
      const assessment = text(form.get("assessment"),"review findings or closure verification",1000);
      const next = action === "return" ? "revision_required" : action === "close" ? "closed" : "reviewed";
      await tx.query(`UPDATE construction.quality_records SET state=$4,reviewer=$5,revision=revision+1,fields=fields||$6::jsonb
        WHERE organization_id=$1 AND project_id=$2 AND id=$3`, [organization,project,existing.id,next,actor,JSON.stringify({ assessment })]);
      await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,revision,payload)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [organization,project,actor,existing.id,`${kind}.${next}`,existing.revision+1,{ assessment }]);
      return existing.id;
    }
    if (existing && (existing.author !== actor || !["draft","revision_required"].includes(existing.state))) {
      throw new WorkspaceError("Only the author can revise a draft or returned record.");
    }
    const made = validateQualityFields(kind,form,action === "submit");
    const [element,delivery,specification,related] = ["element","delivery","specification","related"].map((field) =>
      config.links.some((link) => link === field) ? selection(form,field) : null);
    let document:string|null = null, documentRevision:number|null = null;
    if (form.get("evidence_link")) {
      const value = text(form.get("evidence_link"),"a document revision",60);
      const parts = value.split(":");
      if (parts.length !== 2) throw new WorkspaceError("Select a valid document revision.");
      document = id(parts[0]);
      documentRevision = revision(parts[1]);
    }
    if (specification) {
      const approved = await tx.query("SELECT 1 FROM construction.specifications WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND state='approved'",
        [organization,project,specification]);
      if (!approved.rowCount) throw new WorkspaceError("Choose an approved specification revision from this project.");
    }
    if (related === recordId && related) throw new WorkspaceError("A record cannot be related to itself.");
    if (related && kind === "laboratory") {
      const pour = await tx.query("SELECT 1 FROM construction.quality_records WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND kind='pour'",
        [organization,project,related]);
      if (!pour.rowCount) throw new WorkspaceError("Choose a concrete pour for the laboratory record.");
    }
    if (delivery && kind === "reinforcement") {
      const material = await tx.query("SELECT 1 FROM construction.deliveries WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND material='Reinforcing steel'",
        [organization,project,delivery]);
      if (!material.rowCount) throw new WorkspaceError("Choose a reinforcing steel delivery.");
    }
    if (action === "submit" && ((kind === "itp" && !specification) || (["wir","pour"].includes(kind) && !element) ||
      (kind === "reinforcement" && !delivery) || (kind === "laboratory" && !delivery && !related))) {
      throw new WorkspaceError("Link the required project record before submitting.");
    }
    const reference = existing?.reference ?? text(form.get("reference"),"a record reference",60).toUpperCase();
    const title = text(form.get("title"),"a record title",160);
    const state = action === "submit" ? "submitted" : "draft";
    const data = [organization,project,reference,kind,title,state,made.fields,made.due,element,delivery,specification,
      related,document,documentRevision,actor];
    const { rows:[record] } = existing
      ? await tx.query<{id:string; revision:number}>(`UPDATE construction.quality_records SET reference=$3,kind=$4,title=$5,state=$6,
        fields=$7,due_on=$8,element_id=$9,delivery_id=$10,specification_id=$11,related_id=$12,document_id=$13,document_revision=$14,
        author=$15,reviewer=NULL,revision=revision+1 WHERE organization_id=$1 AND project_id=$2 AND id=$16 RETURNING id,revision`,[...data,existing.id])
      : await tx.query<{id:string; revision:number}>(`INSERT INTO construction.quality_records
        (organization_id,project_id,reference,kind,title,state,fields,due_on,element_id,delivery_id,specification_id,related_id,document_id,document_revision,author)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id,revision`,data);
    await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,revision,payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [organization,project,actor,record.id,`${kind}.${state}`,record.revision,
      { title,...made,element,delivery,specification,related,document,documentRevision }]);
    return record.id;
  });
}
