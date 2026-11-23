import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { isLtiCourse } from "@/lti/roster";
import { getGradebook, type Gradebook } from "@/results/gradebook";
import { byRecentSubmission, listCourseGrades } from "@/results/grading";
import { GradePanel } from "./grade-panel";
import { GradebookGrid, type GridColumn, type GridRow } from "./gradebook-grid";
import { InsightsView } from "./insights-view";
import { REFUSAL, readSummary, summaryLines } from "./push-text";
import { resultsView, type ResultsView } from "./view";

export const metadata: Metadata = { title: "Results" };

type Query = Record<string, string | string[] | undefined>;

/**
 * The Results tab (D-046): the Gradebook (every student's grade on every
 * assignment, what's in Canvas and what isn't, disputes to answer, each
 * grade opened beside it) and Insights.
 */
export default async function ResultsPage({ params, searchParams }: PageProps<"/courses/[courseId]/grading">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const q = await searchParams;
  const view = resultsView(q.view);
  const base = `/courses/${course.id}/grading`;
  const [book, linked] = await Promise.all([getGradebook(db(), actor, course.id), isLtiCourse(db(), course.id)]);

  if (book.columns.length === 0) {
    return (
      <EmptyState title="Nothing to review yet">
        <p>
          When you publish an activity and students finish it, you&apos;ll see each student&apos;s grade here, what the
          class understood, and send grades to Canvas when you&apos;re ready.
        </p>
      </EmptyState>
    );
  }

  const disputed = book.rows.reduce((n, r) => n + Object.values(r.cells).filter((c) => c.disputeId !== null).length, 0);
  const views: { key: ResultsView; label: string }[] = [
    { key: "gradebook", label: disputed > 0 ? `Gradebook (${disputed} disputed)` : "Gradebook" },
    { key: "insights", label: "Insights" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Show results" className="inline-flex max-w-full self-start overflow-x-auto rounded-control border border-border-strong text-sm">
        {views.map((v, i) => (
          <Link
            key={v.key}
            href={v.key === "gradebook" ? base : `${base}?view=${v.key}`}
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
        <InsightsView actor={actor} assignments={await listCourseGrades(db(), actor, course.id)} courseId={course.id} />
      ) : (
        <GradebookView book={book} linked={linked} courseId={course.id} base={base} q={q} actor={actor} />
      )}
    </div>
  );
}

async function GradebookView({
  book,
  linked,
  courseId,
  base,
  q,
  actor,
}: {
  book: Gradebook;
  linked: boolean;
  courseId: string;
  base: string;
  q: Query;
  actor: Parameters<typeof GradePanel>[0]["actor"];
}) {
  const columns = byRecentSubmission(book.columns);
  const assignment = typeof q.assignment === "string" && columns.some((c) => c.activityId === q.assignment) ? q.assignment : null;
  const open = typeof q.open === "string" ? q.open : null;
  const pushed = typeof q.pushed === "string" ? columns.find((c) => c.activityId === q.pushed) : undefined;
  const pushError = typeof q.pusherror === "string" ? (REFUSAL[q.pusherror as keyof typeof REFUSAL] ?? REFUSAL.unavailable) : null;

  const gridColumns: GridColumn[] = columns.map((c) => ({
    id: c.activityId,
    title: c.title,
    points: c.points,
    graded: c.graded,
    unsent: c.unsent,
    sendKey: randomUUID(),
  }));
  const gridRows: GridRow[] = book.rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    loginId: r.loginId,
    note: r.studentView ? "Student View (a test)" : r.flagged ? "Not on the latest class list" : null,
    cells: Object.fromEntries(
      Object.entries(r.cells).map(([id, c]) => [
        id,
        {
          attemptId: c.attemptId,
          status: c.status,
          score: c.status === "graded" ? (c.teacherScore ?? c.aiScore) : null,
          canvas: c.canvas,
          disputed: c.disputeId !== null,
        },
      ]),
    ),
  }));

  // The open grade: its Canvas state, and the finished students above and below it in its column.
  let panel = null;
  if (open) {
    const owner = book.rows.find((r) => Object.values(r.cells).some((c) => c.attemptId === open));
    const entry = owner && Object.entries(owner.cells).find(([, c]) => c.attemptId === open);
    if (entry) {
      const [activityId, cell] = entry;
      const finished = book.rows.flatMap((r) => {
        const c = r.cells[activityId];
        return c?.attemptId && (c.status === "graded" || c.status === "submitted") ? [c.attemptId] : [];
      });
      const at = finished.indexOf(open);
      panel = (
        <GradePanel
          actor={actor}
          courseId={courseId}
          attemptId={open}
          canvas={cell.canvas}
          lastSent={cell.lastSent}
          linked={linked}
          neighbors={{ prev: at > 0 ? finished[at - 1] : null, next: at >= 0 && at < finished.length - 1 ? finished[at + 1] : null, at, of: finished.length }}
          assignment={assignment}
          q={q}
        />
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {pushed && (
        <div role={pushError ? "alert" : "status"} className={`rounded-panel border px-4 py-3 text-sm ${pushError ? "border-danger text-danger" : "border-border-strong bg-accent-soft"}`}>
          <p className="font-bold">{pushed.title}</p>
          {pushError ? <p>{pushError}</p> : summaryLines(readSummary(q)).map((line) => <p key={line}>{line}</p>)}
        </div>
      )}
      <GradebookGrid courseId={courseId} columns={gridColumns} rows={gridRows} linked={linked} base={base} open={open} initialAssignment={assignment} />
      {panel}
    </div>
  );
}
