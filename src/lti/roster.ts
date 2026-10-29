/**
 * "Sync with Canvas" for a course opened through LTI (D-020): the class list
 * comes from Names and Role Provisioning (NRPS), using the memberships URL the
 * latest launch sent, and goes through the same sync as the REST path
 * (src/canvas/sync.ts): adds and flags, never deletes.
 *
 * - Identity is the login ID, as in a launch: the `login_id` custom field when
 *   Canvas includes it, else the email (D-025). No login ID, no account.
 * - Only Learners become students; instructors and TAs are left alone.
 *   Canvas's Student View user is a student marked `student_view`.
 * - NRPS has no sections, so a student's section is never changed here.
 */

import { normalizeNetId } from "@/auth/admit";
import { CanvasError, canvasClient, type NrpsMember } from "@/canvas/client";
import type { ImportPlan } from "@/canvas/import-plan";
import { applyPlan, taughtCourse, type SyncResult } from "@/canvas/sync";
import { upsertStudent } from "@/courses/students";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { courseRole, isStudentView } from "./launch";
import { toPlatform, type PlatformRow } from "./registration";
import { NRPS_SCOPE, serviceToken, type ServiceDeps } from "./services";
import { rememberLtiUser } from "./users";

const CUSTOM = "https://purl.imsglobal.org/spec/lti/claim/custom";

function loginIdOf(member: NrpsMember): string | null {
  for (const message of member.message ?? []) {
    const custom = message[CUSTOM] as Record<string, unknown> | undefined;
    const id = typeof custom?.login_id === "string" ? normalizeNetId(custom.login_id) : null;
    if (id) return id;
  }
  return member.email ? normalizeNetId(member.email) : null;
}

/**
 * What the class list from NRPS will add, and each student's platform id (by
 * login ID) for sending grades. Pure, so every oddity is a fixture test.
 */
export function planFromMembers(members: NrpsMember[]): ImportPlan & { subs: Map<string, string> } {
  const students: ImportPlan["students"] = [];
  const subs = new Map<string, string>();
  const seen = new Set<string>();
  let notEnrolled = 0;
  let noNetId = 0;
  for (const m of members) {
    if (courseRole(m.roles ?? []) !== "student") continue;
    if (m.status && m.status !== "Active") {
      notEnrolled++;
      continue;
    }
    const netId = loginIdOf(m);
    if (!netId || seen.has(netId)) {
      noNetId++;
      continue;
    }
    seen.add(netId);
    const email = m.email?.trim().toLowerCase() || null;
    students.push({
      netId,
      name: m.name?.trim() || netId,
      canvasSectionId: null,
      email,
      studentView: isStudentView(m.roles ?? []),
    });
    if (m.user_id) subs.set(netId, m.user_id);
  }
  return { sections: [], students, skipped: { notEnrolled, noNetId, inTwoSections: 0 }, subs };
}


/** Whether the course was opened from Canvas through LTI (and so syncs this way). */
export async function isLtiCourse(db: Db, courseId: string): Promise<boolean> {
  return (await db.query("select 1 from lti_contexts where course_id = $1", [courseId])).length > 0;
}

export async function syncLtiRoster(db: Db, actor: Actor, courseId: string, deps: ServiceDeps = {}): Promise<SyncResult> {
  if (!actor.isStaff) throw new Error("Only instructors sync rosters");
  const course = await taughtCourse(db, actor, courseId);
  if (!course) return { ok: false, reason: "not-yours" };
  const [ctx] = await db.query<PlatformRow & { memberships_url: string | null }>(
    `select x.memberships_url, p.id, p.institution_id, p.issuer, p.client_id,
            p.auth_url, p.token_url, p.jwks_url
       from lti_contexts x join lti_platforms p on p.id = x.platform_id
      where x.course_id = $1`,
    [courseId],
  );
  if (!ctx) return { ok: false, reason: "not-linked" };
  if (!ctx.memberships_url) return { ok: false, reason: "no-class-list" };
  // The service token goes only to the Canvas that issued it.
  const origin = new URL(ctx.token_url).origin;
  if (new URL(ctx.memberships_url).origin !== origin) return { ok: false, reason: "refused" };

  let members: NrpsMember[];
  try {
    const token = await serviceToken(toPlatform(ctx), [NRPS_SCOPE], deps);
    members = await canvasClient({ baseUrl: origin, token, fetch: deps.fetch }).nrpsMembers(ctx.memberships_url);
  } catch (e) {
    if (e instanceof CanvasError && (e.kind === "forbidden" || e.kind === "token-rejected")) {
      return { ok: false, reason: "refused" };
    }
    return { ok: false, reason: "unavailable" };
  }

  const plan = planFromMembers(members);
  const counts = await db.transaction(async (tx) => {
    const applied = await applyPlan(tx, actor, String, courseId, plan);
    for (const s of plan.students) {
      const sub = plan.subs.get(s.netId);
      // The account applyPlan just added or linked: upsertStudent finds it again.
      if (sub) await rememberLtiUser(tx, ctx.id, await upsertStudent(tx, actor.institutionId, s.netId, s.name, s.email), sub);
    }
    return applied;
  });
  return { ok: true, ...counts, skipped: plan.skipped };
}
