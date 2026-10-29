/**
 * Creating and publishing a Study Chat: the AI drafts it from the teacher's
 * content (draft.ts), and it's saved as a draft through the chassis
 * (src/activities/store.ts) only once the draft fits the schema.
 */

import type { LanguageModel } from "ai";
import { activityForKey, createActivity, getTaughtActivity, publishActivity } from "@/activities/store";
import { getContent } from "@/content/store";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { draftSettings } from "./draft";
import type { ModeSlug } from "./modes";
import { rubricPoints, StudyChatSettings } from "./schema";

/** This tool's slug in src/tools/catalog.ts (create.test.ts checks they match). */
export const STUDY_CHAT = "study-chat";

export type CreateRequest = {
  contentId: string;
  mode: ModeSlug | "suggest";
  /** Client-generated: a retry returns the first activity and drafts nothing new. */
  creationKey: string;
};

export type CreateResult = { ok: true; activityId: string } | { ok: false; reason: string };

export async function createStudyChat(
  db: Db,
  model: LanguageModel,
  actor: Actor,
  courseId: string,
  request: CreateRequest,
): Promise<CreateResult> {
  const already = await activityForKey(db, actor, request.creationKey);
  if (already) return { ok: true, activityId: already };

  const content = await getContent(db, actor, courseId, request.contentId);
  if (!content) return { ok: false, reason: "We couldn't find that material. Add it again." };

  const draft = await draftSettings(
    db,
    model,
    { userId: actor.userId, courseId },
    { content: content.body, contentName: content.name, mode: request.mode },
  );
  if (!draft.ok) return draft;

  const saved = await createActivity(db, actor, courseId, request.creationKey, {
    tool: STUDY_CHAT,
    title: draft.settings.scenarios[0].title,
    settings: draft.settings,
    points: rubricPoints(draft.settings),
    contentId: content.id,
  });
  return saved.ok ? { ok: true, activityId: saved.id } : saved;
}

/** Publishes a Study Chat whose settings still fit the schema. */
export async function publishStudyChat(
  db: Db,
  actor: Actor,
  activityId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity || activity.tool !== STUDY_CHAT) return { ok: false, reason: "That assignment isn't one of yours." };
  if (!StudyChatSettings.safeParse(activity.settings).success) {
    return { ok: false, reason: "Some settings need fixing before you publish." };
  }
  return publishActivity(db, actor, activityId);
}
