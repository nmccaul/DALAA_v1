/**
 * Step three of an LTI 1.3 launch: a verified launch (src/lti/validate.ts)
 * becomes a DALAA user, course and membership, so the route can start a
 * session (D-020, D-024, D-025).
 *
 * - Identity is the login ID: the `login_id` custom field, else the email.
 *   Never the platform's `sub`, or a roster-created student gets a second account.
 * - A launch whose email matches an existing user links to that user.
 * - The Canvas course (LTI context) maps to one DALAA course. Only an
 *   instructor's launch creates it; a student who arrives first is told to wait.
 * - Membership follows the Canvas role in that course: Instructor or TA →
 *   instructor (staff for that course without the allowlist, D-020),
 *   Learner → student. Anything else is refused. Canvas's Student View user
 *   (role TestUser) is a student marked `student_view`, so teachers' lists can
 *   set it aside.
 * - A Deep Linking launch (a teacher adding DALAA as a Canvas assignment) goes
 *   to the picker (src/lti/deep-link.ts); a Resource Link launch carrying an
 *   `activity_id` opens that assignment and remembers its Canvas link.
 */

import { studentHomePath, takePath } from "@/attempts/store";
import { normalizeNetId } from "@/auth/admit";
import { fillEmail } from "@/courses/students";
import type { Db } from "@/db/types";
import { ACTIVITY_ID_FIELD, returnUrlAllowed, startDeepLink } from "./deep-link";
import { deepLinkPath } from "./picker";
import { rememberLtiUser } from "./users";
import { DEEP_LINKING, RESOURCE_LINK, type LaunchClaims } from "./validate";

export type CourseRole = "instructor" | "student";

export type SignedIn =
  | { ok: true; userId: string; courseId: string; role: CourseRole; path: string }
  | { ok: false; status: number; error: string };

const MEMBERSHIP = "http://purl.imsglobal.org/vocab/lis/v2/membership";

/**
 * The role in this course. Only context (membership) roles count: Canvas also
 * sends institution roles, and a teacher elsewhere is not a teacher here.
 */
export function courseRole(roles: readonly string[]): CourseRole | null {
  const has = (r: string) => roles.includes(`${MEMBERSHIP}#${r}`);
  if (has("Instructor") || has("TeachingAssistant") || roles.includes(`${MEMBERSHIP}/Instructor#TeachingAssistant`)) {
    return "instructor";
  }
  return has("Learner") ? "student" : null;
}

/**
 * Whether Canvas says this is its Student View user: the hidden test student
 * it makes for a teacher. Canvas marks it with the LIS TestUser role, in
 * launches and in the class list alike; the name ("Test Student") is not proof.
 */
export function isStudentView(roles: readonly string[]): boolean {
  return roles.includes("http://purl.imsglobal.org/vocab/lti/system/person#TestUser");
}

/** The login ID the launch vouches for: `login_id`, else the email. */
export function launchLoginId(claims: LaunchClaims): string | null {
  return (
    (claims.custom.login_id && normalizeNetId(claims.custom.login_id)) ||
    (claims.email && normalizeNetId(claims.email)) ||
    null
  );
}

const refuse = (status: number, error: string): SignedIn => ({ ok: false, status, error });

export async function signInFromLaunch(db: Db, claims: LaunchClaims): Promise<SignedIn> {
  if (!claims.context) return refuse(400, "Open DALAA from a course in Canvas.");
  const role = courseRole(claims.roles);
  if (!role) return refuse(403, "DALAA is for the teachers and students of this course.");
  const loginId = launchLoginId(claims);
  if (!loginId) return refuse(403, "Canvas didn't send a login ID or email DALAA can use.");
  const deepLinking = claims.messageType === DEEP_LINKING;
  if (deepLinking && role !== "instructor") return refuse(403, "Only the course's teachers can add DALAA assignments.");
  if (deepLinking && !(claims.deepLinking && returnUrlAllowed(claims.platform, claims.deepLinking.returnUrl))) {
    return refuse(400, "Canvas asked DALAA to send its answer somewhere it doesn't trust.");
  }

  const institutionId = claims.platform.institutionId;
  const context = claims.context;
  const email = claims.email?.trim().toLowerCase() || null;
  const name = claims.name?.trim() || null;

  return db.transaction(async (tx) => {
    // Refuse before writing anything: a refused launch leaves no account behind.
    let courseId = await mappedCourse(tx, claims.platform.id, context.id);
    if (!courseId && role !== "instructor") {
      return refuse(403, "Your instructor hasn't opened DALAA in this course yet. Try again later.");
    }
    const userId = await findOrCreateUser(tx, institutionId, loginId, email, name);
    courseId ??= await createLtiCourse(tx, claims, userId);
    // Where "Sync with Canvas" reads the class list (src/lti/roster.ts) and grades find
    // the gradebook (AGS lineitems); the latest launch wins, a launch without one keeps the last.
    if (claims.nrps || claims.ags?.lineItems) {
      await tx.query(
        `update lti_contexts set memberships_url = coalesce($3, memberships_url), lineitems_url = coalesce($4, lineitems_url)
          where platform_id = $1 and context_id = $2
            and (memberships_url is distinct from coalesce($3, memberships_url)
                 or lineitems_url is distinct from coalesce($4, lineitems_url))`,
        [claims.platform.id, context.id, claims.nrps?.membershipsUrl ?? null, claims.ags?.lineItems ?? null],
      );
    }
    await rememberLtiUser(tx, claims.platform.id, userId, claims.sub);

    // Canvas is the authority on who is in its course and in what role.
    await tx.query(
      `insert into course_members (course_id, user_id, role, student_view) values ($1, $2, $3, $4)
       on conflict (course_id, user_id) do update
         set role = excluded.role, status = 'active', student_view = excluded.student_view`,
      [courseId, userId, role, isStudentView(claims.roles)],
    );

    if (deepLinking) {
      return { ok: true as const, userId, courseId, role, path: deepLinkPath(courseId, await startDeepLink(tx, claims, userId, courseId)) };
    }
    const activityId = await linkedActivity(tx, courseId, claims);
    const path =
      role === "instructor"
        ? `/courses/${courseId}${activityId ? `/activities/${activityId}` : ""}`
        : activityId
          ? takePath(activityId)
          : studentHomePath(courseId);
    return { ok: true as const, userId, courseId, role, path };
  });
}

