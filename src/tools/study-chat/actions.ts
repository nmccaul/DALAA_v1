"use server";

import { redirect } from "next/navigation";
import { addActivityGuide, removeActivityGuide, setActivityMaterials } from "@/activities/materials";
import { chatModel, graderModel } from "@/ai/models";
import { requireActor } from "@/auth/current";
import { clientFor } from "@/canvas/connection";
import { VaultError } from "@/canvas/vault";
import { saveGuide } from "@/content/guide";
import { saveContent } from "@/content/store";
import { db } from "@/db/client";
import { afterPublishPath, keepPicker, PICKER_PARAM, pickerRequest } from "@/lti/picker";
import { getTaughtActivity } from "@/activities/store";
import { activityMaterials } from "@/activities/materials";
import { assistParts, MAX_INSTRUCTION_CHARS, type AssistResult } from "./assist";
import { createStudyChat, publishStudyChat, retypeStudyChat, saveStudyChat, startStudyChat, STUDY_CHAT } from "./create";
import { isListPart, isPartKey } from "./parts";
import { StudyChatSetupSettings } from "./schema";
import { MODE_SLUGS, type ModeSlug } from "./modes";
import { MAX_GOAL_CHARS, suggestGoalFor } from "./suggest";
import { parsePicks, pickedMaterials, savePicks } from "./wizard/picks";
import { materialsQuery } from "./wizard/query";
import { finishLaterPath, savedStepTarget, setupPath } from "./wizard/steps";
import { reasonField, typeRequestFrom } from "./wizard/type-request";

export type FormState = { error?: string; problems?: string[]; savedAt?: number };

const newPath = (courseId: string) => `/courses/${courseId}/activities/new/study-chat`;
const reviewPath = (courseId: string, activityId: string) => `/courses/${courseId}/activities/${activityId}`;

/**
 * Step 1: the material, pasted or uploaded. Back to the same page with
 * ?content=. With `guideFor` (the saved material's id) it's the optional
 * AI-only guide instead, and the page comes back with ?content=&guide=. With
 * `guideOf` (an activity's id, from its review screen) the guide is attached
 * to that activity and the review opens again.
 */
export async function saveMaterialAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const file = form.get("file");
  const name = String(form.get("name") ?? "");
  const input =
    file instanceof File && file.size > 0
      ? { kind: "file" as const, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
      : { kind: "paste" as const, name, text: String(form.get("text") ?? "") };

  const creationKey = String(form.get("creationKey") ?? "");
  const guideFor = form.get("guideFor");
  const guideOf = form.get("guideOf");
  const saved =
    guideFor || guideOf
      ? await saveGuide(db(), actor, courseId, creationKey, input)
      : await saveContent(db(), actor, courseId, creationKey, input);
  if (!saved.ok) return { error: saved.reason };
  if (guideOf) {
    const attached = await addActivityGuide(db(), actor, String(guideOf), saved.content.id);
    if (!attached.ok) return { error: attached.reason };
    redirect(keepPicker(reviewPath(courseId, String(guideOf)), pickerRequest(form.get(PICKER_PARAM))));
  }
  const query = guideFor
    ? `content=${encodeURIComponent(String(guideFor))}&guide=${saved.content.id}`
    : `content=${saved.content.id}`;
  redirect(keepPicker(`${newPath(courseId)}?${query}`, pickerRequest(form.get(PICKER_PARAM))));
}

/**
 * Wizard step 1: the ticked materials. Canvas items are saved now; the saved
 * ids go on to the learning goal step in the URL.
 */
export type MaterialsPickState = FormState & { reconnect?: string; ticked?: string[] };

export async function wizardMaterialsAction(_prev: MaterialsPickState, form: FormData): Promise<MaterialsPickState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  // Step 1 on a saved activity (feedback 21e8c594): its materials change in place.
  const activityId = String(form.get("activityId") ?? "") || null;
  const picker = pickerRequest(form.get(PICKER_PARAM));
  const ticked = form.getAll("pick").map(String);
  const picks = parsePicks(ticked);
  const canvas =
    picks.canvas.length > 0
      ? await clientFor(db(), actor).catch((e) => {
          if (e instanceof VaultError) return null;
          throw e;
        })
      : null;
  const saved = await savePicks(db(), actor, canvas, courseId, String(form.get("formKey") ?? ""), picks);
  if (!saved.ok) {
    const back = keepPicker(activityId ? setupPath(courseId, activityId, "materials") : `${newPath(courseId)}?step=materials`, picker);
    // The form resets after the action; `ticked` keeps the teacher's ticks.
    return { error: saved.reason, reconnect: saved.reconnect ? `/canvas/connect?next=${encodeURIComponent(back)}` : undefined, ticked };
  }
  if (!activityId) redirect(keepPicker(`${newPath(courseId)}?step=goal&${materialsQuery(saved)}`, picker));

  const attached = await setActivityMaterials(db(), actor, activityId, saved);
  if (!attached.ok) return { error: attached.reason, ticked };
  await afterSavedStep(courseId, activityId, "materials", form.get("intent"), picker);
  return { savedAt: Date.now(), ticked };
}

