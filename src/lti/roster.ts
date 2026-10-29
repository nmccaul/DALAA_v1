/**
 * "Sync with Canvas" for a course opened through LTI (D-020): the class list
 * comes from Names and Role Provisioning (NRPS), using the memberships URL the
 * latest launch sent, and goes through the same sync as the REST path
 * (src/canvas/sync.ts): adds and flags, never deletes.
 *
 * - Identity is the login ID, as in a launch: the `login_id` custom field when
 *   Canvas includes it, else the email (D-025). No login ID, no account.
 * - Only Learners become students; instructors and TAs are left alone.
 * - NRPS has no sections, so a student's section is never changed here.
 */

import { normalizeNetId } from "@/auth/admit";
import { CanvasError, canvasClient, type NrpsMember } from "@/canvas/client";
import type { ImportPlan } from "@/canvas/import-plan";
import { applyPlan, taughtCourse, type SyncResult } from "@/canvas/sync";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { courseRole } from "./launch";
import { toPlatform, type PlatformRow } from "./registration";
import { NRPS_SCOPE, serviceToken, type ServiceDeps } from "./services";

const CUSTOM = "https://purl.imsglobal.org/spec/lti/claim/custom";

function loginIdOf(member: NrpsMember): string | null {
  for (const message of member.message ?? []) {
    const custom = message[CUSTOM] as Record<string, unknown> | undefined;
    const id = typeof custom?.login_id === "string" ? normalizeNetId(custom.login_id) : null;
    if (id) return id;
  }
  return member.email ? normalizeNetId(member.email) : null;
}

/** What the class list from NRPS will add. Pure, so every oddity is a fixture test. */
export function planFromMembers(members: NrpsMember[]): ImportPlan {
  const students: ImportPlan["students"] = [];
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
    students.push({ netId, name: m.name?.trim() || netId, canvasSectionId: null, email });
  }
  return { sections: [], students, skipped: { notEnrolled, noNetId, inTwoSections: 0 } };
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
  const counts = await db.transaction((tx) => applyPlan(tx, actor, String, courseId, plan));
  return { ok: true, ...counts, skipped: plan.skipped };
}
