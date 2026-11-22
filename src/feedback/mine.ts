/**
 * "Your feedback" on the Help tab (feedback 3df5d2ca, 107d2eb9): every report
 * the signed-in person sent, and where each one stands, so they can see what
 * was fixed and check before sending the same thing twice. Only their own
 * reports; no screenshots, and none of the fixer's notes (they're written for
 * the team). Release notes stay separate: they list what changed, asked for
 * or not.
 */

import { feedbackSentBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import type { FixStatus } from "./fixes";
import type { Kind } from "./report";

export type MyReport = {
  id: string;
  kind: Kind;
  note: string;
  createdAt: Date;
  status: "open" | "resolved";
  resolvedAt: Date | null;
  fixStatus: FixStatus | null;
  /** When the fix status last changed; NULL with no fix status. */
  fixAt: Date | null;
};

export type Standing = {
  /** What the reporter reads. */
  label: string;
  /** Fixed: shown crossed off. Closed without a change: done, but not crossed off. */
  done: "fixed" | "closed" | false;
  /** When it was fixed or closed; NULL while it's still open. */
  at: Date | null;
};

/** Where one report stands, in the reporter's words. */
export function standing(r: Pick<MyReport, "status" | "resolvedAt" | "fixStatus" | "fixAt">): Standing {
  if (r.status === "resolved") return { label: "Fixed", done: "fixed", at: r.resolvedAt };
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
export async function listMyReports(db: Db, actor: Actor): Promise<MyReport[]> {
  const scope = feedbackSentBy(actor, "f");
  return db.query<MyReport>(
    `select f.id, f.kind, f.note, f.created_at as "createdAt", f.status, f.resolved_at as "resolvedAt",
            x.status as "fixStatus", x.updated_at as "fixAt"
       from feedback_reports f
       left join feedback_fixes x on x.report_id = f.id
      where ${scope.text}
      order by f.created_at desc, f.id`,
    scope.values,
  );
}
