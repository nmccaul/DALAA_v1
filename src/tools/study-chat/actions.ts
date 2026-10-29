"use server";

import { redirect } from "next/navigation";
import { graderModel } from "@/ai/models";
import { requireActor } from "@/auth/current";
import { saveContent } from "@/content/store";
import { db } from "@/db/client";
import { createStudyChat, publishStudyChat } from "./create";
import { MODE_SLUGS, type ModeSlug } from "./modes";

export type FormState = { error?: string };

const newPath = (courseId: string) => `/courses/${courseId}/activities/new/study-chat`;

/** Step 1: the material, pasted or uploaded. Back to the same page with ?content=. */
export async function saveMaterialAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const file = form.get("file");
  const name = String(form.get("name") ?? "");
  const input =
    file instanceof File && file.size > 0
      ? { kind: "file" as const, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
      : { kind: "paste" as const, name, text: String(form.get("text") ?? "") };

  const saved = await saveContent(db(), actor, courseId, String(form.get("creationKey") ?? ""), input);
  if (!saved.ok) return { error: saved.reason };
  redirect(`${newPath(courseId)}?content=${saved.content.id}`);
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
    mode,
    creationKey: String(form.get("creationKey") ?? ""),
  });
  if (!created.ok) return { error: created.reason };
  redirect(`/courses/${courseId}/activities/${created.activityId}`);
}

export async function publishAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const activityId = String(form.get("activityId") ?? "");
  const published = await publishStudyChat(db(), actor, activityId);
  if (!published.ok) return { error: published.reason };
  redirect(`/courses/${courseId}`);
}
