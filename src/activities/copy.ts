/**
 * Copying an activity, within its course or into another the teacher teaches
 * (D-034: reuse lives in each course's Activities tab). The copy is a draft
 * with the same title, tool, settings, points and materials. Nothing
 * student-side comes along: no attempts, results or grades, and no Canvas
 * link, so the copy is assigned on its own.
 */

import { copyGuides } from "@/content/guide";
import { copyContent } from "@/content/store";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { activityMaterials, setActivityMaterials } from "./materials";
import { activityForKey, createActivity, getTaughtActivity } from "./store";

/**
 * Copies the activity into `toCourseId` (its own course for a plain copy).
 * Materials from another course are copied into the target course, since an
 * activity only uses its own course's materials. `creationKey` is
 * client-generated: a retry with the same key returns the first copy.
 */
export async function copyActivity(
  db: Db,
  actor: Actor,
  activityId: string,
  toCourseId: string,
  creationKey: string,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const existing = await activityForKey(db, actor, creationKey);
  if (existing) return { ok: true, id: existing };

  const source = await getTaughtActivity(db, actor, activityId);
  if (!source) return { ok: false, reason: "That assignment isn't one of yours." };

  return db.transaction(async (tx) => {
    const created = await createActivity(tx, actor, toCourseId, creationKey, {
      tool: source.tool,
      title: source.title,
      settings: source.settings,
      points: source.points,
    });
    if (!created.ok) return created;

    const { readings, guides } = await activityMaterials(tx, source.id);
    const contentIds = await copyContent(tx, actor, source.courseId, toCourseId, readings.map((r) => r.id));
    const guideIds = await copyGuides(tx, actor, source.courseId, toCourseId, guides.map((g) => g.id));
    if (!contentIds || !guideIds) throw new Error("Couldn't copy an activity's materials");

    const attached = await setActivityMaterials(tx, actor, created.id, { contentIds, guideIds });
    if (!attached.ok) throw new Error(`Couldn't attach a copied activity's materials: ${attached.reason}`);
    return created;
  });
}
