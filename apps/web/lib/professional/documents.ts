import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { keccak256 } from "viem";
import { transact } from "./database.ts";
import { id, pick, revision, type Role, text, WorkspaceError } from "./input.ts";
import { managers, requireProject } from "./projects.ts";

export const documentKinds = {
  "delivery-note": "Delivery note", "inspection-report": "Inspection report", "mill-certificate": "Mill test certificate",
  "lab-report": "Laboratory report", drawing: "Drawing", specification: "Specification", photograph: "Photograph",
  "pour-card": "Pour card", "ncr-evidence": "Nonconformance evidence",
  "corrective-action": "Corrective action", "supporting-file": "Supporting file",
} as const;
type Kind = keyof typeof documentKinds;
export const documentEditors: readonly Role[] = [...managers, "site_engineer", "structural_engineer", "consultant", "inspector", "supplier", "laboratory", "storekeeper"];
export const maxDocumentSize = 3 * 1024 * 1024;
const orgBudget = 100 * 1024 * 1024;
const signatures = {
  "application/pdf": Buffer.from("%PDF-"),
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
};
type MediaType = keyof typeof signatures;
type Document = { id: string; reference: string; title: string; kind: Kind; revision: number; archived_at: Date | null;
  sha256: string; keccak: string; file_name: string; size_bytes: number; created_at: Date };
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export async function documentBytes(file: unknown) {
  if (!(file instanceof File) || file.size === 0 || file.size > maxDocumentSize) {
    throw new WorkspaceError("Choose a PDF, PNG or JPEG file up to 3 MiB.");
  }
  const type = pick(file.type, Object.keys(signatures) as MediaType[], "file type");
  const name = text(file.name.replace(/[\\/]/g, "_"), "a file name", 160);
  if ([...name].some((char) => char.charCodeAt(0) < 32) ||
    !({ "application/pdf": /\.pdf$/i, "image/jpeg": /\.jpe?g$/i, "image/png": /\.png$/i })[type].test(name)) {
    throw new WorkspaceError("The file extension must match the selected file type.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.subarray(0, signatures[type].length).equals(signatures[type])) {
    throw new WorkspaceError("The file contents do not match its declared type.");
  }
  return { name, type, bytes, sha256: digest(bytes), keccak: keccak256(bytes) };
}

export async function listDocuments(db: Pool, actor: string, organization: string, project: string, cursor?: string) {
  await requireProject(db, actor, organization, project);
  const { rows } = await db.query<Document>(`SELECT d.id,d.reference,d.kind,d.title,d.revision,d.archived_at,r.sha256,r.keccak,
    r.file_name,r.size_bytes,r.created_at FROM construction.documents d
    JOIN construction.document_revisions r ON (r.organization_id,r.project_id,r.document_id,r.revision)=(d.organization_id,d.project_id,d.id,d.revision)
    WHERE d.organization_id=$1 AND d.project_id=$2 AND ($3::uuid IS NULL OR d.id>$3)
    ORDER BY d.id LIMIT 21`, [organization, project, cursor ?? null]);
  return { entries: rows.slice(0, 20), more: rows.length > 20 ? rows[19].id : undefined };
}

export async function listDocumentRevisions(db: Pool, actor: string, organization: string, project: string, document: string, before?: number) {
  await requireProject(db, actor, organization, project);
  const { rows } = await db.query<Pick<Document, "revision" | "created_at" | "file_name" | "size_bytes" | "sha256" | "keccak">>(`
    SELECT revision,created_at,file_name,size_bytes,sha256,keccak FROM construction.document_revisions
    WHERE organization_id=$1 AND project_id=$2 AND document_id=$3 AND ($4::int IS NULL OR revision<$4)
    ORDER BY revision DESC LIMIT 21`, [organization, project, document, before ?? null]);
  return { entries: rows.slice(0, 20), more: rows.length > 20 ? rows[19].revision : undefined };
}

export async function saveDocument(db: Pool, actor: string, organization: string, project: string, form: FormData) {
  const document = form.get("document") ? id(form.get("document")) : null;
  const access = await requireProject(db, actor, organization, project, documentEditors);
  const file = await documentBytes(form.get("file"));
  return transact(db, async (tx) => {
    await requireProject(tx, actor, organization, access.id, documentEditors);
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,10))", [organization]);
    const { rows: [usage] } = await tx.query<{ used: string }>(`SELECT COALESCE(sum(size_bytes),0)::text AS used
      FROM construction.document_revisions WHERE organization_id=$1`, [organization]);
    if (Number(usage.used) + file.bytes.length > orgBudget) throw new WorkspaceError("This organization has reached its document storage limit.");
    const { rows: [record] } = document
      ? await tx.query<{id: string; revision: number}>(`UPDATE construction.documents SET revision=revision+1
        WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND revision=$4 AND archived_at IS NULL RETURNING id,revision`,
      [organization, project, document, revision(form.get("revision"))])
      : await tx.query<{id: string; revision: number}>(`INSERT INTO construction.documents(organization_id,project_id,reference,kind,title)
        VALUES ($1,$2,$3,$4,$5) RETURNING id,revision`, [organization, project, text(form.get("reference"), "a document reference", 60).toUpperCase(),
          pick(form.get("kind"), Object.keys(documentKinds) as Kind[], "document type"), text(form.get("title"), "a document title", 160)]);
    if (!record) throw new WorkspaceError("The document was archived or revised. Reload the page before uploading.");
    await tx.query(`INSERT INTO construction.document_revisions(organization_id,project_id,document_id,revision,file_name,media_type,bytes,sha256,keccak,author)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [organization, project, record.id, record.revision, file.name, file.type, file.bytes, file.sha256, file.keccak, actor]);
    await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,revision,payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [organization, project, actor, record.id,
      document ? "document.revised" : "document.added", record.revision, { sha256: file.sha256, keccak: file.keccak }]);
    return record;
  });
}

export async function archiveDocument(db: Pool, actor: string, organization: string, project: string, document: string) {
  return transact(db, async (tx) => {
    await requireProject(tx, actor, organization, project, managers);
    const { rows: [record] } = await tx.query<{revision: number}>(`UPDATE construction.documents SET archived_at=now()
      WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND archived_at IS NULL RETURNING revision`, [organization, project, document]);
    if (record) await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,revision)
      VALUES ($1,$2,$3,$4,'document.archived',$5)`, [organization, project, actor, document, record.revision]);
  });
}

export async function downloadDocument(db: Pool, actor: string, organization: string, project: string, document: string, version: number) {
  const verified = await transact(db, async (tx) => {
    await requireProject(tx, actor, organization, project);
    const { rows: [record] } = await tx.query<{ file_name: string; media_type: string; bytes: Buffer; sha256: string; keccak: string }>(`
      SELECT file_name,media_type,bytes,sha256,keccak FROM construction.document_revisions
      WHERE organization_id=$1 AND project_id=$2 AND document_id=$3 AND revision=$4`, [organization, project, document, version]);
    if (!record) throw new WorkspaceError("This document revision is unavailable.");
    if (digest(record.bytes) !== record.sha256 || keccak256(record.bytes) !== record.keccak) {
      await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,revision)
        VALUES ($1,$2,$3,$4,'document.integrity_failed',$5)`,[organization,project,actor,document,version]);
      return undefined;
    }
    await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,revision)
      VALUES ($1,$2,$3,$4,'document.downloaded',$5)`, [organization, project, actor, document, version]);
    return record;
  });
  if (!verified) throw new WorkspaceError("The stored bytes failed the integrity check.");
  return verified;
}
