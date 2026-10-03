/**
 * Who may sign in — the same rules for the dev stand-in and BYU Okta later.
 * A sign-in provider only proves a NetID; this decides what that NetID gets.
 *
 * - On the staff allowlist → first sign-in creates the account (no form).
 * - Already on a course roster as an active student → signed in.
 * - Anyone else is refused; sign-in never creates a student (docs/CANVAS.md).
 */

import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";

export type Identity = { netId: string; displayName?: string; email?: string };

export type Admission =
  | { ok: true; userId: string }
  | { ok: false; reason: "not-on-roster" | "bad-netid" };

export function normalizeNetId(raw: string): string | null {
  const netId = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(netId) ? netId : null;
}

export async function admit(db: Db, institutionId: string, identity: Identity): Promise<Admission> {
  const netId = normalizeNetId(identity.netId);
  if (!netId) return { ok: false, reason: "bad-netid" };
  const name = identity.displayName?.trim() || null;
  const email = identity.email?.trim() || null;

  const [staff] = await db.query(
    "select 1 from staff_allowlist where institution_id = $1 and external_id = $2",
    [institutionId, netId],
  );
  if (staff) {
    // Never overwrite a real value with a blank.
    const [user] = await db.query<{ id: string }>(
      `insert into users (institution_id, external_id, display_name, email)
       values ($1, $2, coalesce($3, $2), $4)
       on conflict (institution_id, external_id) do update
         set display_name = coalesce($3, users.display_name),
             email        = coalesce($4, users.email)
       returning id`,
      [institutionId, netId, name, email],
    );
    return { ok: true, userId: user.id };
  }

  const [student] = await db.query<{ id: string }>(
    `select u.id from users u
      where u.institution_id = $1 and u.external_id = $2
        and exists (select 1 from course_members cm
                     where cm.user_id = u.id and cm.role = 'student' and cm.status = 'active')`,
    [institutionId, netId],
  );
  return student ? { ok: true, userId: student.id } : { ok: false, reason: "not-on-roster" };
}

/** The Actor for a signed-in user id, with staff status read fresh. */
export async function loadActor(db: Db, userId: string): Promise<Actor | null> {
  const [row] = await db.query<{
    id: string;
    institution_id: string;
    external_id: string;
    display_name: string;
    is_staff: boolean;
    is_admin: boolean;
  }>(
    `select u.id, u.institution_id, u.external_id, u.display_name,
            (s.external_id is not null) as is_staff,
            coalesce(s.is_admin, false)  as is_admin
       from users u
       left join staff_allowlist s
              on s.institution_id = u.institution_id and s.external_id = u.external_id
      where u.id = $1`,
    [userId],
  );
  if (!row) return null;
  return {
    userId: row.id,
    institutionId: row.institution_id,
    netId: row.external_id,
    displayName: row.display_name,
    isStaff: row.is_staff,
    isAdmin: row.is_admin,
  };
}