/**
 * The user this login ID belongs to. An existing account with the same email
 * is linked rather than duplicated (D-024); its login ID is left as it is.
 */
async function findOrCreateUser(
  tx: Db,
  institutionId: string,
  loginId: string,
  email: string | null,
  name: string | null,
): Promise<string> {
  const [byId] = await tx.query<{ id: string }>(
    "select id from users where institution_id = $1 and external_id = $2",
    [institutionId, loginId],
  );
  // At most one: an email belongs to one account (unique index, D-024).
  const [byEmail] = byId || !email ? [] : await tx.query<{ id: string }>(
    "select id from users where institution_id = $1 and lower(email) = $2",
    [institutionId, email],
  );
  const linked = byId ?? byEmail;
  if (linked) {
    // Fill gaps only: a real name or email is never replaced.
    await tx.query(
      `update users set display_name = case when display_name = external_id then coalesce($2, display_name)
                                            else display_name end
        where id = $1`,
      [linked.id, name],
    );
    await fillEmail(tx, linked.id, email);
    return linked.id;
  }

  const [user] = await tx.query<{ id: string }>(
    `insert into users (institution_id, external_id, display_name)
     values ($1, $2, coalesce($3, $2))
     on conflict (institution_id, external_id) do update set display_name = users.display_name
     returning id`,
    [institutionId, loginId, name],
  );
  await fillEmail(tx, user.id, email);
  return user.id;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The assignment a Canvas link opens: its `activity_id`, if that assignment is
 * in this course (a link copied into another Canvas course opens the course
 * instead). The first launch of a link records it, with its gradebook line
 * item, so grades know where to go (T25). A link Canvas moved to another
 * assignment is taken off the old one; an assignment already on another link
 * keeps its first.
 */
async function linkedActivity(tx: Db, courseId: string, claims: LaunchClaims): Promise<string | null> {
  const id = claims.custom[ACTIVITY_ID_FIELD];
  if (claims.messageType !== RESOURCE_LINK || !claims.resourceLink || !id || !UUID.test(id)) return null;
  const [activity] = await tx.query<{ id: string; lti_resource_link_id: string | null }>(
    "select id, lti_resource_link_id from activities where id = $1 and course_id = $2",
    [id, courseId],
  );
  if (!activity) return null;
  const link = claims.resourceLink.id;
  if (activity.lti_resource_link_id === null) {
    await tx.query(
      `update activities set lti_resource_link_id = null, lti_line_item_url = null, updated_at = now()
        where course_id = $1 and lti_resource_link_id = $2`,
      [courseId, link],
    );
  }
  if (activity.lti_resource_link_id === null || activity.lti_resource_link_id === link) {
    await tx.query(
      `update activities set lti_resource_link_id = $2, lti_line_item_url = coalesce($3, lti_line_item_url), updated_at = now()
        where id = $1`,
      [activity.id, link, claims.ags?.lineItem ?? null],
    );
  }
  return activity.id;
}

async function mappedCourse(tx: Db, platformId: string, contextId: string): Promise<string | null> {
  const [row] = await tx.query<{ course_id: string }>(
    "select course_id from lti_contexts where platform_id = $1 and context_id = $2",
    [platformId, contextId],
  );
  return row?.course_id ?? null;
}

/**
 * The DALAA course for a Canvas course launched for the first time. The
 * creation key is derived from (platform, context), so two first launches at
 * once find the same course instead of making two.
 */
async function createLtiCourse(tx: Db, claims: LaunchClaims, userId: string): Promise<string> {
  const context = claims.context!;
  const title = context.title || context.label || "Canvas course";
  const code = context.label || title;
  // Canvas doesn't send the term unless asked; say where the course came from instead of guessing.
  const term = claims.custom.canvas_term || "From Canvas";
  const canvasCourseId = claims.custom.canvas_course_id ?? null;

  const [course] = await tx.query<{ id: string }>(
    `with key as (select md5($1 || ':' || $2)::uuid as k)
     insert into courses (institution_id, code, title, term, created_by, creation_key, canvas_course_id)
     select $3, $4, $5, $6, $7, key.k,
            -- Another course (e.g. a REST import from a different Canvas) may hold this id.
            case when exists (select 1 from courses where institution_id = $3 and canvas_course_id = $8)
                 then null else $8 end
       from key
     on conflict (creation_key) do update set creation_key = excluded.creation_key
     returning id`,
    [claims.platform.id, context.id, claims.platform.institutionId, code, title, term, userId, canvasCourseId],
  );
  await tx.query(
    `insert into lti_contexts (platform_id, context_id, course_id) values ($1, $2, $3)
     on conflict (platform_id, context_id) do nothing`,
    [claims.platform.id, context.id, course.id],
  );
  return course.id;
}
