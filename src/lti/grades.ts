/**
 * "Send grades to Canvas" for an assignment in a course opened through LTI
 * (D-020): Assignment and Grade Services. Which scores go is decided by the
 * pure plan (src/results/push-plan.ts); this module only fetches the facts it
 * compares and sends what it says to send. Every push is recorded
 * (db/migrations/*_grade_pushes.sql); a student counts as sent only on a 2xx.
 *
 * - The gradebook column is the one the launch told us, else the one made for
 *   this activity (`resource_id` = activity id), else DALAA makes it when the
 *   teacher sends, and keeps its URL only once Canvas has confirmed it.
 * - Previewing never writes to Canvas.
 */

import { CanvasError, canvasClient, type AgsLineItem, type CanvasClient } from "@/canvas/client";
import { listCourseGrades } from "@/results/grading";
import { linesToSend, needsPreview, planPush, type PushCategory, type PushPlan } from "@/results/push-plan";
import { and, coursesTaughtBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { LTI_SCOPES } from "./config";
import { toPlatform, type PlatformRow } from "./registration";
import { serviceToken, type ServiceDeps } from "./services";
import { ltiSubs } from "./users";

/** The AGS scopes on DALAA's developer key (src/lti/config.ts). */
const AGS_SCOPES = LTI_SCOPES.filter((s) => s.includes("/lti-ags/"));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GradesRefusal =
  | "not_found" // not a published assignment in a course the actor teaches
  | "not_linked" // the course wasn't opened from Canvas
  | "no_gradebook" // no column, and no lineitems URL to find or make one
  | "refused" // Canvas refused the service token or the call
  | "unavailable";

export type GradesPreview =
  | { ok: true; activityId: string; title: string; points: number; plan: PushPlan; needsPreview: boolean }
  | { ok: false; reason: GradesRefusal };

export type PushSummary = {
  sent: number;
  failed: number;
  /** Students not sent, by why (src/results/push-plan.ts). */
  skipped: Partial<Record<PushCategory, number>>;
};

export type SendResult =
  | { ok: true; summary: PushSummary }
  | { ok: false; reason: GradesRefusal | "points_mismatch" | "in_progress" | "bad_key" | "needs_preview" };

type Context = PlatformRow & {
  activity_id: string;
  title: string;
  points: number;
  course_id: string;
  lti_line_item_url: string | null;
  lineitems_url: string | null;
};

type Prepared = {
  ctx: Context;
  client: CanvasClient;
  /** NULL when Canvas has no column for it yet. */
  lineItem: AgsLineItem | null;
  plan: PushPlan;
};

async function loadContext(db: Db, actor: Actor, activityId: string): Promise<Context | null> {
  if (!UUID.test(activityId)) return null;
  const where = and({ text: "a.id = $1 and a.status = 'published'", values: [activityId] }, coursesTaughtBy(actor, "c"));
  const [ctx] = await db.query<Context>(
    `select a.id as activity_id, a.title, a.points::float8 as points, a.course_id, a.lti_line_item_url,
            x.lineitems_url, p.id, p.institution_id, p.issuer, p.client_id, p.auth_url, p.token_url, p.jwks_url
       from activities a
       join courses c on c.id = a.course_id
       left join lti_contexts x on x.course_id = a.course_id
       left join lti_platforms p on p.id = x.platform_id
      where ${where.text}`,
    where.values,
  );
  return ctx ?? null;
}

const refusal = (e: unknown): GradesRefusal =>
  e instanceof CanvasError && (e.kind === "forbidden" || e.kind === "token-rejected" || e.kind === "bad-response")
    ? "refused"
    : "unavailable";

/** The column the launch named, else the one Canvas has for this activity, else NULL. */
async function findLineItem(client: CanvasClient, ctx: Context): Promise<AgsLineItem | null> {
  if (ctx.lti_line_item_url) return client.ags.lineItem(ctx.lti_line_item_url);
  if (!ctx.lineitems_url) return null;
  const items = await client.ags.lineItemsFor(ctx.lineitems_url, ctx.activity_id);
  return items.find((i) => i.resourceId === ctx.activity_id) ?? null;
}

/** The last score Canvas confirmed from DALAA, per student, for this column. */
async function lastSent(db: Db, activityId: string, lineItemUrl: string): Promise<Map<string, number>> {
  const rows = await db.query<{ user_id: string; score: number }>(
    `select distinct on (l.user_id) l.user_id, l.score::float8 as score
       from grade_push_lines l join grade_pushes p on p.id = l.push_id
      where p.activity_id = $1 and p.line_item_url = $2 and l.status = 'sent'
      order by l.user_id, l.sent_at desc`,
    [activityId, lineItemUrl],
  );
  return new Map(rows.map((r) => [r.user_id, r.score]));
}

async function prepare(db: Db, actor: Actor, activityId: string, deps: ServiceDeps): Promise<Prepared | GradesRefusal> {
  if (!actor.isStaff) return "not_found";
  const ctx = await loadContext(db, actor, activityId);
  if (!ctx) return "not_found";
  if (!ctx.id) return "not_linked";
  if (!ctx.lti_line_item_url && !ctx.lineitems_url) return "no_gradebook";

  const assignment = (await listCourseGrades(db, actor, ctx.course_id)).find((a) => a.activityId === activityId);
  const students = assignment?.students ?? [];
  const subs = await ltiSubs(db, ctx.id, students.map((s) => s.userId));

  let client: CanvasClient;
  let lineItem: AgsLineItem | null;
  const canvasScores = new Map<string, number | null>();
  try {
    const token = await serviceToken(toPlatform(ctx), AGS_SCOPES, deps);
    client = canvasClient({ baseUrl: new URL(ctx.token_url).origin, token, fetch: deps.fetch });
    lineItem = await findLineItem(client, ctx);
    for (const r of lineItem ? await client.ags.results(lineItem.id) : []) {
      canvasScores.set(r.userId, typeof r.resultScore === "number" ? r.resultScore : null);
    }
  } catch (e) {
    return refusal(e);
  }

  const sent = lineItem ? await lastSent(db, activityId, lineItem.id) : new Map<string, number>();
  const plan = planPush(
    ctx.points,
    lineItem?.scoreMaximum ?? ctx.points,
    students.map((s) => ({
      userId: s.userId,
      name: s.name,
      score: s.status === "graded" ? (s.teacherScore ?? s.aiScore) : null,
      maxScore: s.maxScore,
      sub: subs.get(s.userId) ?? null,
      lastSent: sent.get(s.userId) ?? null,
    })),
    canvasScores,
  );
  return { ctx, client, lineItem, plan };
}

/** What sending would do, for the teacher to look over. Reads Canvas; changes nothing. */
export async function previewGrades(db: Db, actor: Actor, activityId: string, deps: ServiceDeps = {}): Promise<GradesPreview> {
  const prepared = await prepare(db, actor, activityId, deps);
  if (typeof prepared === "string") return { ok: false, reason: prepared };
  const { ctx, plan } = prepared;
  return { ok: true, activityId, title: ctx.title, points: ctx.points, plan, needsPreview: needsPreview(plan) };
}

async function storedSummary(db: Db, activityId: string, clientKey: string): Promise<SendResult | null> {
  const [push] = await db.query<{ summary: PushSummary | null }>(
    "select summary from grade_pushes where activity_id = $1 and client_key = $2",
    [activityId, clientKey],
  );
  if (!push) return null;
  return push.summary ? { ok: true, summary: push.summary } : { ok: false, reason: "in_progress" };
}

/**
 * Sends new and raised scores (and lowered ones when `includeLowered`). The
 * same `clientKey` again returns the first push's summary and sends nothing.
 * With `onlyIfClean` (the one-click button) it sends nothing and answers
 * "needs_preview" when the teacher has something to decide first.
 */
export async function sendGrades(
  db: Db,
  actor: Actor,
  activityId: string,
  clientKey: string,
  opts: { includeLowered: boolean; onlyIfClean?: boolean },
  deps: ServiceDeps = {},
): Promise<SendResult> {
  if (!UUID.test(clientKey)) return { ok: false, reason: "bad_key" };
  if (!actor.isStaff || !(await loadContext(db, actor, activityId))) return { ok: false, reason: "not_found" };
  const replay = await storedSummary(db, activityId, clientKey);
  if (replay) return replay;

  const prepared = await prepare(db, actor, activityId, deps);
  if (typeof prepared === "string") return { ok: false, reason: prepared };
  const { ctx, client, plan } = prepared;
  if (!plan.ok) return { ok: false, reason: "points_mismatch" };
  if (opts.onlyIfClean && needsPreview(plan)) return { ok: false, reason: "needs_preview" };
  const lines = linesToSend(plan, opts);

  let lineItem = prepared.lineItem;
  if (!lineItem && lines.length > 0) {
    try {
      lineItem = await client.ags.createLineItem(ctx.lineitems_url!, {
        scoreMaximum: ctx.points,
        label: ctx.title,
        resourceId: ctx.activity_id,
      });
    } catch (e) {
      return { ok: false, reason: refusal(e) };
    }
    // Canvas confirmed it: from now on this is the activity's column.
    await db.query("update activities set lti_line_item_url = $2, updated_at = now() where id = $1 and lti_line_item_url is null", [
      activityId,
      lineItem.id,
    ]);
  }

  const skipped: PushSummary["skipped"] = {};
  const sending = new Set(lines.map((l) => l.userId));
  for (const l of plan.lines) if (!sending.has(l.userId)) skipped[l.category] = (skipped[l.category] ?? 0) + 1;
  if (!lineItem) return { ok: true, summary: { sent: 0, failed: 0, skipped } };

  const [push] = await db.query<{ id: string }>(
    `insert into grade_pushes (activity_id, client_key, pushed_by, line_item_url) values ($1, $2, $3, $4)
     on conflict (activity_id, client_key) do nothing returning id`,
    [activityId, clientKey, actor.userId, lineItem.id],
  );
  // Another request with this key got there first.
  if (!push) return (await storedSummary(db, activityId, clientKey))!;

  const summary: PushSummary = { sent: 0, failed: 0, skipped };
  for (const line of lines) {
    let status: "sent" | "failed" = "failed";
    try {
      await client.ags.postScore(lineItem.id, {
        userId: line.sub!,
        scoreGiven: line.score!,
        scoreMaximum: ctx.points,
        timestamp: new Date((deps.now ?? Date.now)()).toISOString(),
        activityProgress: "Completed",
        gradingProgress: "FullyGraded",
      });
      status = "sent";
    } catch {
      // Not confirmed, so not recorded as sent; the next push tries again.
    }
    summary[status]++;
    await db.query("insert into grade_push_lines (push_id, user_id, score, status) values ($1, $2, $3, $4)", [
      push.id,
      line.userId,
      line.score,
      status,
    ]);
  }
  // Through text: postgres.js would otherwise send the JSON string as a JSON string.
  await db.query("update grade_pushes set summary = $2::text::jsonb, finished_at = now() where id = $1", [
    push.id,
    JSON.stringify(summary),
  ]);
  return { ok: true, summary };
}
