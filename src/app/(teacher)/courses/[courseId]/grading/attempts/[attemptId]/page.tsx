import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { getTaughtAttempt } from "@/results/attempt";
import { ResultBreakdown } from "@/results/breakdown";
import { latestDispute } from "@/results/disputes";
import { getResult } from "@/results/store";
import { screensFor } from "@/tools/screens";
import { DisputeForm, ScoreForm } from "../../score-forms";

export const metadata: Metadata = { title: "Student's conversation" };

const ERRORS: Record<string, string> = {
  out_of_range: "Enter a score from 0 up to the assignment's points.",
  not_found: "That attempt isn't graded yet, so its score can't be changed.",
};

const ENDED: Record<string, string> = {
  turns: "used all their messages",
  time: "ran out of time",
  question: "answered the chat's question",
  student: "finished it themselves",
};

/** One student's attempt for their teacher: the grade (to change, or a dispute to answer) and the whole conversation. */
export default async function AttemptPage({ params, searchParams }: PageProps<"/courses/[courseId]/grading/attempts/[attemptId]">) {
  const { courseId, attemptId } = await params;
  const { actor, course } = await loadTaughtCourse(courseId);
  const attempt = await getTaughtAttempt(db(), actor, attemptId);
  if (!attempt || attempt.courseId !== course.id) notFound();
  const q = await searchParams;
  const [result, dispute] = await Promise.all([getResult(db(), attempt.id), latestDispute(db(), attempt.id)]);
  const Transcript = screensFor(attempt.tool)?.transcript;
  const base = `/courses/${course.id}/grading`;
  const from = `${base}/attempts/${attempt.id}`;
  const error = q.attempt === attempt.id && typeof q.error === "string" ? ERRORS[q.error] : undefined;
  const graded = result?.status === "graded" ? result : null;
  const scored = graded && {
    attemptId: attempt.id,
    name: attempt.studentName,
    aiScore: graded.score,
    teacherScore: graded.teacherScore,
    maxScore: graded.maxScore,
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`${base}?view=grades#${attempt.id}`} className="text-sm text-accent-text hover:underline">
          ← Grades
        </Link>
        <h2 className="text-2xl font-normal break-words">{attempt.studentName}</h2>
        <p className="text-sm text-muted">
          {attempt.activityTitle} · Started <LocalTime value={attempt.startedAt} />
          {attempt.completedAt ? (
            <>
              {" "}
              · Ended <LocalTime value={attempt.completedAt} />
              {attempt.endedBy && `: ${ENDED[attempt.endedBy]}`}
            </>
          ) : (
            " · Still in progress"
          )}
        </p>
      </div>

      <section id={attempt.id} className="flex scroll-mt-4 flex-col gap-3 rounded-panel border border-border bg-surface px-5 py-4" aria-labelledby="grade">
        <h3 id="grade" className="text-lg font-bold">
          Grade
        </h3>
        {!graded || !scored ? (
          <p className="text-muted">
            {result?.status === "failed"
              ? "Grading didn't finish."
              : attempt.status === "completed"
                ? "Being graded."
                : "Not graded yet: the student hasn't finished."}
          </p>
        ) : (
          <>
            {dispute?.status === "open" ? (
              <DisputeForm
                courseId={course.id}
                from={from}
                student={{ ...scored, disputeId: dispute.id, disputeReason: dispute.reason }}
                error={error}
              />
            ) : (
              <ScoreForm
                courseId={course.id}
                from={from}
                student={scored}
                saved={q.saved === attempt.id ? "Saved." : q.resolved === attempt.id ? "Dispute resolved." : null}
                error={error}
              />
            )}
            {dispute?.status === "resolved" && (
              <p className="text-sm text-muted">
                They disputed it: &ldquo;{dispute.reason}&rdquo;
                {dispute.response && <> You answered: &ldquo;{dispute.response}&rdquo;</>}
              </p>
            )}
            <p className="max-w-[65ch]">{graded.feedback}</p>
            <ResultBreakdown result={graded} raised="Points they raised" />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="conversation">
        <h3 id="conversation" className="text-lg font-bold">
          Conversation
        </h3>
        {Transcript ? <Transcript attempt={attempt} /> : <p className="text-muted">This activity has no conversation to show.</p>}
      </section>
    </div>
  );
}
