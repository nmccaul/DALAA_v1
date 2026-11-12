import { Button, inputStyles } from "@/components/ui";
import { resolveDisputeAction, setScoreAction } from "./actions";

/**
 * The teacher's score and dispute forms, on the Results tab and a student's
 * transcript page. `from` is the page to come back to after saving.
 */

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** What the forms need of a graded attempt: the scores are all set once it's graded. */
export type Scored = {
  attemptId: string | null;
  name: string;
  aiScore: number | null;
  teacherScore: number | null;
  maxScore: number | null;
};

/** A graded attempt's score: the one that counts, editable, and the AI's when the teacher changed it. */
export function ScoreForm({
  courseId,
  from,
  student,
  saved,
  error,
}: {
  courseId: string;
  from: string;
  student: Scored;
  saved: string | null;
  error?: string;
}) {
  const max = student.maxScore!;
  const counted = student.teacherScore ?? student.aiScore!;
  const inputId = `score-${student.attemptId}`;
  return (
    <form action={setScoreAction} className="flex flex-col gap-1 sm:items-end">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="from" value={from} />
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
export function DisputeForm({
  courseId,
  from,
  student,
  error,
}: {
  courseId: string;
  from: string;
  student: Scored & { disputeId: string; disputeReason: string };
  error?: string;
}) {
  const max = student.maxScore!;
  const id = `dispute-${student.attemptId}`;
  return (
    <form action={resolveDisputeAction} className="flex w-full flex-col gap-2 sm:max-w-md">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="attemptId" value={student.attemptId!} />
      <input type="hidden" name="disputeId" value={student.disputeId} />
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
