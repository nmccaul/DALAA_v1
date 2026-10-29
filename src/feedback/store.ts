/**
 * Feedback reports (db/migrations/*_feedback_reports.sql): saved from the
 * feedback button on any page, read in the admin list and by /fix-bug.
 */

import { feedbackReadableBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { ReportInput, SCREENSHOT_MAX_BYTES, type Kind, type ReportContext } from "./report";

/** More reports than this from one person in the window are dropped quietly. */
const RATE_LIMIT = 6;
const RATE_WINDOW_SECONDS = 120;

export type SaveOutcome =
  | { ok: true; id: string }
  | { ok: true; throttled: true }
  | { ok: false; reason: string };

/** The screenshot's bytes from a data URL, or NULL when it's missing, not an image we take, or too big. */
export function decodeScreenshot(dataUrl: string | null): { bytes: Buffer; type: "image/png" | "image/jpeg" } | null {
  const match = dataUrl?.match(/^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > SCREENSHOT_MAX_BYTES) return null;
  return { bytes, type: match[1] as "image/png" | "image/jpeg" };
}

/**
 * Files a report for the signed-in actor. A screenshot that can't be read is
 * dropped, never a reason to lose the report. The same client key returns the
 * first report. `appCommit` is the deployed commit, from the server's env.
 */
export async function saveReport(db: Db, actor: Actor, input: unknown, appCommit: string | null): Promise<SaveOutcome> {
  const parsed = ReportInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "That report didn't arrive whole. Try sending it again." };
  const report = parsed.data;

  const [existing] = await db.query<{ id: string }>(
    "select id from feedback_reports where user_id = $1 and client_key = $2",
    [actor.userId, report.clientKey],
  );
  if (existing) return { ok: true, id: existing.id };

  const [{ recent }] = await db.query<{ recent: number }>(
    `select count(*)::int as recent from feedback_reports
      where user_id = $1 and created_at > now() - make_interval(secs => $2)`,
    [actor.userId, RATE_WINDOW_SECONDS],
  );
  if (recent >= RATE_LIMIT) return { ok: true, throttled: true };

  const shot = decodeScreenshot(report.screenshot);
  const [row] = await db.query<{ id: string }>(
    `insert into feedback_reports
       (user_id, client_key, kind, note, url, context, screenshot, screenshot_type, app_commit)
     values ($1, $2, $3, $4, $5, $6::text::jsonb, $7, $8, $9)
     on conflict (user_id, client_key) do nothing
     returning id`,
    [
      actor.userId,
      report.clientKey,
      report.kind,
      report.note,
      report.url,
      JSON.stringify(report.context),
      shot?.bytes ?? null,
      shot?.type ?? null,
      appCommit,
    ],
  );
  if (row) return { ok: true, id: row.id };
  // A retry raced the first send between the check and the insert.
  const [first] = await db.query<{ id: string }>(
    "select id from feedback_reports where user_id = $1 and client_key = $2",
    [actor.userId, report.clientKey],
  );
  return { ok: true, id: first.id };
}

export type ReportSummary = {
  id: string;
  kind: Kind;
  note: string;
  url: string;
  status: "open" | "resolved";
  reporter: string;
  fixedCommit: string | null;
  hasScreenshot: boolean;
  createdAt: Date;
};

/** Every report the actor may read, newest first; nothing for anyone but an admin. */
export async function listReports(db: Db, actor: Actor): Promise<ReportSummary[]> {
  const scope = feedbackReadableBy(actor);
  return db.query<ReportSummary>(
    `select f.id, f.kind, f.note, f.url, f.status, u.display_name as reporter, f.fixed_commit as "fixedCommit",
            f.screenshot is not null as "hasScreenshot", f.created_at as "createdAt"
       from feedback_reports f
       join users u on u.id = f.user_id
      where ${scope.text}
      order by f.created_at desc`,
    scope.values,
  );
}

export type ReportDetail = ReportSummary & { context: ReportContext; appCommit: string | null };

/** One report with its captured context, or NULL when it's not there or not the actor's to read. */
export async function getReport(db: Db, actor: Actor, id: string): Promise<ReportDetail | null> {
  const scope = feedbackReadableBy(actor);
  const [row] = await db.query<ReportDetail>(
    `select f.id, f.kind, f.note, f.url, f.status, u.display_name as reporter, f.fixed_commit as "fixedCommit",
            f.screenshot is not null as "hasScreenshot", f.created_at as "createdAt",
            f.context, f.app_commit as "appCommit"
       from feedback_reports f
       join users u on u.id = f.user_id
      where f.id::text = $${scope.values.length + 1} and (${scope.text})`,
    [...scope.values, id],
  );
  return row ?? null;
}

/** A report's screenshot, or NULL when there's none or it's not the actor's to read. */
export async function getScreenshot(db: Db, actor: Actor, id: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const scope = feedbackReadableBy(actor);
  const [row] = await db.query<{ bytes: Uint8Array; type: string }>(
    `select f.screenshot as bytes, f.screenshot_type as type
       from feedback_reports f
      where f.id::text = $${scope.values.length + 1} and f.screenshot is not null and (${scope.text})`,
    [...scope.values, id],
  );
  return row ?? null;
}

/**
 * Marks a report resolved, with the short SHA of the fix when there was one.
 * Admin only; resolving twice keeps the first time and commit.
 */
export async function resolveReport(db: Db, actor: Actor, id: string, fixedCommit: string | null): Promise<boolean> {
  const commit = fixedCommit?.trim().toLowerCase() || null;
  if (commit !== null && !/^[0-9a-f]{7,40}$/.test(commit)) return false;
  const scope = feedbackReadableBy(actor);
  const n = scope.values.length;
  const rows = await db.query<{ id: string }>(
    `update feedback_reports f
        set status = 'resolved', resolved_at = now(), fixed_commit = $${n + 2}
      where f.id::text = $${n + 1} and f.status = 'open' and (${scope.text})
      returning f.id`,
    [...scope.values, id, commit],
  );
  return rows.length === 1;
}
