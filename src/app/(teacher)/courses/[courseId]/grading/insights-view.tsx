import Link from "next/link";
import { db } from "@/db/client";
import type { Actor } from "@/db/scope";
import { finishedCount, getBrief } from "@/results/brief";
import { testChats, type AssignmentGrades } from "@/results/grading";
import { classInsights } from "@/results/insights";
import { Bar, pointsFormat, share } from "@/results/insights-charts";
import { insightsPath } from "./view";

/**
 * The Insights home (D-035, 2026-11-16): one card per published activity,
 * how far the class is and how it scored, and whether its takeaways are made.
 * Everything here comes from saved grades: opening it costs no AI call. The
 * analysis and the questions live on each assignment's own page.
 */
export async function InsightsView({ actor, assignments, courseId }: { actor: Actor; assignments: AssignmentGrades[]; courseId: string }) {
  const cards = await Promise.all(
    assignments.map(async (a) => {
      const [view, brief, finished] = await Promise.all([
        classInsights(db(), actor, a.activityId),
        getBrief(db(), actor, a.activityId),
        finishedCount(db(), a.activityId),
      ]);
      const students = a.students.filter((s) => !s.studentView);
      const newer = brief?.brief && brief.conversations !== null ? finished - brief.conversations : 0;
      return { a, view, brief, finished, students: students.length, newer, tests: testChats(a) };
    }),
  );
  // Assignments someone has finished first; the rest wait, muted, below.
  const ordered = [...cards.filter((c) => c.finished > 0), ...cards.filter((c) => c.finished === 0)];
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[65ch] text-muted">
        Pick an assignment to see how the class did. The numbers are ready as soon as chats are graded; the AI&apos;s
        takeaways run when you ask.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map(({ a, view, brief, finished, students, newer, tests }) => {
          const waiting = finished === 0;
          const status = brief?.running
            ? { text: "Analyzing now…", style: "bg-accent-soft text-accent-text" }
            : brief?.brief
              ? newer > 0
                ? { text: `${newer} more finished since takeaways`, style: "bg-warn-soft text-warn-text" }
                : { text: "Takeaways ready", style: "bg-accent-soft text-accent-text" }
              : waiting
                ? { text: "No one has finished", style: "bg-subtle text-muted" }
                : { text: "Not analyzed yet", style: "bg-subtle text-text" };
          return (
            <li key={a.activityId}>
              <Link
                href={insightsPath(courseId, a.activityId)}
                className={`group flex h-full flex-col gap-4 rounded-panel border bg-surface px-5 py-4 transition-colors hover:border-accent ${
                  waiting ? "border-border opacity-75" : "border-border-strong"
                }`}
              >
                <div className="flex flex-col gap-2">
                  <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-bold ${status.style}`}>{status.text}</span>
                  <h2 className="text-lg leading-snug font-bold text-balance break-words group-hover:text-accent-text">{a.title}</h2>
                </div>
                <div className="mt-auto flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-muted tabular-nums">
                      {finished} of {students} finished
                    </span>
                    <Bar percent={share(finished, students)} />
                    {/* Canvas Student View chats are the teacher's own tests: not counted, but never silently (feedback 309e6e3a). */}
                    {tests > 0 && (
                      <span className="text-[13px] text-muted">
                        + {tests} test {tests === 1 ? "chat" : "chats"} from Student View, not counted
                      </span>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    {view?.average !== null && view?.average !== undefined ? (
                      <span className="flex flex-col">
                        <span className="text-xs font-bold tracking-wide text-muted uppercase">Average</span>
                        <span className="text-xl font-bold tabular-nums">
                          {pointsFormat.format(view.average * a.points)}
                          <span className="text-sm font-normal text-muted"> of {pointsFormat.format(a.points)}</span>
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted">No grades yet</span>
                    )}
                    <span className="text-sm font-medium whitespace-nowrap text-accent-text">Open insights →</span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
