/**
 * Saving activities for every tool. The chassis stores a tool's settings as
 * given: the tool checks them against its own schema before calling here
 * (CLAUDE.md: each tool has its own schema; the core never branches on a tool).
 * Only a course's teachers create, read or publish its activities.
 */

import { getTaughtGuide } from "@/content/guide";
import { getTaughtCourse } from "@/courses/queries";
import { and, coursesTaughtBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";

export type NewActivity = {
  tool: string;
  title: string;
  settings: Record<string, unknown>;
  /** NULL until the activity has points; publishing needs them. */
  points: number | null;
  contentId: string | null;
  /** The AI-only guide (src/content/guide.ts); NULL when there's none. */
  guideId: string | null;
};

export type TaughtActivity = {
  id: string;
  courseId: string;
  tool: string;
  title: string;
  status: "draft" | "published";
  points: number | null;
  settings: Record<string, unknown>;
  contentId: string | null;
  guideId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The activity a create with this client-generated key already made, if any. */
export async function activityForKey(db: Db, actor: Actor, creationKey: string): Promise<string | null> {
  if (!UUID.test(creationKey)) return null;
  const [row] = await db.query<{ id: string }>(
    "select id from activities where creation_key = $1 and created_by = $2",
    [creationKey, actor.userId],
  );
  return row?.id ?? null;
}

/**
 * Saves a new draft. `creationKey` is client-generated: a retry with the same
 * key returns the first activity instead of a second one.
 */
export async function createActivity(
  db: Db,
  actor: Actor,
  courseId: string,
  creationKey: string,
  activity: NewActivity,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!UUID.test(creationKey)) throw new Error("Activity creation key must be a UUID");
  if (!(await getTaughtCourse(db, actor, courseId))) return { ok: false, reason: "That course isn't one you teach." };

  const inserted = await db.transaction(async (tx) => {
    // Through text: postgres.js would otherwise send the JSON string as a JSON string.
    const [row] = await tx.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, points, content_id, guide_id, creation_key, created_by)
       values ($1, $2, $3, $4::text::jsonb, $5, $6, $7, $8, $9)
       on conflict (creation_key) do nothing
       returning id`,
      [courseId, activity.tool, activity.title, JSON.stringify(activity.settings), activity.points, activity.contentId, activity.guideId, creationKey, actor.userId],
    );
    // The materials' readers use activity_materials (src/activities/materials.ts); until
    // every writer goes through setActivityMaterials, the two columns are mirrored there.
    if (row) {
      await tx.query(
        `insert into activity_materials (activity_id, course_id, content_id, guide_id, position)
         select $1, $2, m.content_id, m.guide_id, m.position
           from (values ($3::uuid, null::uuid, 0), (null::uuid, $4::uuid, 1)) as m(content_id, guide_id, position)
          where m.content_id is not null or m.guide_id is not null`,
        [row.id, courseId, activity.contentId, activity.guideId],
      );
    }
    return row;
  });
  if (inserted) return { ok: true, id: inserted.id };

  const [existing] = await db.query<{ id: string; course_id: string; created_by: string }>(
    "select id, course_id, created_by from activities where creation_key = $1",
    [creationKey],
  );
  if (existing.created_by !== actor.userId || existing.course_id !== courseId) {
    throw new Error("Activity key belongs to someone else");
  }
  return { ok: true, id: existing.id };
}

/** One activity, for a teacher of its course; null for anyone else or a made-up id. */
export async function getTaughtActivity(db: Db, actor: Actor, activityId: string): Promise<TaughtActivity | null> {
  if (!UUID.test(activityId)) return null;
  const where = and({ text: "a.id = $1", values: [activityId] }, coursesTaughtBy(actor, "c"));
  const [row] = await db.query<TaughtActivity>(
    `select a.id, a.course_id as "courseId", a.tool, a.title, a.status, a.points::float8 as points,
            a.settings, a.content_id as "contentId", a.guide_id as "guideId"
       from activities a
       join courses c on c.id = a.course_id
      where ${where.text}`,
    where.values,
  );
  return row ?? null;
}

/** Makes a draft visible to students. Publishing twice is a no-op; an activity without points can't be published. */
export async function publishActivity(
  db: Db,
  actor: Actor,
  activityId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity) return { ok: false, reason: "That assignment isn't one of yours." };
  if (activity.points === null) return { ok: false, reason: "Give it points before you publish it." };
  await db.query("update activities set status = 'published', updated_at = now() where id = $1", [activity.id]);
  return { ok: true };
}

export type ActivityChanges = Pick<NewActivity, "title" | "settings" | "points">;

/** Replaces a draft's or published activity's title, settings and points. Saving the same thing twice changes nothing. */
export async function updateActivity(
  db: Db,
  actor: Actor,
  activityId: string,
  changes: ActivityChanges,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity) return { ok: false, reason: "That assignment isn't one of yours." };
  // Through text, as in createActivity.
  await db.query(
    "update activities set title = $2, settings = $3::text::jsonb, points = $4, updated_at = now() where id = $1",
    [activity.id, changes.title, JSON.stringify(changes.settings), changes.points],
  );
  return { ok: true };
}

/**
 * Attaches an AI-only guide from the same course (src/content/guide.ts), or
 * removes it with NULL. Doing it twice changes nothing. Like other edits it
 * reaches attempts already under way: the guide isn't in their settings copy (D-031).
 */
export async function setActivityGuide(
  db: Db,
  actor: Actor,
  activityId: string,
  guideId: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity) return { ok: false, reason: "That assignment isn't one of yours." };
  if (guideId !== null && !(await getTaughtGuide(db, actor, activity.courseId, guideId))) {
    return { ok: false, reason: "We couldn't find those AI instructions. Add them again." };
  }
  await db.transaction(async (tx) => {
    await tx.query("update activities set guide_id = $2, updated_at = now() where id = $1", [activity.id, guideId]);
    // Mirrored as in createActivity: this guide replaces the activity's AI-only notes.
    await tx.query("delete from activity_materials where activity_id = $1 and guide_id is not null", [activity.id]);
    if (guideId !== null) {
      await tx.query(
        `insert into activity_materials (activity_id, course_id, guide_id, position)
         select $1, $2, $3, coalesce(max(position) + 1, 0) from activity_materials where activity_id = $1`,
        [activity.id, activity.courseId, guideId],
      );
    }
  });
  return { ok: true };
}
