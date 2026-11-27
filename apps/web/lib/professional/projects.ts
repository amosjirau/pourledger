import type { Pool, PoolClient } from "pg";
import { mintInvite } from "./accounts.ts";
import { lockOrganization, transact } from "./database.ts";
import { email, id, pick, type ProjectMetadata, projectInput, type Role, revision, roles, WorkspaceError } from "./input.ts";

type Queryable = Pool | PoolClient;
export type Project = { id: string; code: string; name: string; chain_project_id: string | null; metadata: ProjectMetadata; revision: number };
type Member = { id: string; name: string; email: string; role: Role };
const admin = ["administrator"] as const;
export const managers = ["administrator", "project_manager"] as const;

export async function requireMember(db: Queryable, account: string, organization: string, allowed?: readonly Role[]) {
  const { rows: [member] } = await db.query<{role: Role}>(
    "SELECT role FROM construction.members WHERE account_id=$1 AND organization_id=$2 AND disabled_at IS NULL", [account, organization]);
  if (!member || (allowed && !allowed.includes(member.role))) throw new WorkspaceError("You do not have access to this organization action.");
  return member.role;
}

export async function requireProject(db: Queryable, account: string, organization: string, project: string, allowed?: readonly Role[]) {
  const role = await requireMember(db, account, organization, allowed);
  const { rows: [row] } = await db.query<Project>(`SELECT p.id,p.code,p.name,p.chain_project_id,p.metadata,p.revision
    FROM construction.projects p WHERE organization_id=$1 AND p.id=$2 AND ($4='administrator' OR EXISTS (
      SELECT 1 FROM construction.project_members pm WHERE pm.organization_id=p.organization_id AND pm.project_id=p.id AND pm.account_id=$3))`,
  [organization, project, account, role]);
  if (!row) throw new WorkspaceError("You do not have access to this project.");
  return row;
}

export async function organizationsFor(db: Pool, account: string) {
  const { rows } = await db.query<{id: string; name: string; role: Role}>(`SELECT o.id,o.name,m.role FROM construction.organizations o
    JOIN construction.members m ON m.organization_id=o.id WHERE m.account_id=$1 AND m.disabled_at IS NULL ORDER BY o.name,o.id LIMIT 100`, [account]);
  return rows;
}

export async function projectsFor(db: Pool, account: string, organization: string, cursor?: string) {
  const role = await requireMember(db, account, organization);
  const { rows } = await db.query<Project>(`SELECT p.id,p.code,p.name,p.chain_project_id,p.metadata,p.revision
    FROM construction.projects p WHERE p.organization_id=$1 AND ($4::uuid IS NULL OR p.id>$4)
    AND ($3='administrator' OR EXISTS (
      SELECT 1 FROM construction.project_members pm WHERE pm.organization_id=p.organization_id AND pm.project_id=p.id AND pm.account_id=$2))
    ORDER BY p.id LIMIT 21`, [organization, account, role, cursor ?? null]);
  return { entries: rows.slice(0, 20), more: rows.length > 20 ? rows[19].id : undefined };
}

