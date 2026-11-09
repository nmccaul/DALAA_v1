"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { saveGuide } from "@/content/guide";
import { saveContent } from "@/content/store";
import { readContent } from "@/content/read";
import { afterAddPath } from "@/content/return-path";
import { fetchWebPage } from "@/content/web";
import { db } from "@/db/client";

export type AddMaterialState = { error?: string };

/**
 * Adds an uploaded or pasted material from the Materials tab. "ai" saves it
 * as an AI-only note (course_guides), which never reaches students.
 * `creationKey` is client-generated, so a double submit saves one copy.
 * A `next` inside the course (step 1 of a new activity) is where it returns.
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

  const aiOnly = form.get("seenBy") === "ai";
  const saved = await (aiOnly ? saveGuide : saveContent)(db(), actor, courseId, creationKey, input);
  if (!saved.ok) return { error: saved.reason };
  redirect(afterAddPath(form.get("next"), courseId, { id: saved.content.id, aiOnly }));
}

export type WebPageState = { error?: string; preview?: { url: string; title: string; excerpt: string } };

/**
 * Add a web page, in two steps: "Fetch" shows the page's title and opening
 * text so the teacher can check it's the right page; "Add this page" fetches
 * it again and saves the copy.
 */
export async function addWebPageAction(_prev: WebPageState, form: FormData): Promise<WebPageState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const fetched = await fetchWebPage(String(form.get("url") ?? ""));
  if (!fetched.ok) return { error: fetched.reason };

  if (form.get("confirm") !== "1") {
    const read = await readContent(fetched.input);
    if (!read.ok) return { error: read.reason };
    return { preview: { url: fetched.input.url, title: read.name, excerpt: read.body.slice(0, 600) } };
  }
  const aiOnly = form.get("seenBy") === "ai";
  const saved = await (aiOnly ? saveGuide : saveContent)(db(), actor, courseId, String(form.get("creationKey") ?? ""), fetched.input);
  if (!saved.ok) return { error: saved.reason };
  redirect(afterAddPath(form.get("next"), courseId, { id: saved.content.id, aiOnly }));
}
