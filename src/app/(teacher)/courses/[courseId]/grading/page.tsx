import { Button, EmptyState, inputStyles } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { listCourseGrades, type StudentGrade } from "@/results/grading";
import { setScoreAction } from "./actions";

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
      {assignments.map((a) => (
        <section key={a.activityId} className="flex flex-col gap-3" aria-labelledby={`grades-${a.activityId}`}>
          <h2 id={`grades-${a.activityId}`} className="font-display text-xl font-semibold break-words">
            {a.title} <span className="text-base font-normal text-muted">· {pointsFormat.format(a.points)} points</span>
          </h2>
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
                      {s.flagged && <span translate="yes"> · Not on the latest class list</span>}
                    </span>
                  </div>
                  {s.status === "graded" && s.attemptId ? (
                    <ScoreForm courseId={course.id} student={s} saved={q.saved === s.attemptId} error={q.attempt === s.attemptId ? error : undefined} />
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
function ScoreForm({ courseId, student, saved, error }: { courseId: string; student: StudentGrade; saved: boolean; error?: string }) {
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
          Saved.
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
