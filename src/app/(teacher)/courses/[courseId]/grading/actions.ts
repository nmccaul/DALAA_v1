"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { setTeacherScore } from "@/results/grading";

/** Saves the teacher's score, or with "reset" puts the AI's score back. */
export async function setScoreAction(form: FormData): Promise<void> {
  const courseId = String(form.get("courseId"));
  const attemptId = String(form.get("attemptId"));
  const raw = String(form.get("score") ?? "").trim();
  const score = form.get("reset") ? null : raw === "" ? Number.NaN : Number(raw);
  const result = await setTeacherScore(db(), await requireActor(), attemptId, score);
  const q = new URLSearchParams(result === "saved" ? { saved: attemptId } : { error: result, attempt: attemptId });
  redirect(`/courses/${courseId}/grading?${q}#${attemptId}`);
}
