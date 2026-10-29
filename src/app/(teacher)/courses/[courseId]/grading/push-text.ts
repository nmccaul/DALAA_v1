/**
 * What "Send grades to Canvas" tells the teacher: the push plan's categories
 * in plain words, the result summary carried back to the Grading tab in the
 * URL, and why Canvas refused.
 */

import type { PushSummary, SendResult } from "@/lti/grades";
import type { PushCategory } from "@/results/push-plan";

export const CATEGORY: Record<PushCategory, { title: string; detail: string }> = {
  send: { title: "Will be sent", detail: "New or higher than the grade in Canvas." },
  lowered: {
    title: "Lower than the grade in Canvas",
    detail: "Canvas has a higher grade for these students. They're sent only if you tick the box.",
  },
  changed_in_canvas: {
    title: "Changed in Canvas",
    detail: "Someone changed these grades in Canvas after DALAA sent them. DALAA won't overwrite them.",
  },
  not_in_canvas: {
    title: "Not known to Canvas yet",
    detail: "Sync the class list on the Students tab, or have them open DALAA from Canvas once, then send again.",
  },
  points_mismatch: {
    title: "Graded out of different points",
    detail: "These were graded when the assignment was worth different points. DALAA won't rescale them.",
  },
  unchanged: { title: "Already in Canvas", detail: "Canvas already has this grade." },
  not_graded: { title: "Not graded yet", detail: "Nothing is sent for them. They don't get a zero." },
};

/** The order the preview lists categories in: what needs a decision first. */
export const PREVIEW_ORDER: PushCategory[] = [
  "lowered",
  "changed_in_canvas",
  "not_in_canvas",
  "points_mismatch",
  "send",
  "unchanged",
  "not_graded",
];

type Refusal = Extract<SendResult, { ok: false }>["reason"];

export const REFUSAL: Record<Refusal, string> = {
  not_found: "That assignment isn't published in a course you teach.",
  not_linked: "This course wasn't opened from Canvas, so DALAA can't send its grades there.",
  no_gradebook: "Canvas didn't tell DALAA where this course's gradebook is. Open DALAA from the course in Canvas once, then try again.",
  refused: "Canvas refused the request. Check that DALAA is still installed in this course.",
  unavailable: "Canvas didn't answer. Nothing was recorded as sent; try again in a minute.",
  points_mismatch: "The Canvas column is out of different points than this assignment, so nothing was sent.",
  in_progress: "These grades are still being sent. Reload in a moment.",
  bad_key: "Something went wrong with that click. Reload the page and try again.",
  needs_preview: "There's something to decide first.",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The Grading tab's query for a finished push, and back. */
export function summaryQuery(activityId: string, s: PushSummary): URLSearchParams {
  const q = new URLSearchParams({ pushed: activityId, sent: String(s.sent), failed: String(s.failed) });
  for (const [category, n] of Object.entries(s.skipped)) if (n) q.set(`skip_${category}`, String(n));
  return q;
}

export function readSummary(q: Record<string, string | string[] | undefined>): PushSummary {
  const n = (key: string) => {
    const v = Number(q[key]);
    return Number.isInteger(v) && v > 0 ? v : 0;
  };
  const skipped: PushSummary["skipped"] = {};
  for (const category of PREVIEW_ORDER) if (n(`skip_${category}`)) skipped[category] = n(`skip_${category}`);
  return { sent: n("sent"), failed: n("failed"), skipped };
}

/** The result, one sentence per kind, for the line under the assignment. */
export function summaryLines(s: PushSummary): string[] {
  const lines = [s.sent ? `Sent ${plural(s.sent, "grade", "grades")} to Canvas.` : "No new grades to send."];
  if (s.failed) lines.push(`Canvas didn't confirm ${plural(s.failed, "grade", "grades")}. Send again to retry them.`);
  for (const category of PREVIEW_ORDER) {
    const n = s.skipped[category];
    if (n) lines.push(`${CATEGORY[category].title}: ${plural(n, "student", "students")}.`);
  }
  return lines;
}
