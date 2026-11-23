import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { isLtiCourse } from "@/lti/roster";
import { gradeCounts, listCourseGrades, type StudentGrade } from "@/results/grading";
import { sendGradesAction } from "../../actions";
import { REFUSAL, readSummary, summaryLines } from "../../push-text";
import { StudentRows } from "../../student-rows";
import { gradesPath, insightsPath } from "../../view";

export const metadata: Metadata = { title: "Grades" };

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const SHOWS = [
  { key: "finished", label: "Finished", match: (s: StudentGrade) => s.status === "graded" || s.status === "submitted" },
  { key: "in_progress", label: "In progress", match: (s: StudentGrade) => s.status === "in_progress" },
  { key: "not_started", label: "Not started", match: (s: StudentGrade) => s.status === "not_started" },
  { key: "all", label: "Everyone", match: () => true },
] as const;

/**
 * One assignment's grades (feedback 12f80baa): where the class stands, each
 * finished student's score to keep or change, and Send grades to Canvas.
 * Opens on the students who finished; the rest are a click away.
 */
export default async function AssignmentGradesPage({ params, searchParams }: PageProps<"/courses/[courseId]/grading/grades/[activityId]">) {
  const { courseId, activityId } = await params;
  const { actor, course } = await loadTaughtCourse(courseId);
  const q = await searchParams;
  const assignment = (await listCourseGrades(db(), actor, course.id)).find((a) => a.activityId === activityId);
  if (!assignment) notFound();

  const base = `/courses/${course.id}/grading`;
  const here = gradesPath(course.id, activityId);
  const counts = gradeCounts(assignment);
  const show = SHOWS.find((x) => x.key === q.show) ?? SHOWS[0];
  // Disputed first: they're waiting on the teacher.
  const students = assignment.students.filter(show.match).sort((a, b) => Number(b.disputeId !== null) - Number(a.disputeId !== null));
  const fromCanvas = await isLtiCourse(db(), course.id);
  const pushError = typeof q.pusherror === "string" ? (REFUSAL[q.pusherror as keyof typeof REFUSAL] ?? REFUSAL.unavailable) : null;
  const pushed = q.pushed === activityId;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href={`${base}?view=grades`} className="self-start text-sm text-accent-text hover:underline">
          ← All assignments
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-2xl font-normal text-balance break-words">{assignment.title}</h2>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
              <span>{pointsFormat.format(assignment.points)} points</span>
              <span>{assignment.dueAt ? <>Due <LocalTime value={assignment.dueAt} /></> : "No due date"}</span>
              <Link href={insightsPath(course.id, activityId)} className="text-accent-text hover:underline">
                Insights for this assignment →
              </Link>
            </p>
          </div>
          {fromCanvas && counts.graded > 0 && (
            <form action={sendGradesAction} id="send" className="flex flex-col items-start gap-1 sm:items-end">
              <input type="hidden" name="courseId" value={course.id} />
              <input type="hidden" name="activityId" value={activityId} />
              <input type="hidden" name="clientKey" value={randomUUID()} />
              <Button>Send grades to Canvas</Button>
              <span className="text-[13px] text-muted">
                {assignment.lastSentAt ? <>Last sent <LocalTime value={assignment.lastSentAt} /></> : "Not sent yet"}
              </span>
            </form>
          )}
        </div>
      </header>

      {pushed && (
        <div role={pushError ? "alert" : "status"} className={`rounded-panel border px-4 py-3 text-sm ${pushError ? "border-danger text-danger" : "border-border-strong bg-accent-soft"}`}>
          {pushError ? <p>{pushError}</p> : summaryLines(readSummary(q)).map((line) => <p key={line}>{line}</p>)}
        </div>
      )}
      {counts.disputed > 0 && (
        <p role="status" className="rounded-panel border border-danger/40 bg-danger-soft px-4 py-3">
          {counts.disputed === 1 ? "A student disputed their grade." : `${counts.disputed} students disputed their grade.`} They&apos;re at the
          top of the list.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Graded", value: counts.graded },
          { label: "Being graded", value: counts.beingGraded },
          { label: "In progress", value: counts.inProgress },
          { label: "Not started", value: counts.notStarted },
        ].map((c) => (
          <div key={c.label} className="rounded-panel border border-border bg-surface px-4 py-3">
            <dt className="text-xs font-bold tracking-wide text-muted uppercase">{c.label}</dt>
            <dd className="text-2xl font-bold tabular-nums">
              {c.value} <span className="text-sm font-normal text-muted">of {counts.students}</span>
            </dd>
          </div>
        ))}
      </dl>

      <nav aria-label="Show students" className="inline-flex max-w-full self-start overflow-x-auto rounded-control border border-border-strong text-sm">
        {SHOWS.map((x, i) => {
          const n = assignment.students.filter(x.match).length;
          return (
            <Link
              key={x.key}
              href={x.key === "finished" ? here : `${here}?show=${x.key}`}
              aria-current={x.key === show.key ? "page" : undefined}
              className={`px-3 py-1.5 whitespace-nowrap ${i > 0 ? "border-l border-border-strong" : ""} ${
                x.key === show.key ? "bg-accent font-bold text-white" : "bg-surface text-accent-text hover:bg-subtle"
              }`}
            >
              {x.label} ({n})
            </Link>
          );
        })}
      </nav>

      {students.length === 0 ? (
        <p className="border border-dashed border-border-strong px-6 py-8 text-muted">
          {show.key === "finished" ? "No one has finished yet. Their scores show up here as soon as they do." : "No one here."}
        </p>
      ) : (
        <StudentRows students={students} courseId={course.id} base={base} from={show.key === "finished" ? here : `${here}?show=${show.key}`} q={q} />
      )}
    </div>
  );
}
