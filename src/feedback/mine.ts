/**
 * "Your feedback" on the Help tab (feedback 3df5d2ca, 107d2eb9): every report
 * the signed-in person sent, and where each one stands, so they can see what
 * was fixed and check before sending the same thing twice. Only their own
 * reports; no screenshots, and none of the fixer's notes (they're written for
 * the team). An admin can also list everyone's there (D-042), the same rows
 * the Settings inbox reads. Release notes stay separate: they list what
 * changed, asked for or not.
 */

import { feedbackReadableBy, feedbackSentBy, type Actor, type Scope } from "@/db/scope";
import type { Db } from "@/db/types";
import type { FixStatus } from "./fixes";
import type { Kind, Priority } from "./report";

export type MyReport = {
  id: string;
  kind: Kind;
  /** NULL: sent before priorities existed, and not triaged yet. */
  priority: Priority | null;
  note: string;
  /** Who sent it, as their account names them. */
  reporter: string;
  /** The page it was sent from (its area: area.ts). */
  url: string;
  createdAt: Date;
  status: "open" | "resolved";
  resolvedAt: Date | null;
  fixStatus: FixStatus | null;
  /** When the fix status last changed; NULL with no fix status. */
  fixAt: Date | null;
  /** When the sender said "I think this is fixed" (feedback 2e7b873b); NULL: they haven't. */
  reporterFixedAt: Date | null;
};

export type Standing = {
  /** What the reporter reads. */
  label: string;
  /** Fixed: shown crossed off. Closed without a change: done, but not crossed off. */
  done: "fixed" | "closed" | false;
  /** When it was fixed or closed; NULL while it's still open. */
  at: Date | null;
};

/** What an open report says once its sender thinks it's fixed, until an admin resolves it. */
export const REPORTER_FIXED = "Fixed? Waiting for an admin to confirm";

/** Where one report stands, in the reporter's words. */
export function standing(r: Pick<MyReport, "status" | "resolvedAt" | "fixStatus" | "fixAt"> & { reporterFixedAt?: Date | null }): Standing {
  if (r.status === "resolved") return { label: "Fixed", done: "fixed", at: r.resolvedAt };
  const closed = r.fixStatus === "wont_fix" || r.fixStatus === "cant_reproduce";
  if (r.reporterFixedAt && !closed) return { label: REPORTER_FIXED, done: false, at: null };
  switch (r.fixStatus) {
    case "fixed":
      return { label: "Fixed, coming in the next update", done: false, at: null };
    case "in_progress":
      return { label: "Being worked on", done: false, at: null };
    case "needs_nathan":
      return { label: "Waiting on a decision", done: false, at: null };
    case "wont_fix":
      return { label: "Closed without a change", done: "closed", at: r.fixAt };
    case "cant_reproduce":
      return { label: "Closed: we couldn't make it happen", done: "closed", at: r.fixAt };
    default:
      return { label: "Received", done: false, at: null };
  }
}

/** The actor's own reports, newest first. */
export function listMyReports(db: Db, actor: Actor): Promise<MyReport[]> {
  return listReportsIn(db, feedbackSentBy(actor, "f"));
}

/** Everyone's reports, newest first: an admin's view; nothing for anyone else. */
export function listEveryonesReports(db: Db, actor: Actor): Promise<MyReport[]> {
  return listReportsIn(db, feedbackReadableBy(actor));
}

function listReportsIn(db: Db, scope: Scope): Promise<MyReport[]> {
  return db.query<MyReport>(
    `select f.id, f.kind, f.priority, f.note, u.display_name as reporter, f.url, f.created_at as "createdAt", f.status, f.resolved_at as "resolvedAt",
            x.status as "fixStatus", x.updated_at as "fixAt", f.reporter_fixed_at as "reporterFixedAt"
       from feedback_reports f
       join users u on u.id = f.user_id
       left join feedback_fixes x on x.report_id = f.id
      where ${scope.text}
      order by f.created_at desc, f.id`,
    scope.values,
  );
}

/**
 * "I think this is fixed" on the sender's own open report (feedback 2e7b873b).
 * The report stays open: an admin still checks and resolves it. Saying it
 * twice keeps the first time. False for anyone else's report or a closed one.
 */
export async function sayFixed(db: Db, actor: Actor, id: string): Promise<boolean> {
  const scope = feedbackSentBy(actor, "f");
  const n = scope.values.length;
  const rows = await db.query<{ id: string }>(
    `update feedback_reports f set reporter_fixed_at = coalesce(f.reporter_fixed_at, now())
      where f.id::text = $${n + 1} and f.status = 'open' and (${scope.text})
      returning f.id`,
    [...scope.values, id],
  );
  return rows.length === 1;
}
