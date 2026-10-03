import type { Db } from "@/db/types";

/**
 * The account for a student NetID, created if new. Rosters create students
 * before they ever sign in, keyed on NetID (CLAUDE.md). A real name is never
 * replaced; only the placeholder (the NetID itself) is filled in.
 */
export async function upsertStudent(
  tx: Db,
  institutionId: string,
  netId: string,
  name: string | null,
): Promise<string> {
  const [user] = await tx.query<{ id: string }>(
    `insert into users (institution_id, external_id, display_name)
     values ($1, $2, coalesce($3, $2))
     on conflict (institution_id, external_id) do update
       set display_name = case when users.display_name = users.external_id
                               then coalesce($3, users.display_name)
                               else users.display_name end
     returning id`,
    [institutionId, netId, name],
  );
  return user.id;
}
