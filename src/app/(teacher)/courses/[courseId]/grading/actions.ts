"use server";

import { redirect } from "next/navigation";
import { graderModel } from "@/ai/models";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { sendGrades } from "@/lti/grades";
import { runBrief } from "@/results/brief";
import { resolveDispute } from "@/results/disputes";
import { setTeacherScore } from "@/results/grading";
import { summaryQuery } from "./push-text";
import { backTo } from "./back";

/** Saves the teacher's score, or with "reset" puts the AI's score back. */
export async function setScoreAction(form: FormData): Promise<void> {
  const courseId = String(form.get("courseId"));
  const attemptId = String(form.get("attemptId"));
  const raw = String(form.get("score") ?? "").trim();
  const score = form.get("reset") ? null : raw === "" ? Number.NaN : Number(raw);
  const result = await setTeacherScore(db(), await requireActor(), attemptId, score);
  const q: Record<string, string> = result === "saved" ? { saved: attemptId } : { error: result, attempt: attemptId };
  redirect(backTo(courseId, form.get("from"), q, attemptId));
}

/** Resolves a student's dispute with an optional answer, changing the score if the teacher did. */
export async function resolveDisputeAction(form: FormData): Promise<void> {
  const courseId = String(form.get("courseId"));
  const attemptId = String(form.get("attemptId"));
  const raw = String(form.get("score") ?? "").trim();
  const score = raw === "" ? Number.NaN : Number(raw);
  const result = await resolveDispute(db(), await requireActor(), String(form.get("disputeId")), score, String(form.get("response") ?? ""));
  const q: Record<string, string> = result === "resolved" ? { resolved: attemptId } : { error: result, attempt: attemptId };
  redirect(backTo(courseId, form.get("from"), q, attemptId));
}

/**
 * "Send grades to Canvas". The button sends in one click unless there's an
 * exception, which goes to the preview; the preview's confirm sends with the
 * same client key, so a double click or a retry sends once.
 */
export async function sendGradesAction(form: FormData): Promise<void> {
  const courseId = String(form.get("courseId"));
  const activityId = String(form.get("activityId"));
  const clientKey = String(form.get("clientKey"));
  const confirmed = form.get("confirmed") === "1";
  const result = await sendGrades(db(), await requireActor(), activityId, clientKey, {
    includeLowered: confirmed && form.get("includeLowered") === "1",
    onlyIfClean: !confirmed,
  });
  const grading = `/courses/${courseId}/grading`;
  if (!result.ok && result.reason === "needs_preview") {
    redirect(`${grading}/send/${activityId}?${new URLSearchParams({ key: clientKey })}`);
  }
  const q = result.ok ? summaryQuery(activityId, result.summary) : new URLSearchParams({ pushed: activityId, pusherror: result.reason });
  q.set("view", "grades");
  redirect(`${grading}?${q}#grades-${activityId}`);
}

/** "Analyze conversations": makes the activity's class-prep brief, then shows it on Insights. */
export async function runBriefAction(form: FormData): Promise<void> {
  const courseId = String(form.get("courseId"));
  const activityId = String(form.get("activityId"));
  const result = await runBrief(db(), graderModel(), await requireActor(), activityId);
  const q = new URLSearchParams({ view: "insights", brief: result, activity: activityId });
  if (form.get("names") === "1") q.set("names", "1");
  redirect(`/courses/${courseId}/grading?${q}#brief-${activityId}`);
}