export async function saveProject(db: Pool, account: string, organization: string, form: FormData) {
  const input = projectInput(form);
  const project = form.get("project") ? id(form.get("project")) : null;
  return transact(db, async (tx) => {
    const fields = [organization, input.code, input.name, input.chainProjectId, input.metadata];
    if (project) {
      const previous = await requireProject(tx, account, organization, project, managers);
      await tx.query("SELECT id FROM construction.projects WHERE organization_id=$1 AND id=$2 FOR UPDATE", [organization, project]);
      if (previous.chain_project_id !== input.chainProjectId) {
        const existing = await tx.query("SELECT 1 FROM construction.elements WHERE organization_id=$1 AND project_id=$2 AND chain_element_id IS NOT NULL LIMIT 1",
          [organization, project]);
        if (existing.rowCount) throw new WorkspaceError("Unlink the verified structural elements before changing the project's registry reference.");
      }
    } else await requireMember(tx, account, organization, managers);
    const { rows: [record] } = project
      ? await tx.query<{id: string; revision: number}>(`UPDATE construction.projects SET code=$2,name=$3,chain_project_id=$4,metadata=$5,revision=revision+1
        WHERE organization_id=$1 AND id=$6 AND revision=$7 RETURNING id,revision`, [...fields, project, revision(form.get("revision"))])
      : await tx.query<{id: string; revision: number}>(`INSERT INTO construction.projects(organization_id,code,name,chain_project_id,metadata)
        VALUES ($1,$2,$3,$4,$5) RETURNING id,revision`, fields);
    if (!record) throw new WorkspaceError("This project has changed. Reload it before saving.");
    if (!project) {
      await tx.query("INSERT INTO construction.project_members VALUES ($1,$2,$3)", [organization, record.id, account]);
    }
    await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action,revision,payload)
      VALUES ($1,$2,$3,$2,$4,$5,$6)`, [organization, record.id, account, project ? "project.revised" : "project.created", record.revision, input]);
    return record;
  });
}

export async function inviteMember(db: Pool, account: string, organization: string, address: unknown, requestedRole: unknown) {
  return transact(db, async (tx) => {
    await lockOrganization(tx,organization);
    await requireMember(tx, account, organization, admin);
    const role = pick(requestedRole, Object.keys(roles) as Role[], "organization role");
    const value = await mintInvite(tx, organization, email(address), role, account);
    await tx.query(`INSERT INTO construction.audit(organization_id,actor,entity_id,action,payload)
      VALUES ($1,$2,$1,'membership.invited',$3)`, [organization, account, { role }]);
    return value;
  });
}

export async function membersFor(db: Pool, account: string, organization: string) {
  await requireMember(db, account, organization, admin);
  return (await db.query<Member>(`SELECT a.id,a.name,a.email,m.role FROM construction.members m
    JOIN construction.accounts a ON a.id=m.account_id WHERE m.organization_id=$1 AND m.disabled_at IS NULL ORDER BY a.name,a.id LIMIT 100`, [organization])).rows;
}

export async function addProjectMember(db: Pool, account: string, organization: string, project: string, member: string) {
  return transact(db, async (tx) => {
    await lockOrganization(tx,organization);
    await requireProject(tx, account, organization, project, admin);
    await requireMember(tx, member, organization);
    const inserted = await tx.query("INSERT INTO construction.project_members VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [organization, project, member]);
    if (inserted.rowCount) await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action)
      VALUES ($1,$2,$3,$4,'project.member_added')`, [organization, project, account, member]);
  });
}

export async function revokeProjectMember(db:Pool, account:string, organization:string, project:string, member:string) {
  return transact(db,async (tx) => {
    await lockOrganization(tx,organization);
    await requireProject(tx,account,organization,project,admin);
    if (await requireMember(tx,member,organization) === "administrator") throw new WorkspaceError("Administrators have organization-wide project access.");
    const revoked = await tx.query("DELETE FROM construction.project_members WHERE organization_id=$1 AND project_id=$2 AND account_id=$3",
      [organization,project,member]);
    if (revoked.rowCount) await tx.query(`INSERT INTO construction.audit(organization_id,project_id,actor,entity_id,action)
      VALUES ($1,$2,$3,$4,'project.member_removed')`,[organization,project,account,member]);
  });
}

export async function disableMember(db:Pool, account:string, organization:string, member:string) {
  return transact(db,async (tx) => {
    await lockOrganization(tx,organization);
    await requireMember(tx,account,organization,admin);
    if (member === account) throw new WorkspaceError("An administrator cannot disable their own organization access.");
    const disabled = await tx.query("UPDATE construction.members SET disabled_at=now() WHERE organization_id=$1 AND account_id=$2 AND disabled_at IS NULL",
      [organization,member]);
    if (disabled.rowCount) {
      await tx.query("DELETE FROM construction.project_members WHERE organization_id=$1 AND account_id=$2",[organization,member]);
      await tx.query(`UPDATE construction.invites i SET consumed_at=now() FROM construction.accounts a
        WHERE i.organization_id=$1 AND a.id=$2 AND i.email=a.email AND i.consumed_at IS NULL`,[organization,member]);
      await tx.query(`INSERT INTO construction.audit(organization_id,actor,entity_id,action)
        VALUES ($1,$2,$3,'membership.disabled')`,[organization,account,member]);
    }
  });
}

export async function projectHistory(db: Pool, account: string, organization: string, project: string) {
  await requireProject(db, account, organization, project);
  return (await db.query<{ id: string; action: string; revision: number; name: string; created_at: Date }>(`SELECT e.id,e.action,e.revision,e.created_at,a.name
    FROM construction.audit e LEFT JOIN construction.accounts a ON a.id=e.actor
    WHERE e.organization_id=$1 AND e.project_id=$2 ORDER BY e.id DESC LIMIT 30`, [organization, project])).rows;
}
