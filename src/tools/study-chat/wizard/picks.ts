/**
 * Wizard step 1, Materials: what the teacher ticks, as form values, and the
 * saved materials it comes to. A ticked Canvas Page or File nobody has saved
 * yet is saved now (as something students read), so the steps after it only
 * ever carry saved ids, in the URL until the draft exists (ralph/PLAN.md).
 */

import { createHash } from "node:crypto";
import { canvasPickValue, parseCanvasPick, saveFromCanvas, type CanvasPick } from "@/canvas/content";
import type { TeacherCanvas } from "@/canvas/connection";
import type { MaterialRow } from "@/content/materials";
import { getTaughtCourse } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import type { MaterialIds } from "./query";

export type WizardPicks = MaterialIds & { canvas: CanvasPick[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A Materials row's checkbox value: `content:<id>`, `guide:<id>`, or the Canvas pick's `page:`/`file:` value. */
export function pickValue(row: MaterialRow): string | null {
  if (row.savedId) return `${row.seenBy === "ai" ? "guide" : "content"}:${row.savedId}`;
  return row.canvas ? canvasPickValue(row.canvas) : null;
}

/** The ticked values, sorted into saved readings, saved AI-only notes and Canvas items; anything else is dropped. */
export function parsePicks(values: readonly string[]): WizardPicks {
  const picks: WizardPicks = { contentIds: [], guideIds: [], canvas: [] };
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    const [kind, ...rest] = value.split(":");
    const id = rest.join(":").toLowerCase();
    if (kind === "content" && UUID.test(id)) picks.contentIds.push(id);
    else if (kind === "guide" && UUID.test(id)) picks.guideIds.push(id);
    else {
      const canvas = parseCanvasPick(value);
      if (canvas) picks.canvas.push(canvas);
    }
  }
  return picks;
}

/**
 * The creation key for saving one Canvas pick: derived from the form's own
 * client-generated key, so submitting the same form twice saves each item once.
 */
export function pickCreationKey(formKey: string, pick: CanvasPick): string {
  const hex = createHash("sha256").update(`${formKey}\n${canvasPickValue(pick)}`).digest("hex");
  // Shaped as a version-4 UUID so it fits the uuid creation_key columns.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export type SavedPicks = ({ ok: true } & MaterialIds) | { ok: false; reason: string; reconnect: boolean };

/**
 * Checks the saved picks are this course's, saves the Canvas ones, and returns
 * every id in the order ticked. At least one thing students read is required:
 * a Study Chat is about something they study.
 */
export async function savePicks(
  db: Db,
  actor: Actor,
  canvas: TeacherCanvas | null,
  courseId: string,
  formKey: string,
  picks: WizardPicks,
): Promise<SavedPicks> {
  const refuse = (reason: string, reconnect = false): SavedPicks => ({ ok: false, reason, reconnect });
  if (picks.contentIds.length + picks.canvas.length === 0) {
    return refuse("Pick at least one material students read (Students + AI).");
  }
  if (!UUID.test(formKey)) return refuse("Something went wrong with this page. Reload it and try again.");

  if (!(await getTaughtCourse(db, actor, courseId))) return refuse("That course isn't one you teach.");

  const [{ found }] = await db.query<{ found: number }>(
    `select (select count(*) from course_content where course_id = $1 and id = any($2::uuid[]))::int
          + (select count(*) from course_guides where course_id = $1 and id = any($3::uuid[]))::int as found`,
    [courseId, picks.contentIds, picks.guideIds],
  );
  if (found !== picks.contentIds.length + picks.guideIds.length) {
    return refuse("One of those materials isn't in this course anymore. Reload the page and pick again.");
  }

  const contentIds = [...picks.contentIds];
  if (picks.canvas.length > 0 && !canvas) return refuse("Connect Canvas to use its Pages and Files.", true);
  for (const pick of picks.canvas) {
    const saved = await saveFromCanvas(db, actor, canvas!, courseId, pickCreationKey(formKey, pick), pick);
    if (!saved.ok) return saved;
    if (!contentIds.includes(saved.content.id)) contentIds.push(saved.content.id);
  }
  return { ok: true, contentIds, guideIds: picks.guideIds };
}
