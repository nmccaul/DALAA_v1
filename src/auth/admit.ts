/**
 * Who may sign in — the same rules for the dev stand-in and BYU Okta later.
 * A sign-in provider only proves a login ID (a NetID, or an email on Canvases
 * whose login IDs are emails — D-025); this decides what that ID gets.
 *
 * - On the staff allowlist (or the shared test teacher, D-023) → first sign-in
 *   creates the account (no form).
 * - Already on a course roster as an active student → signed in.
 * - A school email proven by password sign-in (`newStudent`, D-024) → signed
 *   in, and a student account with no courses is made if they have none.
 * - Anyone else is refused; no other sign-in creates a student.
 */

import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { upsertStudent } from "@/courses/students";
import { testTeacherLoginId } from "./password";

export type Identity = { netId: string; displayName?: string; email?: string };

export type Admission =
  | { ok: true; userId: string }
  | { ok: false; reason: "not-on-roster" | "bad-netid" };

const NET_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
// Canvases whose login IDs are emails (D-025). Deliberately plain: one @, a dotted domain.
const EMAIL = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** A login ID as stored in `users.external_id`: a BYU NetID or a lowercased email. */
export function normalizeNetId(raw: string): string | null {
  const id = raw.trim().toLowerCase();
  if (NET_ID.test(id)) return id;
  return id.length <= 254 && EMAIL.test(id) ? id : null;
}

export async function admit(
  db: Db,
  institutionId: string,
  identity: Identity,
  options: { newStudent?: boolean } = {},
): Promise<Admission> {
  const netId = normalizeNetId(identity.netId);
  if (!netId) return { ok: false, reason: "bad-netid" };
  const name = identity.displayName?.trim() || null;
  const email = identity.email?.trim() || null;

  const [staff] = await db.query(
    "select 1 from staff_allowlist where institution_id = $1 and external_id = $2",
    [institutionId, netId],
  );
  if (staff || netId === testTeacherLoginId()) {
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
  if (!student && !options.newStudent) return { ok: false, reason: "not-on-roster" };

  const userId = student?.id ?? (await upsertStudent(db, institutionId, netId, name));
  // Fill a gap only; a real email is never replaced.
  if (email) await db.query("update users set email = coalesce(email, $2) where id = $1", [userId, email]);
  return { ok: true, userId };
}

/** The Actor for a signed-in user id, with staff status read fresh. Admin comes only from the allowlist. */
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
            (s.external_id is not null
             -- D-020: teaching a course Canvas launched (LTI) makes them staff
             -- without the allowlist; Canvas has already said who teaches it.
             or exists (select 1 from course_members cm
                          join lti_contexts lc on lc.course_id = cm.course_id
                         where cm.user_id = u.id and cm.role = 'instructor'
                           and cm.status = 'active')
             -- D-023: the shared test teacher, only while it's configured.
             or coalesce(u.external_id = $2::text, false)) as is_staff,
            coalesce(s.is_admin, false)  as is_admin
       from users u
       left join staff_allowlist s
              on s.institution_id = u.institution_id and s.external_id = u.external_id
      where u.id = $1`,
    [userId, testTeacherLoginId()],
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
