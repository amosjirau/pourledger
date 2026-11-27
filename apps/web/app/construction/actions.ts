"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptInvite, currentAccount, sessionCookie, signIn, signOut } from "../../lib/professional/accounts.ts";
import { constructionPool } from "../../lib/professional/database.ts";
import { reviewSpecification, saveElement, saveSpecification } from "../../lib/professional/design.ts";
import { archiveDocument, saveDocument } from "../../lib/professional/documents.ts";
import { id, WorkspaceError } from "../../lib/professional/input.ts";
import { addProjectMember, disableMember, inviteMember, revokeProjectMember, saveProject } from "../../lib/professional/projects.ts";
import { saveQualityRecord } from "../../lib/professional/quality-records.ts";
import { addDelivery, saveInspection } from "../../lib/professional/receiving.ts";
import { addMovement } from "../../lib/professional/stock.ts";

export type FormResult = { notice?: string; error?: string; invitation?: string };

export async function submitWorkspace(_result: FormResult, form: FormData): Promise<FormResult> {
  const task = form.get("task");
  let next: string | undefined;
  try {
    const db = await constructionPool();
    const jar = await cookies();
    const existing = jar.get(sessionCookie)?.value;
    if (task === "login" || task === "accept-invite") {
      const grant = task === "login" ? await signIn(db, form.get("email"), form.get("password"))
        : await acceptInvite(db, form.get("invitation"), form.get("email"), form.get("person"), form.get("password"));
      await signOut(db, existing);
      jar.set(sessionCookie, grant.value, { secure: true, httpOnly: true, sameSite: "lax", path: "/", expires: grant.expires });
      next = "/construction";
    } else if (task === "logout") {
      await signOut(db, existing);
      jar.delete(sessionCookie);
      next = "/construction";
    } else {
      const account = await currentAccount(db, existing);
      if (!account) throw new WorkspaceError("Sign in again to continue.");
      const organization = id(form.get("organization"));
      if (task === "project") {
        const record = await saveProject(db, account.id, organization, form);
        next = `/construction?organization=${organization}&project=${record.id}`;
      } else if (task === "invite-member") {
        const invitation = await inviteMember(db, account.id, organization, form.get("email"), form.get("role"));
        return { notice: "Share this one-time invitation privately. It expires after 48 hours.", invitation };
      } else if (task === "add-project-member") {
        await addProjectMember(db, account.id, organization, id(form.get("project")), id(form.get("member")));
        revalidatePath("/construction");
        return { notice: "Project access granted." };
      } else if (task === "revoke-project-member" || task === "disable-member") {
        const member = id(form.get("member"));
        if (task === "disable-member") await disableMember(db,account.id,organization,member);
        else await revokeProjectMember(db,account.id,organization,id(form.get("project")),member);
        revalidatePath("/construction");
        return { notice: "Access revoked." };
      } else if (task === "save-document" || task === "archive-document") {
        const project = id(form.get("project"));
        if (task === "save-document") await saveDocument(db, account.id, organization, project, form);
        else await archiveDocument(db, account.id, organization, project, id(form.get("document")));
        revalidatePath("/construction/documents");
        return { notice: task === "save-document" ? "Document revision saved." : "Document archived." };
      } else if (task === "receive" || task === "inspection") {
        const project = id(form.get("project"));
        if (task === "receive") {
          const record = await addDelivery(db, account.id, organization, project, form);
          next = `/construction/receiving?organization=${organization}&project=${project}&delivery=${record.id}`;
        } else {
          const selected = form.get("evidence");
          if (typeof selected === "string" && selected) {
            const [document, version] = selected.split(":");
            form.set("document", document);
            form.set("evidence_revision", version ?? "");
          }
          await saveInspection(db, account.id, organization, project, form);
          revalidatePath("/construction/receiving");
          return { notice: "Inspection record saved." };
        }
      } else if (task === "specification" || task === "review-specification" || task === "element") {
        const project = id(form.get("project"));
        if (task === "specification") await saveSpecification(db, account.id, organization, project, form);
        else if (task === "element") await saveElement(db, account.id, organization, project, form);
        else await reviewSpecification(db, account.id, organization, project, id(form.get("specification")), form);
        revalidatePath("/construction/design");
        return { notice: "Record saved." };
      } else if (task === "quality") {
        await saveQualityRecord(db, account.id, organization, id(form.get("project")), form);
        revalidatePath("/construction/quality");
        return { notice: "Quality record saved." };
      } else if (task === "stock") {
        await addMovement(db, account.id, organization, id(form.get("project")), form);
        revalidatePath("/construction/receiving/stock");
        return { notice: "Stock movement recorded." };
      } else {
        throw new WorkspaceError("Choose a valid action.");
      }
    }
  } catch (error) {
    if (error instanceof WorkspaceError) return { error: error.message };
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return { error: "A record with that reference already exists." };
    }
    console.error("Construction workspace action failed.");
    return { error: "The workspace is temporarily unavailable." };
  }
  if (next) redirect(next);
  return {};
}
