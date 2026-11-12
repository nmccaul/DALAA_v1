import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { Button, EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { isLtiCourse } from "@/lti/roster";
import { listCourseDisputes, type CourseDispute } from "@/results/disputes";
import { listCourseGrades, type AssignmentGrades, type StudentGrade } from "@/results/grading";
import { sendGradesAction } from "./actions";
import { InsightsView } from "./insights-view";
import { REFUSAL, readSummary, summaryLines } from "./push-text";
import { DisputeForm, ScoreForm } from "./score-forms";
import { resultsView, type ResultsView } from "./view";

export const metadata: Metadata = { title: "Results" };

// "Analyze conversations" reads every finished conversation in one AI call.
export const maxDuration = 300;

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

type Query = Record<string, string | string[] | undefined>;

/**
 * The Results tab (D-035): what the class did on each published activity
 * (Insights), each student's score and sending grades to Canvas (Grades), and
 * students' disputes to answer (Disputes).
 */
export default async function ResultsPage({ params, searchParams }: PageProps<"/courses/[courseId]/grading">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const q = await searchParams;
  const [assignments, disputes] = await Promise.all([
    listCourseGrades(db(), actor, course.id),
    listCourseDisputes(db(), actor, course.id),
  ]);

  if (assignments.length === 0) {
    return (
      <EmptyState title="Nothing to review yet">
        <p>
          When you publish an activity and students finish it, you&apos;ll see what the class understood, each
          student&apos;s score and conversation, and send grades to Canvas when you&apos;re ready.
        </p>
      </EmptyState>
    );
  }

  const view = resultsView(q.view);
  const base = `/courses/${course.id}/grading`;
  const open = disputes.filter((d) => d.status === "open").length;
  const views: { key: ResultsView; label: string }[] = [
    { key: "insights", label: "Insights" },
    { key: "grades", label: "Grades" },
    { key: "disputes", label: open > 0 ? `Disputes (${open})` : "Disputes" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Show results" className="inline-flex self-start overflow-x-auto rounded-control border border-border-strong text-sm">
        {views.map((v, i) => (
          <Link
            key={v.key}
            href={`${base}?view=${v.key}`}
            aria-current={v.key === view ? "page" : undefined}
            className={`px-3 py-2 whitespace-nowrap sm:px-4 ${i > 0 ? "border-l border-border-strong" : ""} ${
              v.key === view ? "bg-accent font-bold text-white" : "bg-surface text-accent-text hover:bg-subtle"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      {view === "insights" ? (
        <InsightsView actor={actor} assignments={assignments} base={base} q={q} courseId={course.id} />
      ) : view === "grades" ? (
        <Grades assignments={assignments} courseId={course.id} base={base} q={q} openDisputes={open} />
      ) : (
        <Disputes disputes={disputes} courseId={course.id} base={base} q={q} />
      )}
    </div>
  );
}

/** Each student's score on each activity, changeable, and sending grades to Canvas. */
async function Grades({
  assignments,
  courseId,
  base,
  q,
  openDisputes,
}: {
  assignments: AssignmentGrades[];
  courseId: string;
  base: string;
  q: Query;
  openDisputes: number;
}) {
  const error = typeof q.error === "string" ? ERRORS[q.error] : undefined;
  const fromCanvas = await isLtiCourse(db(), courseId);
  const pushError = typeof q.pusherror === "string" ? (REFUSAL[q.pusherror as keyof typeof REFUSAL] ?? REFUSAL.unavailable) : null;
  const from = `${base}?view=grades`;

  return (
    <div className="flex flex-col gap-8">
      {openDisputes > 0 && (
        <p role="status" className="rounded-panel border border-border-strong bg-accent-soft px-4 py-3">
          {openDisputes === 1 ? "A student disputed a grade." : `${openDisputes} students disputed a grade.`}{" "}
          <Link href={`${base}?view=disputes`} className="font-medium text-accent-text hover:underline">
            Answer {openDisputes === 1 ? "it" : "them"} in Disputes
          </Link>
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
                <input type="hidden" name="courseId" value={courseId} />
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
              {pushError ? <p>{pushError}</p> : summaryLines(readSummary(q)).map((line) => <p key={line}>{line}</p>)}
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
                    {s.attemptId ? (
                      <Link href={`${base}/attempts/${s.attemptId}`} className="font-medium break-words text-accent-text hover:underline">
                        {s.name}
                      </Link>
                    ) : (
                      <span className="font-medium break-words">{s.name}</span>
                    )}
                    <span className="text-sm text-muted break-all" translate="no">
                      {s.loginId}
                      {s.studentView && <span translate="yes"> · Student View</span>}
                      {s.flagged && <span translate="yes"> · Not on the latest class list</span>}
                    </span>
                  </div>
                  {s.disputeId && s.attemptId ? (
                    <Link href={`${base}?view=disputes#${s.attemptId}`} className="text-sm font-medium text-danger hover:underline">
                      Disputed: answer it
                    </Link>
                  ) : s.status === "graded" && s.attemptId ? (
                    <ScoreForm
                      courseId={courseId}
                      from={from}
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

/** Students asking for another look: open ones to answer, then the ones already answered. */
function Disputes({ disputes, courseId, base, q }: { disputes: CourseDispute[]; courseId: string; base: string; q: Query }) {
  const error = typeof q.error === "string" ? ERRORS[q.error] : undefined;
  const open = disputes.filter((d) => d.status === "open");
  const resolved = disputes.filter((d) => d.status === "resolved");
  const from = `${base}?view=disputes`;
  const counted = (d: CourseDispute) => pointsFormat.format(d.teacherScore ?? d.aiScore);

  return (
    <div className="flex flex-col gap-8">
      {typeof q.resolved === "string" && (
        <p role="status" className="rounded-panel border border-border-strong bg-accent-soft px-4 py-3">
          Dispute resolved. The student sees your answer with their grade.
        </p>
      )}
      <section className="flex flex-col gap-3" aria-labelledby="open-disputes">
        <h2 id="open-disputes" className="font-display text-xl font-semibold">
          To answer
        </h2>
        {open.length === 0 ? (
          <p className="border border-dashed border-border-strong px-6 py-8 text-muted">
            No open disputes. When a student asks you to look at a grade again, it shows up here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
            {open.map((d) => (
              <li key={d.id} id={d.attemptId} className="flex scroll-mt-4 flex-col gap-3 px-4 py-4 lg:flex-row lg:gap-8">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="font-medium break-words">
                    {d.studentName} <span className="font-normal text-muted">· {d.activityTitle}</span>
                  </p>
                  <p className="text-sm text-muted">
                    Asked <LocalTime value={d.openedAt} style="day" /> · Score {counted(d)} of {pointsFormat.format(d.maxScore)} ·{" "}
                    <Link href={`${base}/attempts/${d.attemptId}`} className="text-accent-text hover:underline">
                      Read the conversation and grade
                    </Link>
                  </p>
                </div>
                <DisputeForm
                  courseId={courseId}
                  from={from}
                  student={{ ...d, name: d.studentName, disputeId: d.id, disputeReason: d.reason }}
                  error={q.attempt === d.attemptId ? error : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      {resolved.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="resolved-disputes">
          <h2 id="resolved-disputes" className="font-display text-xl font-semibold">
            Answered
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
            {resolved.map((d) => (
              <li key={d.id} className="flex flex-col gap-1 px-4 py-3">
                <p className="font-medium break-words">
                  <Link href={`${base}/attempts/${d.attemptId}`} className="text-accent-text hover:underline">
                    {d.studentName}
                  </Link>{" "}
                  <span className="font-normal text-muted">· {d.activityTitle}</span>
                </p>
                <p className="text-sm break-words whitespace-pre-wrap">&ldquo;{d.reason}&rdquo;</p>
                <p className="text-sm text-muted">
                  {d.resolvedAt && (
                    <>
                      Answered <LocalTime value={d.resolvedAt} style="day" /> ·{" "}
                    </>
                  )}
                  Score {counted(d)} of {pointsFormat.format(d.maxScore)}
                  {d.teacherScore !== null && ` (the AI gave ${pointsFormat.format(d.aiScore)})`}
                  {d.response && <> · You said: &ldquo;{d.response}&rdquo;</>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
