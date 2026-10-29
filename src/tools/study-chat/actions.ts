"use server";

import { redirect } from "next/navigation";
import { setActivityGuide } from "@/activities/store";
import { graderModel } from "@/ai/models";
import { requireActor } from "@/auth/current";
import { saveGuide } from "@/content/guide";
import { saveContent } from "@/content/store";
import { db } from "@/db/client";
import { afterPublishPath, keepPicker, PICKER_PARAM, pickerRequest } from "@/lti/picker";
import { createStudyChat, publishStudyChat, saveStudyChat } from "./create";
import { MODE_SLUGS, type ModeSlug } from "./modes";

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
    const attached = await setActivityGuide(db(), actor, String(guideOf), saved.content.id);
    if (!attached.ok) return { error: attached.reason };
    redirect(keepPicker(reviewPath(courseId, String(guideOf)), pickerRequest(form.get(PICKER_PARAM))));
  }
  const query = guideFor
    ? `content=${encodeURIComponent(String(guideFor))}&guide=${saved.content.id}`
    : `content=${saved.content.id}`;
  redirect(keepPicker(`${newPath(courseId)}?${query}`, pickerRequest(form.get(PICKER_PARAM))));
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
    contentId: String(form.get("contentId") ?? ""),
    guideId: form.get("guideId") ? String(form.get("guideId")) : null,
    mode,
    studentWork: form.get("studentWork") === "on",
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
  if (form.get("intent") !== "publish") return { savedAt: Date.now() };

  const published = await publishStudyChat(db(), actor, activityId);
  if (!published.ok) return { error: published.reason };
  redirect(afterPublishPath(courseId, pickerRequest(form.get(PICKER_PARAM))));
}

/** The review screen's "Remove" next to the guide: the chat and grader stop reading it. */
export async function removeGuideAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const activityId = String(form.get("activityId") ?? "");
  const removed = await setActivityGuide(db(), actor, activityId, null);
  if (!removed.ok) return { error: removed.reason };
  redirect(keepPicker(reviewPath(courseId, activityId), pickerRequest(form.get(PICKER_PARAM))));
}
