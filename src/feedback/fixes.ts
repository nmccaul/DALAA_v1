/**
 * What the bug loop (D-030) did about each feedback report
 * (db/migrations/*_feedback_fixes.sql). Used by `npm run feedback`
 * (scripts/feedback.mts), which runs outside any session: these functions take
 * no actor, so nothing in the app calls them. The admin page reads the fix row
 * through `getReport` (store.ts) instead.
 */

import type { Db } from "@/db/types";
import type { Kind } from "./report";

export const FIX_STATUSES = ["in_progress", "fixed", "wont_fix", "cant_reproduce", "needs_nathan"] as const;
export type FixStatus = (typeof FIX_STATUSES)[number];

export const isFixStatus = (s: string): s is FixStatus => (FIX_STATUSES as readonly string[]).includes(s);

export type Fix = {
  status: FixStatus;
  branch: string | null;
  prUrl: string | null;
  note: string | null;
  commit: string | null;
};

const SHA = /^[0-9a-f]{7,40}$/;

/** Runs `fn` in a read-only transaction, so a stray write fails instead of landing. */
export function readOnly<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("set transaction read only");
    return fn(tx);
  });
}

/** The full id for an id or a prefix of it, or why there isn't exactly one. */
export async function findReport(db: Db, idOrPrefix: string): Promise<{ id: string } | { problem: string }> {
  const prefix = idOrPrefix.trim().toLowerCase();
  if (!/^[0-9a-f-]{8,36}$/.test(prefix)) return { problem: "Give a report id or its first 8 characters." };
  const rows = await db.query<{ id: string }>(
    "select id from feedback_reports where id::text like $1 order by created_at desc limit 2",
    [`${prefix}%`],
  );
  if (rows.length === 1) return rows[0];
  return { problem: rows.length ? `More than one report starts with ${prefix}; give more of the id.` : `No report starts with ${prefix}.` };
}

export type OpenReport = { id: string; kind: Kind; note: string; url: string; createdAt: Date; fixStatus: FixStatus | null };

/**
 * Reports still waiting on the loop: open, and either untouched or only
 * claimed (`in_progress`). Bugs and confusing pages come before ideas, oldest first.
 */
export async function openReports(db: Db): Promise<OpenReport[]> {
  return db.query<OpenReport>(
    `select f.id, f.kind, f.note, f.url, f.created_at as "createdAt", x.status as "fixStatus"
       from feedback_reports f
       left join feedback_fixes x on x.report_id = f.id
      where f.status = 'open' and (x.status is null or x.status = 'in_progress')
      order by f.kind = 'idea', f.created_at, f.id`,
  );
}

function age(from: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (24 * 60))}d`;
}

function path(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** One line per report: short id, kind, age, page path, the start of the note, and a claim if there is one. */
export function listLine(r: OpenReport, now = new Date()): string {
  const note = r.note.replace(/\s+/g, " ").trim();
  const start = note.length > 80 ? `${note.slice(0, 79)}…` : note;
  return [r.id.slice(0, 8), r.kind, age(r.createdAt, now), path(r.url), start, r.fixStatus ?? ""].join("\t").trimEnd();
}

export async function getFix(db: Db, reportId: string): Promise<Fix | null> {
  const [row] = await db.query<Fix>(
    `select status, branch, pr_url as "prUrl", note, commit_sha as commit from feedback_fixes where report_id = $1`,
    [reportId],
  );
  return row ?? null;
}

/**
 * Marks a report as being worked on. Refused when another pass already holds
 * it or it's been closed, so two passes never take the same report.
 */
export async function claimReport(db: Db, reportId: string, branch: string | null = null): Promise<boolean> {
  const rows = await db.query<{ report_id: string }>(
    `insert into feedback_fixes (report_id, status, branch)
     select f.id, 'in_progress', $2 from feedback_reports f where f.id = $1 and f.status = 'open'
     on conflict (report_id) do nothing
     returning report_id`,
    [reportId, branch],
  );
  return rows.length === 1;
}

export type RecordInput = { status: FixStatus; branch?: string | null; prUrl?: string | null; note?: string | null; commit?: string | null };

/**
 * Writes what happened. Fields left out keep what an earlier record said, so
 * `record <id> fixed --commit …` doesn't drop the PR link. Returns the problem
 * when the input is refused.
 */
export async function recordFix(db: Db, reportId: string, input: RecordInput): Promise<{ ok: true } | { ok: false; problem: string }> {
  if (!isFixStatus(input.status)) return { ok: false, problem: `Status must be one of ${FIX_STATUSES.join(", ")}.` };
  const commit = input.commit?.trim().toLowerCase() || null;
  if (commit !== null && !SHA.test(commit)) return { ok: false, problem: "That isn't a commit SHA." };
  const prUrl = input.prUrl?.trim() || null;
  if (prUrl !== null && !prUrl.startsWith("https://")) return { ok: false, problem: "The PR link must start with https://." };
  const rows = await db.query<{ report_id: string }>(
    `insert into feedback_fixes (report_id, status, branch, pr_url, note, commit_sha)
     select f.id, $2, $3, $4, $5, $6 from feedback_reports f where f.id = $1
     on conflict (report_id) do update
        set status = excluded.status,
            branch = coalesce(excluded.branch, feedback_fixes.branch),
            pr_url = coalesce(excluded.pr_url, feedback_fixes.pr_url),
            note = coalesce(excluded.note, feedback_fixes.note),
            commit_sha = coalesce(excluded.commit_sha, feedback_fixes.commit_sha),
            updated_at = now()
     returning report_id`,
    [reportId, input.status, input.branch?.trim() || null, prUrl, input.note?.trim() || null, commit],
  );
  return rows.length === 1 ? { ok: true } : { ok: false, problem: "No such report." };
}

/**
 * The fix is merged and deployed: the report is resolved with the merge's SHA
 * and its fix row says `fixed`, together or not at all. Resolving twice keeps
 * the first time and commit, as the admin page's "Mark resolved" does.
 */
export async function resolveFixed(db: Db, reportId: string, sha: string): Promise<{ ok: true } | { ok: false; problem: string }> {
  const commit = sha.trim().toLowerCase();
  if (!SHA.test(commit)) return { ok: false, problem: "That isn't a commit SHA." };
  return db.transaction(async (tx) => {
    const resolved = await tx.query<{ id: string }>(
      `update feedback_reports set status = 'resolved', resolved_at = now(), fixed_commit = $2
        where id = $1 and status = 'open' returning id`,
      [reportId, commit],
    );
    if (resolved.length === 0) return { ok: false, problem: "That report isn't open." };
    await recordFix(tx, reportId, { status: "fixed", commit });
    return { ok: true };
  });
}
