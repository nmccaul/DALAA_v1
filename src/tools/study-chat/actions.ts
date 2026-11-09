"use server";

import { redirect } from "next/navigation";
import { addActivityGuide, removeActivityGuide } from "@/activities/materials";
import { chatModel, graderModel } from "@/ai/models";
import { requireActor } from "@/auth/current";
import { clientFor } from "@/canvas/connection";
import { VaultError } from "@/canvas/vault";
import { saveGuide } from "@/content/guide";
import { saveContent } from "@/content/store";
import { db } from "@/db/client";
import { afterPublishPath, keepPicker, PICKER_PARAM, pickerRequest } from "@/lti/picker";
import { createStudyChat, publishStudyChat, saveStudyChat } from "./create";
import { MODE_SLUGS, type ModeSlug } from "./modes";
import { parsePicks, savePicks } from "./wizard/picks";
import { materialsQuery } from "./wizard/query";
import { isSetupStep, nextSetupStep, setupPath } from "./wizard/steps";
import { typeRequestFrom } from "./wizard/type-request";
import { runTrial, trialEnding, TRIAL_LEVELS, type Trial, type TrialLevel } from "./trial";

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
    const back = keepPicker(`${newPath(courseId)}?step=materials`, picker);
    // The form resets after the action; `ticked` keeps the teacher's ticks.
    return { error: saved.reason, reconnect: saved.reconnect ? `/canvas/connect?next=${encodeURIComponent(back)}` : undefined, ticked };
  }
  redirect(keepPicker(`${newPath(courseId)}?step=goal&${materialsQuery(saved)}`, picker));
}

/**
 * Wizard step 3: the chosen type. The AI drafts the activity from the picks
 * and the goal, and step 4 opens on the draft. A failed
 * draft comes back with the choice kept (`mode`).
 */
export type TypeState = FormState & { mode?: string };

export async function wizardTypeAction(_prev: TypeState, form: FormData): Promise<TypeState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const mode = String(form.get("mode") ?? "") || undefined;
  const request = typeRequestFrom(form);
  if (!request.ok) return { error: request.reason, mode };

  const created = await createStudyChat(db(), graderModel(), actor, courseId, {
    contentIds: request.ids.contentIds,
    guideIds: request.ids.guideIds,
    mode: request.mode,
    studentWork: request.studentWork,
    goal: request.goal,
    minutes: request.minutes,
    typeReason: request.typeReason,
    creationKey: request.creationKey,
  });
  if (!created.ok) return { error: created.reason, mode };
  redirect(keepPicker(setupPath(courseId, created.activityId, "scenario"), pickerRequest(form.get(PICKER_PARAM))));
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
  const step = form.get("wizardStep");
  if (form.get("intent") === "next" && isSetupStep(step)) {
    redirect(keepPicker(setupPath(courseId, activityId, nextSetupStep(step) ?? step), pickerRequest(form.get(PICKER_PARAM))));
  }
  if (form.get("intent") !== "publish") return { savedAt: Date.now() };

  const published = await publishStudyChat(db(), actor, activityId);
  if (!published.ok) return { error: published.reason };
  redirect(afterPublishPath(courseId, pickerRequest(form.get(PICKER_PARAM))));
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

export type TrialState = { error?: string; trial?: Trial & { ending: string } };

/** The review screen's "Try it with a sample student": runs one trial of the saved settings. */
export async function trialAction(_prev: TrialState, form: FormData): Promise<TrialState> {
  const actor = await requireActor();
  const choice = String(form.get("level") ?? "");
  if (!(TRIAL_LEVELS as readonly string[]).includes(choice)) return { error: "Pick a struggling or a strong student." };
  const chat = chatModel();
  const outcome = await runTrial(
    db(),
    { student: chat, reply: chat, check: chat, grader: graderModel() },
    actor,
    String(form.get("activityId") ?? ""),
    choice as TrialLevel,
  );
  return outcome.ok ? { trial: { ...outcome.trial, ending: trialEnding(outcome.trial) } } : { error: outcome.reason };
}
