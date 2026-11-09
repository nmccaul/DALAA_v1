"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { saveGuide } from "@/content/guide";
import { saveContent } from "@/content/store";
import { db } from "@/db/client";

export type AddMaterialState = { error?: string };

/**
 * Adds an uploaded or pasted material from the Materials tab. "ai" saves it
 * as an AI-only note (course_guides), which never reaches students.
 * `creationKey` is client-generated, so a double submit saves one copy.
 */
export async function addMaterialAction(_prev: AddMaterialState, form: FormData): Promise<AddMaterialState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const creationKey = String(form.get("creationKey") ?? "");
  const file = form.get("file");
  const input =
    file instanceof File && file.size > 0
      ? { kind: "file" as const, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
      : { kind: "paste" as const, name: String(form.get("name") ?? ""), text: String(form.get("text") ?? "") };

  const save = form.get("seenBy") === "ai" ? saveGuide : saveContent;
  const saved = await save(db(), actor, courseId, creationKey, input);
  if (!saved.ok) return { error: saved.reason };
  redirect(`/courses/${courseId}/materials?added=${saved.content.id}`);
}