/** "Save and finish later" on a saved activity: the Activities list it's in. */
async function laterPath(courseId: string, activityId: string): Promise<string> {
  const activity = await getTaughtActivity(db(), await requireActor(), activityId);
  return finishLaterPath(courseId, { assigned: activity?.assigned ?? false });
}

/** After a saved activity's step 1 or 2 saves: "Save and finish later", Next, or a step in the list. */
async function afterSavedStep(courseId: string, activityId: string, step: "materials" | "goal", intent: unknown, picker: string | null) {
  if (intent === "later") redirect(keepPicker(await laterPath(courseId, activityId), picker));
  const target = savedStepTarget(step, intent);
  if (target) redirect(keepPicker(setupPath(courseId, activityId, target), picker));
}

/**
 * Step 2 on a saved activity (feedback 21e8c594): the kind and goal change,
 * and what's written on the later steps stays.
 */
export async function editTypeAction(_prev: TypeState, form: FormData): Promise<TypeState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const activityId = String(form.get("activityId") ?? "");
  const mode = MODE_SLUGS.find((m) => m === form.get("mode"));
  if (!mode) return { error: "Pick a type of activity." };
  const goal = String(form.get("goal") ?? "").trim();
  if (!goal) return { error: "Write the learning goal first.", mode };
  const reason = form.get(reasonField(mode));
  const saved = await retypeStudyChat(db(), actor, activityId, { mode, goal, typeReason: typeof reason === "string" ? reason : null });
  if (!saved.ok) return { error: saved.reason, mode };
  await afterSavedStep(courseId, activityId, "goal", form.get("intent"), pickerRequest(form.get(PICKER_PARAM)));
  return { savedAt: Date.now(), mode };
}

/**
 * Wizard step 3: the chosen type. The AI drafts the activity from the picks
 * and the goal, and step 4 opens on the draft. A failed
 * draft comes back with the choice kept (`mode`).
 */
export type TypeState = FormState & { mode?: string };

/**
 * Step 2's Draft and Tweak on the goal (feedback 78c8594e: the teacher
 * writes it, or asks DALAA to draft or rewrite it). With `tweak`, the
 * teacher's goal rewritten as they asked. NULL when none comes back.
 */
export async function goalForTypeAction(
  courseId: string,
  contentIds: string[],
  guideIds: string[],
  mode: string,
  tweak?: { current: string; instruction: string },
): Promise<string | null> {
  const actor = await requireActor();
  const slug = MODE_SLUGS.find((m) => m === mode);
  if (!slug) return null;
  const materials = await pickedMaterials(db(), actor, courseId, { contentIds, guideIds });
  if (!materials.ok) return null;
  const asked = tweak ? { current: tweak.current.slice(0, MAX_GOAL_CHARS), instruction: tweak.instruction.slice(0, 500) } : undefined;
  // The quick model: a teacher is waiting on it, and it's one or two sentences (feedback a1fc461e).
  return suggestGoalFor(db(), chatModel(), { userId: actor.userId, courseId }, materials, slug, asked);
}

/** Step 2's Next: saves the chat with its kind and goal, no AI draft, and opens step 3 for the teacher to write. */
export async function wizardTypeAction(_prev: TypeState, form: FormData): Promise<TypeState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const mode = String(form.get("mode") ?? "") || undefined;
  const request = typeRequestFrom(form);
  if (!request.ok) return { error: request.reason, mode };

  const created = await startStudyChat(db(), actor, courseId, {
    contentIds: request.ids.contentIds,
    guideIds: request.ids.guideIds,
    mode: request.mode,
    studentWork: request.studentWork,
    goal: request.goal,
    typeReason: request.typeReason,
    creationKey: request.creationKey,
  });
  if (!created.ok) return { error: created.reason, mode };
  redirect(keepPicker(setupPath(courseId, created.activityId, "scenario"), pickerRequest(form.get(PICKER_PARAM))));
}

