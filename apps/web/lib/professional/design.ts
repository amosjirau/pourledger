import type { Pool } from "pg";
import { qieMainnetChainId, sameHex } from "../chain.ts";
import { demoMainnetRegistry } from "../demo-run.ts";
import { deployment } from "../deployment.ts";
import { loadPassport } from "../passport.ts";
import { transact } from "./database.ts";
import { id, pick, revision, type Role, text, WorkspaceError } from "./input.ts";
import { managers, requireProject } from "./projects.ts";

export const specificationClasses = ["standard", "contract specification", "regulatory requirement"] as const;
export const specificationFields = {
  clause: "Clause reference", criteria: "Project acceptance criteria", test: "Test method", evidence: "Required evidence",
  authority: "Review authority", applicability: "Applicability and contract basis",
} as const;
export const elementFields = {
  building: "Building", level: "Floor or level", grid: "Grid location", drawing: "Drawing reference", revision: "Drawing revision",
  dimensions: "Dimensions and units", concrete: "Concrete specification", reinforcement: "Reinforcement specification",
} as const;
export const elementKinds = { Footing: 1, Column: 2, Beam: 3, Slab: 4, "Retaining wall": 0, Staircase: 0, Other: 0 } as const;
export const elementStates = ["planned","ready for inspection","in progress","complete"] as const;
export const designAuthors: readonly Role[] = [...managers, "site_engineer", "structural_engineer", "consultant"];
export const designReviewers: readonly Role[] = ["structural_engineer", "consultant"];
export type Specification = { id: string; reference: string; edition: string; project_revision: string; title: string; classification: string;
  publisher_url: string; criteria: Record<string,string>; state: string; author: string; reviewer: string | null };
export type Element = { id: string; reference: string; kind: keyof typeof elementKinds; metadata: Record<string,string>; revision: number; chain_element_id: string | null };

function textFields(form: FormData, keys: Record<string,string>, required: readonly string[] = []) {
  return Object.fromEntries(Object.entries(keys).map(([key, label]) => [key, text(form.get(key), label, 800, required.includes(key))]));
}

export function publisherUrl(value: unknown) {
  const raw = text(value, "the source document URL", 700);
  let url;
  try { url = new URL(raw); } catch { throw new WorkspaceError("Enter a valid HTTPS source URL."); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) {
    throw new WorkspaceError("Enter a public HTTPS publisher or controlled source URL.");
  }
  return url.href;
}

export async function saveSpecification(db: Pool, actor: string, organization: string, project: string, form: FormData) {
  const reference = text(form.get("reference"), "a standard or specification reference", 80).toUpperCase();
  const edition = text(form.get("edition"), "an edition including amendments", 100);
  const projectRevision = text(form.get("project_revision"), "a project revision", 25);
  const title = text(form.get("title"), "the document title", 200);
  const classification = pick(form.get("classification"), specificationClasses, "specification classification");
  const source = publisherUrl(form.get("publisher"));
  const criteria = textFields(form, specificationFields, ["criteria","authority","applicability"]);
  return transact(db, async (tx) => {
    await requireProject(tx, actor, organization, project, designAuthors);
    const { rows: [record] } = await tx.query<{id:string}>(`INSERT INTO construction.specifications
      (organization_id,project_id,reference,edition,project_revision,title,classification,publisher_url,criteria,author)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [organization,project,reference,edition,projectRevision,title,classification,source,criteria,actor]);
    await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action)
      VALUES ($1,$2,$3,$4,'specification.draft')`, [organization,project,actor,record.id]);
    return record;
  });
}

