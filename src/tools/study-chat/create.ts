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
import { rubricPoints, settingProblems, StudyChatSettings, StudyChatSetupSettings } from "./schema";
import { MAX_REASON_CHARS } from "./suggest";
import { pickedMaterials } from "./wizard/picks";
import { DEFAULT_MINUTES, MINUTES, type Minutes } from "./wizard/query";

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

export type StartRequest = {
  contentIds: readonly string[];
  guideIds: readonly string[];
  mode: ModeSlug;
  goal: string;
  studentWork: boolean;
  typeReason: string | null;
  creationKey: string;
};

/**
 * A new chat with only what steps 1–2 decided: its kind, goal and materials,
 * and limits to start from. Everything else is empty for the teacher to
 * write, or to ask DALAA for (assist.ts). Exported for tests.
 */
export function blankSettings(request: Pick<StartRequest, "mode" | "goal" | "studentWork" | "typeReason">): StudyChatSettings {
  const typeReason = request.typeReason?.trim().replace(/\s+/g, " ").slice(0, MAX_REASON_CHARS) || undefined;
  return StudyChatSetupSettings.parse({
    mode: request.mode,
    studentWork: request.studentWork,
    showProgress: false,
    goal: request.goal,
    ...(typeReason ? { typeReason } : {}),
    scenarios: [{ title: "", situation: "", opening: "" }],
    positions: [],
    touchpoints: [],
    persona: { name: "", title: "", background: "", tone: "", helpfulness: "balanced" },
    completion: {
      maxTurns: MINUTES.find((m) => m.value === DEFAULT_MINUTES)!.turns,
      minTurns: null,
      timeLimitMinutes: null,
      question: null,
      studentCanFinish: true,
    },
    rubric: { criteria: [], strictness: "balanced" },
  });
}

/**
 * Wizard step 2's Next: saves the chat as set so far, at once, with no AI
 * draft (Nathan, feedback aab2aed5): step 3 opens for the teacher to write,
 * or to ask DALAA to. Named after its first material until it has a title.
 */
export async function startStudyChat(db: Db, actor: Actor, courseId: string, request: StartRequest): Promise<CreateResult> {
  const already = await activityForKey(db, actor, request.creationKey);
  if (already) return { ok: true, activityId: already };

  const goal = request.goal.trim();
  if (goal.length > MAX_GOAL_CHARS) {
    return { ok: false, reason: `Keep the learning goal under ${MAX_GOAL_CHARS.toLocaleString("en-US")} characters.` };
  }
  const picked = await pickedMaterials(db, actor, courseId, { contentIds: [...request.contentIds], guideIds: [...request.guideIds] });
  if (!picked.ok) return picked;

  const saved = await createActivity(db, actor, courseId, request.creationKey, {
    tool: STUDY_CHAT,
    title: picked.readings[0]?.name.trim() || "Study Chat",
    settings: blankSettings({ ...request, goal }),
    points: null,
  });
  if (!saved.ok) return saved;
  const attached = await setActivityMaterials(db, actor, saved.id, {
    contentIds: picked.readings.map((reading) => reading.id),
    guideIds: picked.guides.map((guide) => guide.id),
  });
  return attached.ok ? { ok: true, activityId: saved.id } : attached;
}

/** What's still missing before students can take it, in plain sentences; empty when it's complete. */
export function unfinished(settings: unknown): string[] {
  const parsed = StudyChatSettings.safeParse(settings);
  return parsed.success ? [] : settingProblems(parsed.error);
}

/** Publishes a Study Chat whose settings still fit the schema. */
export async function publishStudyChat(
  db: Db,
  actor: Actor,
  activityId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity || activity.tool !== STUDY_CHAT) return { ok: false, reason: "That assignment isn't one of yours." };
  const missing = unfinished(activity.settings);
  if (missing.length > 0) return { ok: false, reason: `Finish setting it up before you publish: ${missing.join(" ")}` };
  return publishActivity(db, actor, activityId);
}

export type SaveResult = { ok: true } | { ok: false; reason: string; problems?: string[] };

/**
 * Saves the teacher's edits. Settings are checked against the schema first:
 * a draft may be saved part-written (StudyChatSetupSettings), a published
 * chat only complete. The title follows the scenario once it has one, and the
 * points follow the rubric (NULL with no criteria yet, never 0).
 */
export async function saveStudyChat(db: Db, actor: Actor, activityId: string, settings: unknown): Promise<SaveResult> {
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity || activity.tool !== STUDY_CHAT) return { ok: false, reason: "That assignment isn't one of yours." };
  const schema = activity.status === "published" ? StudyChatSettings : StudyChatSetupSettings;
  const parsed = schema.safeParse(settings);
  if (!parsed.success) {
    return { ok: false, reason: "Some settings need fixing before you save.", problems: settingProblems(parsed.error) };
  }
  return updateActivity(db, actor, activityId, {
    title: parsed.data.scenarios[0].title || activity.title,
    settings: parsed.data,
    points: parsed.data.rubric.criteria.length > 0 ? rubricPoints(parsed.data) : null,
  });
}
