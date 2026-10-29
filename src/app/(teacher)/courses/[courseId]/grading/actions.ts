"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { resolveDispute } from "@/results/disputes";
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

/** Resolves a student's dispute with an optional answer, changing the score if the teacher did. */
export async function resolveDisputeAction(form: FormData): Promise<void> {
  const courseId = String(form.get("courseId"));
  const attemptId = String(form.get("attemptId"));
  const raw = String(form.get("score") ?? "").trim();
  const score = raw === "" ? Number.NaN : Number(raw);
  const result = await resolveDispute(db(), await requireActor(), String(form.get("disputeId")), score, String(form.get("response") ?? ""));
  const q = new URLSearchParams(result === "resolved" ? { resolved: attemptId } : { error: result, attempt: attemptId });
  redirect(`/courses/${courseId}/grading?${q}#${attemptId}`);
}