export async function reviewSpecification(db: Pool, actor: string, organization: string, project: string, specification: string, form: FormData) {
  const state = pick(form.get("decision"), ["approved","withdrawn"] as const, "review decision");
  const basis = text(form.get("basis"), "the review basis", 800);
  return transact(db, async (tx) => {
    await requireProject(tx, actor, organization, project, designReviewers);
    const reviewed = await tx.query(`UPDATE construction.specifications SET state=$4,reviewer=$5
      WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND author<>$5 AND
      (state='draft' OR (state='approved' AND $4='withdrawn'))`, [organization,project,specification,state,actor]);
    if (reviewed.rowCount !== 1) throw new WorkspaceError("An independent authorized reviewer must review an eligible specification revision.");
    await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,payload)
      VALUES ($1,$2,$3,$4,$5,$6)`, [organization,project,actor,specification,`specification.${state}`,{ basis }]);
  });
}

export async function designRegister(db: Pool, actor: string, organization: string, project: string, list: "specifications" | "elements", cursor?: string) {
  await requireProject(db, actor, organization, project);
  const table = list === "specifications" ? "construction.specifications" : "construction.elements";
  const { rows } = await db.query(`SELECT * FROM ${table} WHERE organization_id=$1 AND project_id=$2 AND ($3::uuid IS NULL OR id>$3)
    ORDER BY id LIMIT 21`, [organization,project,cursor ?? null]);
  return { entries: rows.slice(0,20), more: rows.length > 20 ? String(rows[19].id) : undefined };
}

export async function saveElement(db: Pool, actor: string, organization: string, project: string, form: FormData) {
  const reference = text(form.get("reference"), "an element reference", 50).toUpperCase();
  const kind = pick(form.get("kind"), Object.keys(elementKinds) as (keyof typeof elementKinds)[], "structural element type");
  const metadata = { ...textFields(form, elementFields, ["drawing","revision"]), status: pick(form.get("status"), elementStates, "construction status") };
  const element = form.get("element") ? id(form.get("element")) : null;
  const chain = text(form.get("chain_element"), "a registry element ID", 78, false);
  const scope = await requireProject(db, actor, organization, project, designAuthors);
  let chainId: string | null = null;
  if (chain) {
    if (!/^[1-9]\d*$/.test(chain) || BigInt(chain) >= 2n ** 256n || !scope.chain_project_id) throw new WorkspaceError("Supply an element ID for this project's registry reference.");
    try {
      const config = deployment();
      if (config.target.chainId !== qieMainnetChainId || !sameHex(config.target.registry, demoMainnetRegistry)) {
        throw new WorkspaceError("Only the pinned Mainnet registry may be linked from this register.");
      }
      const proof = await loadPassport({ ...config.target, kind:"element", id:BigInt(chain) }, config);
      if (proof?.kind !== "element" || String(proof.projectId) !== scope.chain_project_id || proof.elementType !== elementKinds[kind]) {
        throw new WorkspaceError("The confirmed element does not match this project's registry reference and element type.");
      }
      chainId = chain;
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError("The registry element could not be verified.");
    }
  }
  return transact(db, async (tx) => {
    await tx.query("SELECT id FROM construction.projects WHERE organization_id=$1 AND id=$2 FOR UPDATE", [organization, project]);
    const current = await requireProject(tx, actor, organization, project, designAuthors);
    if (current.revision !== scope.revision) throw new WorkspaceError("The project changed. Recheck the registry reference before saving.");
    const values = [organization,project,reference,kind,metadata,chainId];
    const { rows: [record] } = element
      ? await tx.query<{id:string; revision:number}>(`UPDATE construction.elements SET reference=$3,kind=$4,metadata=$5,chain_element_id=$6,revision=revision+1
        WHERE organization_id=$1 AND project_id=$2 AND id=$7 AND revision=$8 RETURNING id,revision`,
      [...values,element,revision(form.get("element_revision"))])
      : await tx.query<{id:string; revision:number}>(`INSERT INTO construction.elements(organization_id,project_id,reference,kind,metadata,chain_element_id)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,revision`, values);
    if (!record) throw new WorkspaceError("The element has changed. Reload before saving.");
    await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,revision,payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [organization,project,actor,record.id,
      element ? "element.revised" : "element.created",record.revision,{ reference,kind,metadata,chainId }]);
    return record;
  });
}
