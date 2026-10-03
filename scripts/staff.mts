/**
 * Manage the staff allowlist (D-018) until there's an admin screen.
 *   npm run staff -- add <netid> [--admin]
 *   npm run staff -- remove <netid>
 *   npm run staff -- list
 */

import postgres from "postgres";
import { databaseUrl } from "../src/db/url";
import { normalizeNetId } from "../src/auth/admit";

const [command, rawNetId] = process.argv.slice(2);
const slug = process.env.INSTITUTION_SLUG ?? "byu";

const sql = postgres(databaseUrl(), { max: 1, prepare: false });
try {
  const [inst] = await sql<{ id: string }[]>`select id from institutions where slug = ${slug}`;
  if (!inst) throw new Error(`No institution "${slug}" — run migrations first`);

  if (command === "list") {
    const rows = await sql`select external_id, is_admin from staff_allowlist
                            where institution_id = ${inst.id} order by external_id`;
    for (const r of rows) console.log(`${r.external_id}${r.is_admin ? "  (admin)" : ""}`);
  } else if (command === "add" || command === "remove") {
    const netId = normalizeNetId(rawNetId ?? "");
    if (!netId) throw new Error("Give a NetID");
    if (command === "add") {
      const isAdmin = process.argv.includes("--admin");
      await sql`insert into staff_allowlist (institution_id, external_id, is_admin)
                values (${inst.id}, ${netId}, ${isAdmin})
                on conflict (institution_id, external_id) do update set is_admin = ${isAdmin}`;
      console.log(`added ${netId}${isAdmin ? " (admin)" : ""}`);
    } else {
      await sql`delete from staff_allowlist where institution_id = ${inst.id} and external_id = ${netId}`;
      console.log(`removed ${netId} — they keep their account but no longer have staff access`);
    }
  } else {
    console.log("usage: npm run staff -- add <netid> [--admin] | remove <netid> | list");
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
