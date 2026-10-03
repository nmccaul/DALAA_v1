"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { clientFor } from "@/canvas/connection";
import { importCourse } from "@/canvas/import";
import { VaultError } from "@/canvas/vault";
import { db } from "@/db/client";

export async function importCourseAction(form: FormData): Promise<void> {
  const actor = await requireActor();
  const canvas = await clientFor(db(), actor).catch((e) => {
    if (e instanceof VaultError) return null;
    throw e;
  });
  if (!canvas) redirect("/canvas/connect?next=/courses/import");

  const result = await importCourse(
    db(),
    actor,
    canvas,
    Number(form.get("canvasCourseId")),
    String(form.get("creationKey") ?? ""),
  );
  if (!result.ok) redirect(`/courses/import?error=${result.reason}`);
  if (result.alreadyInDalaa) redirect(`/courses/${result.courseId}`);

  const q = new URLSearchParams({ added: String(result.added) });
  const { notEnrolled, noNetId, inTwoSections } = result.skipped;
  if (notEnrolled) q.set("dropped", String(notEnrolled));
  if (noNetId) q.set("nonetid", String(noNetId));
  if (inTwoSections) q.set("twosections", String(inTwoSections));
  redirect(`/courses/${result.courseId}/students?${q}`);
}
