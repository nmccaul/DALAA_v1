import Link from "next/link";
import { db } from "@/db/client";
import type { Actor } from "@/db/scope";
import type { AssignmentGrades } from "@/results/grading";
import { classInsights, type ClassInsights, type Quote, type Tally } from "@/results/insights";

const share = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));
const studentsLabel = (n: number) => `${n} ${n === 1 ? "student" : "students"}`;
const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/**
 * The Insights view (D-035): for each activity, the positions the class took
 * and the points it raised (open one for what students said), and how it did
 * on each rubric criterion. Quotes are anonymous until the teacher shows
 * names; until then no name is in the page at all.
 */
export async function InsightsView({
  actor,
  assignments,
  base,
  names,
}: {
  actor: Actor;
  assignments: AssignmentGrades[];
  base: string;
  names: boolean;
}) {
  const views = await Promise.all(assignments.map((a) => classInsights(db(), actor, a.activityId)));
  return (
    <div className="flex flex-col gap-10">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        {names ? "Showing who said what." : "What students said is shown without names, so you can put it on screen in class."}
        <Link href={`${base}?view=insights${names ? "" : "&names=1"}`} className="font-medium text-accent-text hover:underline">
          {names ? "Hide names" : "Show names"}
        </Link>
      </p>
      {assignments.map((a, i) => {
        const students = a.students.filter((s) => !s.studentView);
        const started = students.filter((s) => s.status !== "not_started").length;
        const view = views[i];
        return (
          <section key={a.activityId} className="flex flex-col gap-4" aria-labelledby={`insights-${a.activityId}`}>
            <div className="flex flex-col gap-0.5">
              <h2 id={`insights-${a.activityId}`} className="font-display text-xl font-semibold break-words">
                {a.title}
              </h2>
              <p className="text-sm text-muted">
                {started} of {studentsLabel(students.length)} started, {view?.graded ?? 0} graded ·{" "}
                <Link href={`${base}?view=grades#grades-${a.activityId}`} className="text-accent-text hover:underline">
                  Grades
                </Link>
              </p>
            </div>
            {!view || view.graded === 0 ? (
              <p className="border border-dashed border-border-strong px-6 py-8 text-muted">
                Nothing to show yet. What the class said shows up here as students&apos; chats are graded.
              </p>
            ) : (
              <ActivityInsights view={view} base={base} names={names} />
            )}
          </section>
        );
      })}
    </div>
  );
}

function ActivityInsights({ view, base, names }: { view: ClassInsights; base: string; names: boolean }) {
  const weakest = view.criteria.length > 1 ? view.criteria.reduce((w, c) => (c.average / c.max < w.average / w.max ? c : w)) : null;
  return (
    <div className="flex flex-col gap-6">
      {view.positions.length > 0 && (
        <Block title="Positions taken" note={`Of ${studentsLabel(view.graded)} graded. Open one to see who took it.`}>
          {view.positions.map((t) => (
            <TallyRow key={t.label} tally={t} of={view.graded} base={base} names={names} />
          ))}
          {view.noPosition > 0 && (
            <p className="text-sm text-muted">
              No position: {view.noPosition} of {view.graded}
            </p>
          )}
        </Block>
      )}
      {view.touchpoints.length > 0 && (
        <Block title="Points raised" note={`Of ${studentsLabel(view.graded)} graded. Open one to see what students said.`}>
          {view.touchpoints.map((t) => (
            <TallyRow key={t.label} tally={t} of={view.graded} base={base} names={names} />
          ))}
        </Block>
      )}
      {view.criteria.length > 0 && (
        <Block title="Rubric" note="The class average on each criterion.">
          {view.criteria.map((c) => (
            <div key={c.label} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="min-w-0 break-words">
                  {c.label}
                  {c === weakest && (
                    <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-text">Weakest</span>
                  )}
                </span>
                <span className="text-sm whitespace-nowrap text-muted tabular-nums">
                  {pointsFormat.format(c.average)} of {pointsFormat.format(c.max)} on average
                </span>
              </div>
              <Bar percent={share(c.average, c.max)} />
            </div>
          ))}
        </Block>
      )}
    </div>
  );
}

function Block({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-panel border border-border bg-surface px-5 py-4">
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="text-sm text-muted">{note}</p>
      </div>
      {children}
    </div>
  );
}

function Bar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-subtle" aria-hidden>
      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** A position or point: its share of the class, opening to what each student said. */
function TallyRow({ tally, of, base, names }: { tally: Tally; of: number; base: string; names: boolean }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none flex-col gap-1 select-none">
        <span className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="min-w-0 break-words">
            <span className="mr-1.5 inline-block text-muted transition-transform group-open:rotate-90" aria-hidden>
              ▸
            </span>
            {tally.label}
          </span>
          <span className="text-sm whitespace-nowrap text-muted tabular-nums">
            {tally.students} of {of} · {share(tally.students, of)}%
          </span>
        </span>
        <Bar percent={share(tally.students, of)} />
      </summary>
      <ul className="mt-3 flex flex-col gap-2 border-l-2 border-border-strong pl-4">
        {tally.quotes.map((q) => (
          <QuoteLine key={q.attemptId} quote={q} base={base} names={names} />
        ))}
      </ul>
    </details>
  );
}

function QuoteLine({ quote, base, names }: { quote: Quote; base: string; names: boolean }) {
  return (
    <li className="flex flex-col gap-0.5 text-sm">
      {quote.text && <span className="break-words">&ldquo;{quote.text}&rdquo;</span>}
      <span className="text-muted">
        {names ? quote.studentName : "A student"} ·{" "}
        <Link href={`${base}/attempts/${quote.attemptId}`} className="text-accent-text hover:underline">
          Read the conversation
        </Link>
      </span>
    </li>
  );
}
