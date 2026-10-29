import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Button } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { previewGrades } from "@/lti/grades";
import type { PushLine } from "@/results/push-plan";
import { sendGradesAction } from "../../actions";
import { CATEGORY, PREVIEW_ORDER, REFUSAL } from "../../push-text";

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shown only when sending has an exception to decide on (CLAUDE.md: the clean
 * case is one click): what will be sent, what won't and why, then one Send.
 */
export default async function SendGradesPage({ params, searchParams }: PageProps<"/courses/[courseId]/grading/send/[activityId]">) {
  const { courseId, activityId } = await params;
  const { actor, course } = await loadTaughtCourse(courseId);
  const { key } = await searchParams;
  // The key from the Grading tab's click, so a confirm after a retry still sends once.
  const clientKey = typeof key === "string" && UUID.test(key) ? key : randomUUID();
  const preview = await previewGrades(db(), actor, activityId);
  const back = `/courses/${course.id}/grading`;

  if (!preview.ok || !preview.plan.ok) {
    const plan = preview.ok ? preview.plan : null;
    const message =
      plan && !plan.ok
        ? `The Canvas column is out of ${pointsFormat.format(plan.canvasPoints)} points but this assignment is out of ${pointsFormat.format(plan.points)}. DALAA won't rescale grades. Make the points match in Canvas, then send again.`
        : REFUSAL[preview.ok ? "points_mismatch" : preview.reason];
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">Grades can&apos;t be sent</h2>
        <p role="alert" className="max-w-[65ch] text-danger">
          {message}
        </p>
        <Link href={back} className="text-sm font-medium text-accent-text hover:underline">
          ← Back to Grading
        </Link>
      </div>
    );
  }

  const { lines: planLines } = preview.plan;
  const groups = PREVIEW_ORDER.map((category) => ({
    category,
    lines: planLines.filter((l) => l.category === category),
  })).filter((g) => g.lines.length > 0);
  const sending = groups.find((g) => g.category === "send")?.lines.length ?? 0;
  const lowered = groups.find((g) => g.category === "lowered")?.lines.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold break-words">Send grades for {preview.title}</h2>
        <p className="max-w-[65ch] text-muted">Some grades need a look before they go to Canvas.</p>
      </div>

      {groups.map(({ category, lines }) => (
        <section key={category} className="flex flex-col gap-2" aria-labelledby={`push-${category}`}>
          <h3 id={`push-${category}`} className="font-semibold">
            {CATEGORY[category].title} <span className="font-normal text-muted">· {lines.length}</span>
          </h3>
          <p className="max-w-[65ch] text-sm text-muted">{CATEGORY[category].detail}</p>
          <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
            {lines.map((l) => (
              <li key={l.userId} className="flex flex-wrap justify-between gap-x-6 gap-y-1 px-4 py-2 text-sm">
                <span className="font-medium break-words">{l.name}</span>
                <Scores line={l} points={preview.points} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <form action={sendGradesAction} className="flex flex-col gap-3 border-t border-border pt-4">
        <input type="hidden" name="courseId" value={course.id} />
        <input type="hidden" name="activityId" value={activityId} />
        <input type="hidden" name="clientKey" value={clientKey} />
        <input type="hidden" name="confirmed" value="1" />
        {lowered > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="includeLowered" value="1" className="size-4" />
            Also send the {lowered === 1 ? "lower grade" : `${lowered} lower grades`}
          </label>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <Button disabled={sending === 0 && lowered === 0}>
            {sending > 0
              ? `Send ${sending === 1 ? "1 grade" : `${sending} grades`} to Canvas`
              : lowered > 0
                ? "Send to Canvas"
                : "Nothing to send"}
          </Button>
          <Link href={back} className="text-sm font-medium text-muted hover:text-text">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

/** DALAA's grade, and Canvas's when it has one. */
function Scores({ line, points }: { line: PushLine; points: number }) {
  if (line.score === null) return <span className="text-muted">Not graded</span>;
  return (
    <span className="text-muted tabular-nums">
      DALAA {pointsFormat.format(line.score)} of {pointsFormat.format(line.maxScore ?? points)}
      {line.canvasScore !== null && <> · Canvas {pointsFormat.format(line.canvasScore)}</>}
    </span>
  );
}
