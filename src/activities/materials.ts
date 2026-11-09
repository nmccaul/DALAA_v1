/**
 * An activity's materials (db/migrations/*_activity_materials.sql): any number
 * of readings, which students read, and AI-only notes, which they never do
 * (D-034). Guides are read through src/content/guide.ts, the only code that
 * reads `course_guides`.
 *
 * `activityMaterials` returns the AI-only notes too, so it's for the model and
 * the activity's teacher; a student request uses `activityReadings`.
 */

import { activityGuides, guidesInCourse, type Guide } from "@/content/guide";
import type { SavedContent } from "@/content/store";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { getTaughtActivity } from "./store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The most an activity's readings and AI-only notes may hold together: every
 * model call about the activity carries all of them.
 */
export const MAX_MATERIALS_CHARS = 150_000;

/** NULL when materials of these lengths fit together; otherwise the plain sentence to show. */
export function materialsTooLong(lengths: readonly number[]): string | null {
  const total = lengths.reduce((sum, n) => sum + n, 0);
  if (total <= MAX_MATERIALS_CHARS) return null;
  return `Together these materials are ${total.toLocaleString("en-US")} characters; the limit is ${MAX_MATERIALS_CHARS.toLocaleString("en-US")}. Leave one out or use a shorter excerpt.`;
}

export type ActivityMaterials = { readings: SavedContent[]; guides: (Guide & { id: string })[] };

/** The readings of an activity, in the teacher's order. Safe for a student request: no AI-only notes. */
export async function activityReadings(db: Db, activityId: string): Promise<SavedContent[]> {
  if (!UUID.test(activityId)) return [];
  return db.query<SavedContent>(
    `select c.id, c.source, c.name, c.body
       from activity_materials m join course_content c on c.id = m.content_id
      where m.activity_id = $1
      order by m.position`,
    [activityId],
  );
}

/** Every material of an activity, each kind in the teacher's order. Never for a student request. */
export async function activityMaterials(db: Db, activityId: string): Promise<ActivityMaterials> {
  const [readings, guides] = await Promise.all([activityReadings(db, activityId), activityGuides(db, activityId)]);
  return { readings, guides };
}

/**
 * Replaces an activity's materials with these, readings first, each list in
 * the order given. Saving the same set twice changes nothing. Refuses an
 * activity the actor doesn't teach, a material from another course, and a set
 * longer than MAX_MATERIALS_CHARS.
 */
export async function setActivityMaterials(
  db: Db,
  actor: Actor,
  activityId: string,
  materials: { contentIds: readonly string[]; guideIds: readonly string[] },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity) return { ok: false, reason: "That assignment isn't one of yours." };

  const contentIds = [...new Set(materials.contentIds)];
  const guideIds = [...new Set(materials.guideIds)];
  const valid = contentIds.filter((id) => UUID.test(id));
  const readings = valid.length
    ? await db.query<{ id: string; chars: number }>(
        "select id, length(body)::int as chars from course_content where course_id = $1 and id = any($2::uuid[])",
        [activity.courseId, valid],
      )
    : [];
  const guides = await guidesInCourse(db, activity.courseId, guideIds);
  if (readings.length !== contentIds.length || guides.size !== guideIds.length) {
    return { ok: false, reason: "We couldn't find one of those materials in this course. Add it again." };
  }
  const tooLong = materialsTooLong([...readings.map((r) => r.chars), ...guides.values()]);
  if (tooLong) return { ok: false, reason: tooLong };

  await db.transaction(async (tx) => {
    await tx.query("delete from activity_materials where activity_id = $1", [activity.id]);
    const rows = [
      ...contentIds.map((id) => ({ contentId: id, guideId: null })),
      ...guideIds.map((id) => ({ contentId: null, guideId: id })),
    ];
    for (const [position, row] of rows.entries()) {
      await tx.query(
        "insert into activity_materials (activity_id, course_id, content_id, guide_id, position) values ($1, $2, $3, $4, $5)",
        [activity.id, activity.courseId, row.contentId, row.guideId, position],
      );
    }
    // activities.content_id / guide_id are retired (kept, no longer written): activity_materials is the list.
    await tx.query("update activities set updated_at = now() where id = $1", [activity.id]);
  });
  return { ok: true };
}

type Change = { ok: true } | { ok: false; reason: string };

/** Adds one AI-only note from the same course after the others. Adding it twice changes nothing. */
export async function addActivityGuide(db: Db, actor: Actor, activityId: string, guideId: string): Promise<Change> {
  return changeGuides(db, actor, activityId, (ids) => [...ids, guideId]);
}

/** Takes one AI-only note off an activity; the chat and grader stop reading it. The note stays in the course. */
export async function removeActivityGuide(db: Db, actor: Actor, activityId: string, guideId: string): Promise<Change> {
  return changeGuides(db, actor, activityId, (ids) => ids.filter((id) => id !== guideId));
}

async function changeGuides(db: Db, actor: Actor, activityId: string, change: (ids: string[]) => string[]): Promise<Change> {
  if (!(await getTaughtActivity(db, actor, activityId))) return { ok: false, reason: "That assignment isn't one of yours." };
  const { readings, guides } = await activityMaterials(db, activityId);
  return setActivityMaterials(db, actor, activityId, {
    contentIds: readings.map((r) => r.id),
    guideIds: change(guides.map((g) => g.id)),
  });
}
