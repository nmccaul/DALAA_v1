/**
 * Creating and publishing a Study Chat: the AI drafts it from the teacher's
 * content (draft.ts), and it's saved as a draft through the chassis
 * (src/activities/store.ts) only once the draft fits the schema.
 */

import type { LanguageModel } from "ai";
import { setActivityMaterials } from "@/activities/materials";
import { activityForKey, createActivity, getTaughtActivity, publishActivity, updateActivity } from "@/activities/store";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { draftSettings } from "./draft";
import type { ModeSlug } from "./modes";
import { rubricPoints, settingProblems, StudyChatSettings } from "./schema";
import { MAX_REASON_CHARS } from "./suggest";
import { pickedMaterials } from "./wizard/picks";
import type { Minutes } from "./wizard/query";

/** This tool's slug in src/tools/catalog.ts (create.test.ts checks they match). */
export const STUDY_CHAT = "study-chat";

export type CreateRequest = {
  /** What students read (`course_content`), in the teacher's order; at least one. */
  contentIds: readonly string[];
  /** The teacher's AI-only notes (src/content/guide.ts), in their order; may be empty. */
  guideIds: readonly string[];
  mode: ModeSlug | "suggest";
  /** The "Students bring their own work" switch: the draft keeps it as set here (on for a mode that needs it). */
  studentWork: boolean;
  /** The "Show students their progress" switch; off when missing. */
  showProgress?: boolean;
  /** The wizard's learning goal (step 2), kept word for word; missing: the AI writes one. */
  goal?: string | null;
  /** The wizard's "About how long?" (step 2), a hint for the draft. */
  minutes?: Minutes | null;
  /** Why the wizard suggested this type (step 3), kept for the teacher only (`settings.typeReason`). */
  typeReason?: string | null;
  /** Client-generated: a retry returns the first activity and drafts nothing new. */
  creationKey: string;
};

export type CreateResult = { ok: true; activityId: string } | { ok: false; reason: string };

/** The longest goal a Study Chat keeps (schema.ts `goal`). */
const MAX_GOAL_CHARS = 1000;

export async function createStudyChat(
  db: Db,
  model: LanguageModel,
  actor: Actor,
  courseId: string,
  request: CreateRequest,
): Promise<CreateResult> {
  const already = await activityForKey(db, actor, request.creationKey);
  if (already) return { ok: true, activityId: already };

  const goal = request.goal?.trim() || null;
  if (goal && goal.length > MAX_GOAL_CHARS) {
    return { ok: false, reason: `Keep the learning goal under ${MAX_GOAL_CHARS.toLocaleString("en-US")} characters.` };
  }
  const picked = await pickedMaterials(db, actor, courseId, {
    contentIds: [...request.contentIds],
    guideIds: [...request.guideIds],
  });
  if (!picked.ok) return picked;

  const draft = await draftSettings(
    db,
    model,
    { userId: actor.userId, courseId },
    {
      readings: picked.readings,
      mode: request.mode,
      guides: picked.guides,
      studentWork: request.studentWork,
      goal,
      minutes: request.minutes ?? null,
    },
  );
  if (!draft.ok) return draft;
  const typeReason = request.typeReason?.trim().replace(/\s+/g, " ").slice(0, MAX_REASON_CHARS) || undefined;
  const settings = { ...draft.settings, showProgress: request.showProgress ?? false, ...(typeReason ? { typeReason } : {}) };

  const saved = await createActivity(db, actor, courseId, request.creationKey, {
    tool: STUDY_CHAT,
    title: settings.scenarios[0].title,
    settings,
    points: rubricPoints(settings),
  });
  if (!saved.ok) return saved;
  const attached = await setActivityMaterials(db, actor, saved.id, {
    contentIds: picked.readings.map((reading) => reading.id),
    guideIds: picked.guides.map((guide) => guide.id),
  });
  return attached.ok ? { ok: true, activityId: saved.id } : attached;
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

export type SaveResult = { ok: true } | { ok: false; reason: string; problems?: string[] };

/**
 * Saves the teacher's edits. Settings are checked against the schema first;
 * the title follows the scenario and the points follow the rubric, as when drafted.
 */
export async function saveStudyChat(db: Db, actor: Actor, activityId: string, settings: unknown): Promise<SaveResult> {
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity || activity.tool !== STUDY_CHAT) return { ok: false, reason: "That assignment isn't one of yours." };
  const parsed = StudyChatSettings.safeParse(settings);
  if (!parsed.success) {
    return { ok: false, reason: "Some settings need fixing before you save.", problems: settingProblems(parsed.error) };
  }
  return updateActivity(db, actor, activityId, {
    title: parsed.data.scenarios[0].title,
    settings: parsed.data,
    points: rubricPoints(parsed.data),
  });
}