/**
 * A ✨ button: DALAA writes the parts asked for (one box, one list, or a
 * step's empty ones) from the activity's materials and the settings on
 * screen, following the teacher's direction. Nothing is saved; the editor
 * shows the result. One box goes to the quick model, more to the grader's.
 */
export async function assistAction(activityId: string, settings: string, parts: string[], instruction: string): Promise<AssistResult> {
  const actor = await requireActor();
  const activity = await getTaughtActivity(db(), actor, activityId);
  if (!activity || activity.tool !== STUDY_CHAT) return { ok: false, reason: "That activity isn't one of yours." };
  let current: unknown;
  try {
    current = JSON.parse(settings);
  } catch {
    return { ok: false, reason: "Reload the page and try again." };
  }
  const parsed = StudyChatSetupSettings.safeParse(current);
  if (!parsed.success) return { ok: false, reason: "Fix the settings marked on this page, then try again." };
  const keys = [...new Set(parts.filter(isPartKey))];
  const { readings, guides } = await activityMaterials(db(), activity.id);
  const oneBox = keys.length === 1 && !isListPart(keys[0]);
  return assistParts(db(), oneBox ? chatModel() : graderModel(), { userId: actor.userId, courseId: activity.courseId }, {
    readings,
    guides,
    settings: parsed.data,
    parts: keys,
    instruction: instruction.slice(0, MAX_INSTRUCTION_CHARS),
  });
}

/** Step 2: a mode (or "suggest"), then the AI drafts it and the review opens. */
export async function draftAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  // "Suggest for me" wins over a card that's also checked.
  const choices = form.getAll("mode").map(String);
  const choice = choices.includes("suggest") ? "suggest" : (choices[0] ?? "");
  const mode = choice === "suggest" || (MODE_SLUGS as readonly string[]).includes(choice) ? (choice as ModeSlug | "suggest") : null;
  if (!mode) return { error: "Pick a kind of chat, or let DALAA suggest one." };

  const created = await createStudyChat(db(), graderModel(), actor, courseId, {
    contentIds: [String(form.get("contentId") ?? "")],
    guideIds: form.get("guideId") ? [String(form.get("guideId"))] : [],
    mode,
    studentWork: form.get("studentWork") === "on",
    showProgress: form.get("showProgress") === "on",
    creationKey: String(form.get("creationKey") ?? ""),
  });
  if (!created.ok) return { error: created.reason };
  redirect(keepPicker(`/courses/${courseId}/activities/${created.activityId}`, pickerRequest(form.get(PICKER_PARAM))));
}

/**
 * The review screen's edits: Save draft keeps editing; Publish saves, then
 * publishes, and lands back on Canvas's "Add to Canvas" picker if it came from there.
 */
export async function saveSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const activityId = String(form.get("activityId") ?? "");
  let settings: unknown;
  try {
    settings = JSON.parse(String(form.get("settings") ?? ""));
  } catch {
    return { error: "We couldn't read your changes. Reload the page and try again." };
  }
  const saved = await saveStudyChat(db(), actor, activityId, settings);
  if (!saved.ok) return { error: saved.reason, problems: saved.problems };
  const picker = pickerRequest(form.get(PICKER_PARAM));
  if (form.get("intent") === "later") redirect(keepPicker(await laterPath(courseId, activityId), picker));
  const target = savedStepTarget(form.get("wizardStep"), form.get("intent"));
  if (target) redirect(keepPicker(setupPath(courseId, activityId, target), picker));
  if (form.get("intent") !== "publish") return { savedAt: Date.now() };

  const published = await publishStudyChat(db(), actor, activityId);
  if (!published.ok) return { error: published.reason };
  redirect(afterPublishPath(courseId, pickerRequest(form.get(PICKER_PARAM))));
}

/** Wizard step 7's Publish (no Canvas assignment from DALAA): publishes the saved chat, then the course or the picker. */
export async function publishAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireActor();
  const published = await publishStudyChat(db(), actor, String(form.get("activityId") ?? ""));
  if (!published.ok) return { error: published.reason };
  redirect(afterPublishPath(String(form.get("courseId") ?? ""), pickerRequest(form.get(PICKER_PARAM))));
}

/** The review screen's "Remove" next to an AI-only note: the chat and grader stop reading it. */
export async function removeGuideAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const activityId = String(form.get("activityId") ?? "");
  const removed = await removeActivityGuide(db(), actor, activityId, String(form.get("guideId") ?? ""));
  if (!removed.ok) return { error: removed.reason };
  redirect(keepPicker(reviewPath(courseId, activityId), pickerRequest(form.get(PICKER_PARAM))));
}
