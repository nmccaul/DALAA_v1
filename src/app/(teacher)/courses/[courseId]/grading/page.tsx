import { randomUUID } from "node:crypto";
import { Button, EmptyState, inputStyles } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { isLtiCourse } from "@/lti/roster";
import { listCourseGrades, type StudentGrade } from "@/results/grading";
import { resolveDisputeAction, sendGradesAction, setScoreAction } from "./actions";
import { REFUSAL, readSummary, summaryLines } from "./push-text";

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const STATUS: Record<StudentGrade["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Being graded",
  graded: "Graded",
};

const ERRORS: Record<string, string> = {
  out_of_range: "Enter a score from 0 up to the assignment's points.",
  not_found: "That attempt isn't graded yet, so its score can't be changed.",
};

export default async function CourseGradingPage({ params, searchParams }: PageProps<"/courses/[courseId]/grading">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const q = await searchParams;
  const assignments = await listCourseGrades(db(), actor, course.id);
  const error = typeof q.error === "string" ? ERRORS[q.error] : undefined;
  const fromCanvas = await isLtiCourse(db(), course.id);
  const pushError = typeof q.pusherror === "string" ? (REFUSAL[q.pusherror as keyof typeof REFUSAL] ?? REFUSAL.unavailable) : null;

  const disputed = assignments.reduce((n, a) => n + a.students.filter((s) => s.disputeId !== null).length, 0);

  if (assignments.length === 0) {
    return (
      <EmptyState title="Nothing to grade yet">
        <p>
          When you publish an assignment and students finish it, you&apos;ll see each one&apos;s score here, can change
          it, and send grades to Canvas when you&apos;re ready.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {disputed > 0 && (
        <p role="status" className="rounded-panel border border-border-strong bg-accent-soft px-4 py-3">
          {disputed === 1 ? "A student disputed a grade." : `${disputed} students disputed a grade.`} It&apos;s marked below with
          their reason.
        </p>
      )}
      {assignments.map((a) => (
        <section key={a.activityId} className="flex flex-col gap-3" aria-labelledby={`grades-${a.activityId}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id={`grades-${a.activityId}`} className="scroll-mt-4 font-display text-xl font-semibold break-words">
              {a.title} <span className="text-base font-normal text-muted">· {pointsFormat.format(a.points)} points</span>
            </h2>
            {fromCanvas && a.students.some((s) => s.status === "graded") && (
              <form action={sendGradesAction}>
                <input type="hidden" name="courseId" value={course.id} />
                <input type="hidden" name="activityId" value={a.activityId} />
                <input type="hidden" name="clientKey" value={randomUUID()} />
                <Button>Send grades to Canvas</Button>
              </form>
            )}
          </div>
          {q.pushed === a.activityId && (
            <div
              role={pushError ? "alert" : "status"}
              className={`rounded-panel border px-4 py-3 text-sm ${pushError ? "border-danger text-danger" : "border-border-strong bg-accent-soft"}`}
            >
              {pushError ? (
                <p>{pushError}</p>
              ) : (
                summaryLines(readSummary(q)).map((line) => <p key={line}>{line}</p>)
              )}
            </div>
          )}
          {a.students.length === 0 ? (
            <p className="text-muted">No students on the class list yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
              {a.students.map((s) => (
                <li
                  key={s.userId}
                  id={s.attemptId ?? undefined}
                  className="flex scroll-mt-4 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium break-words">{s.name}</span>
                    <span className="text-sm text-muted break-all" translate="no">
                      {s.loginId}
                      {s.studentView && <span translate="yes"> · Student View</span>}
                      {s.flagged && <span translate="yes"> · Not on the latest class list</span>}
                    </span>
                  </div>
                  {s.disputeId && s.attemptId ? (
                    <DisputeForm courseId={course.id} student={s} error={q.attempt === s.attemptId ? error : undefined} />
                  ) : s.status === "graded" && s.attemptId ? (
                    <ScoreForm
                      courseId={course.id}
                      student={s}
                      saved={q.saved === s.attemptId ? "Saved." : q.resolved === s.attemptId ? "Dispute resolved." : null}
                      error={q.attempt === s.attemptId ? error : undefined}
                    />
                  ) : (
                    <span className="text-sm text-muted">{STATUS[s.status]}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/** A graded attempt's score: the one that counts, editable, and the AI's when the teacher changed it. */
function ScoreForm({
  courseId,
  student,
  saved,
  error,
}: {
  courseId: string;
  student: StudentGrade;
  saved: string | null;
  error?: string;
}) {
  const max = student.maxScore!;
  const counted = student.teacherScore ?? student.aiScore!;
  const inputId = `score-${student.attemptId}`;
  return (
    <form action={setScoreAction} className="flex flex-col gap-1 sm:items-end">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="attemptId" value={student.attemptId!} />
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="text-sm text-muted">
          Score
        </label>
        <input
          id={inputId}
          name="score"
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={0.01}
          required
          defaultValue={counted}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`${inputStyles} max-w-24 tabular-nums`}
        />
        <span className="text-sm whitespace-nowrap text-muted">of {pointsFormat.format(max)}</span>
        <Button variant="secondary">Save</Button>
      </div>
      {student.teacherScore !== null && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          You changed this from the AI&apos;s {pointsFormat.format(student.aiScore!)}.
          <button name="reset" value="1" formNoValidate className="font-medium text-accent-text hover:underline">
            Use the AI&apos;s score
          </button>
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-accent-text">
          {saved}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/** A disputed grade: the student's reason, then the score to keep or change and an answer, sent together. */
function DisputeForm({ courseId, student, error }: { courseId: string; student: StudentGrade; error?: string }) {
  const max = student.maxScore!;
  const id = `dispute-${student.attemptId}`;
  return (
    <form action={resolveDisputeAction} className="flex w-full flex-col gap-2 sm:max-w-md">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="attemptId" value={student.attemptId!} />
      <input type="hidden" name="disputeId" value={student.disputeId!} />
      <p className="text-sm font-medium text-danger">Disputed</p>
      <blockquote className="border-l-2 border-border-strong pl-3 text-sm whitespace-pre-wrap break-words">
        {student.disputeReason}
      </blockquote>
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-score`} className="text-sm text-muted">
          Score
        </label>
        <input
          id={`${id}-score`}
          name="score"
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={0.01}
          required
          defaultValue={student.teacherScore ?? student.aiScore!}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${inputStyles} max-w-24 tabular-nums`}
        />
        <span className="text-sm whitespace-nowrap text-muted">of {pointsFormat.format(max)}</span>
      </div>
      <label htmlFor={`${id}-response`} className="text-sm text-muted">
        Your answer to {student.name} (optional)
      </label>
      <textarea id={`${id}-response`} name="response" rows={2} className={inputStyles} />
      <Button className="self-start">Resolve</Button>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
