import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { listCourseDisputes, type CourseDispute } from "@/results/disputes";
import { byRecentSubmission, gradeCounts, listCourseGrades, type AssignmentGrades } from "@/results/grading";
import { ListSearch, NoMatches, SearchBox, SearchGroup, SearchItem } from "@/components/list-search";
import { InsightsView } from "./insights-view";
import { DisputeForm } from "./score-forms";
import { SCORE_ERRORS } from "./student-rows";
import { gradesPath, resultsView, type ResultsView } from "./view";

export const metadata: Metadata = { title: "Results" };

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

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
        <InsightsView actor={actor} assignments={assignments} courseId={course.id} />
      ) : view === "grades" ? (
        <Grades assignments={assignments} courseId={course.id} base={base} openDisputes={open} />
      ) : (
        <Disputes disputes={disputes} courseId={course.id} base={base} q={q} />
      )}
    </div>
  );
}

/**
 * Grades (feedback 12f80baa, 2154c3d7, c7ef8807): one row per assignment,
 * the latest submissions first, with where the class stands. Each opens its
 * own page of students, scores and Send to Canvas.
 */
function Grades({ assignments, courseId, base, openDisputes }: { assignments: AssignmentGrades[]; courseId: string; base: string; openDisputes: number }) {
  const ordered = byRecentSubmission(assignments);
  return (
    <ListSearch className="flex flex-col gap-4">
      {openDisputes > 0 && (
        <p role="status" className="rounded-panel border border-danger/40 bg-danger-soft px-4 py-3">
          {openDisputes === 1 ? "A student disputed a grade." : `${openDisputes} students disputed a grade.`}{" "}
          <Link href={`${base}?view=disputes`} className="font-medium text-accent-text hover:underline">
            Answer {openDisputes === 1 ? "it" : "them"} in Disputes
          </Link>
        </p>
      )}
      <SearchBox placeholder="Search for an assignment" />
      <SearchGroup texts={ordered.map((a) => a.title)}>
        <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
          {ordered.map((a) => {
            const c = gradeCounts(a);
            const finished = c.graded + c.beingGraded;
            return (
              <SearchItem key={a.activityId} text={a.title}>
                <li>
                  <Link
                    href={gradesPath(courseId, a.activityId)}
                    className={`group flex flex-col gap-2 px-4 py-4 hover:bg-subtle sm:flex-row sm:items-center sm:gap-6 ${finished === 0 ? "opacity-75" : ""}`}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-bold break-words group-hover:text-accent-text group-hover:underline">{a.title}</span>
                      <span className="text-[13px] text-muted">
                        {pointsFormat.format(a.points)} points ·{" "}
                        {a.lastSubmittedAt ? (
                          <>
                            Last finished <LocalTime value={a.lastSubmittedAt} style="day" />
                          </>
                        ) : (
                          "No one has finished"
                        )}
                        {a.lastSentAt && (
                          <>
                            {" · "}Sent to Canvas <LocalTime value={a.lastSentAt} style="day" />
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      {c.disputed > 0 && <span className="rounded-full bg-danger-soft px-2.5 py-0.5 font-bold text-danger">{c.disputed} disputed</span>}
                      {c.beingGraded > 0 && <span className="rounded-full bg-warn-soft px-2.5 py-0.5 font-bold text-warn-text">{c.beingGraded} being graded</span>}
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-bold text-accent-text tabular-nums">
                        {c.graded} of {c.students} graded
                      </span>
                      <span className="font-medium whitespace-nowrap text-accent-text">Open →</span>
                    </div>
                  </Link>
                </li>
              </SearchItem>
            );
          })}
        </ul>
      </SearchGroup>
      <NoMatches texts={ordered.map((a) => a.title)} noun="assignments" />
    </ListSearch>
  );
}

/** Students asking for another look: open ones to answer, then the ones already answered. */
function Disputes({ disputes, courseId, base, q }: { disputes: CourseDispute[]; courseId: string; base: string; q: Query }) {
  const error = typeof q.error === "string" ? SCORE_ERRORS[q.error] : undefined;
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
