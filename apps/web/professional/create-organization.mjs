import { mintInvite } from "../lib/professional/accounts.ts";
import { constructionPool, transact } from "../lib/professional/database.ts";
import { email, text } from "../lib/professional/input.ts";

const name = text(process.argv[2], "an organization name", 160);
const administrator = email(process.argv[3]);
const db = await constructionPool();
try {
  const result = await transact(db, async (tx) => {
    const { rows: [organization] } = await tx.query("INSERT INTO construction.organizations(name) VALUES ($1) RETURNING id", [name]);
    const invitation = await mintInvite(tx, organization.id, administrator, "administrator");
    await tx.query("INSERT INTO construction.audit(organization_id,entity_id,action) VALUES ($1,$1,'organization.created')", [organization.id]);
    return { organization: organization.id, invitation };
  });
  console.log(JSON.stringify(result));
} finally { await db.end(); }
