/**
 * Saving activities for every tool. The chassis stores a tool's settings as
 * given: the tool checks them against its own schema before calling here
 * (CLAUDE.md: each tool has its own schema; the core never branches on a tool).
 * Only a course's teachers create, read or publish its activities.
 */

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

  // Through text: postgres.js would otherwise send the JSON string as a JSON string.
  const [inserted] = await db.query<{ id: string }>(
    `insert into activities (course_id, tool, title, settings, points, content_id, creation_key, created_by)
     values ($1, $2, $3, $4::text::jsonb, $5, $6, $7, $8)
     on conflict (creation_key) do nothing
     returning id`,
    [courseId, activity.tool, activity.title, JSON.stringify(activity.settings), activity.points, activity.contentId, creationKey, actor.userId],
  );
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
            a.settings, a.content_id as "contentId"
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
