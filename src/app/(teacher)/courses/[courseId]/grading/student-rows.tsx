import Link from "next/link";
import type { StudentGrade } from "@/results/grading";
import { ScoreForm } from "./score-forms";

export const STATUS: Record<StudentGrade["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Being graded",
  graded: "Graded",
};

export const SCORE_ERRORS: Record<string, string> = {
  out_of_range: "Enter a score from 0 up to the assignment's points.",
  not_found: "That attempt isn't graded yet, so its score can't be changed.",
};

type Query = Record<string, string | string[] | undefined>;

/** One assignment's students: each with where they stand, their chat, and their score to keep or change. */
export function StudentRows({ students, courseId, base, from, q }: { students: StudentGrade[]; courseId: string; base: string; from: string; q: Query }) {
  const error = typeof q.error === "string" ? SCORE_ERRORS[q.error] : undefined;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
      {students.map((s) => (
        <li key={s.userId} id={s.attemptId ?? undefined} className="flex scroll-mt-4 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex min-w-0 flex-1 flex-col">
            {s.attemptId ? (
              <Link href={`${base}/attempts/${s.attemptId}`} className="font-medium break-words text-accent-text hover:underline">
                {s.name}
              </Link>
            ) : (
              <span className="font-medium break-words">{s.name}</span>
            )}
            <span className="text-sm break-all text-muted" translate="no">
              {s.loginId}
              {s.studentView && <span translate="yes"> · Student View (a test)</span>}
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
  );
}
