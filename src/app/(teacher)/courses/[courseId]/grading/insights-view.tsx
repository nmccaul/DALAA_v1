import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { db } from "@/db/client";
import type { Actor } from "@/db/scope";
import { finishedCount, getBrief, type BriefItem, type SavedBrief } from "@/results/brief";
import type { AssignmentGrades } from "@/results/grading";
import { classInsights, type ClassInsights, type Tally } from "@/results/insights";
import { runBriefAction } from "./actions";
import { BriefButton } from "./brief-button";

const share = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));
const studentsLabel = (n: number) => `${n} ${n === 1 ? "student" : "students"}`;
const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/**
 * The Insights view (D-035): for each activity, the positions the class took
 * and the points it raised (open one for what students said), and how it did
 * on each rubric criterion; and the AI class-prep brief, made when the
 * teacher asks. Quotes are anonymous until the teacher shows names; until
 * then no name is in the page at all.
 */
export async function InsightsView({
  actor,
  assignments,
  base,
  courseId,
  q,
}: {
  actor: Actor;
  assignments: AssignmentGrades[];
  base: string;
  courseId: string;
  q: Record<string, string | string[] | undefined>;
}) {
  const names = q.names === "1";
  const [views, briefs, finished] = await Promise.all([
    Promise.all(assignments.map((a) => classInsights(db(), actor, a.activityId))),
    Promise.all(assignments.map((a) => getBrief(db(), actor, a.activityId))),
    Promise.all(assignments.map((a) => finishedCount(db(), a.activityId))),
  ]);
  // Who each quote is from, by attempt: only filled once the teacher shows names.
  const nameOf = new Map(names ? assignments.flatMap((a) => a.students.flatMap((s) => (s.attemptId ? [[s.attemptId, s.name] as const] : []))) : []);
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
            <BriefBlock
              activityId={a.activityId}
              courseId={courseId}
              saved={briefs[i]}
              finished={finished[i]}
              outcome={q.activity === a.activityId && typeof q.brief === "string" ? q.brief : null}
              base={base}
              names={names}
              nameOf={nameOf}
            />
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

function QuoteLine({
  quote,
  base,
  names,
}: {
  quote: { attemptId: string; studentName?: string; text: string | null };
  base: string;
  names: boolean;
}) {
  return (
    <li className="flex flex-col gap-0.5 text-sm">
      {quote.text && <span className="break-words">&ldquo;{quote.text}&rdquo;</span>}
      <span className="text-muted">
        {names && quote.studentName ? quote.studentName : "A student"} ·{" "}
        <Link href={`${base}/attempts/${quote.attemptId}`} className="text-accent-text hover:underline">
          Read the conversation
        </Link>
      </span>
    </li>
  );
}

const OUTCOME: Record<string, string> = {
  busy: "The conversations are already being read. Wait a minute, then reload this page.",
  failed: "The AI didn't finish reading the conversations. Try again in a minute.",
  nothing_finished: "No one has finished yet, so there's nothing to read.",
  not_found: "We couldn't find that activity.",
};

/**
 * The AI class-prep brief: made only when the teacher asks (it reads every
 * finished conversation), kept until they refresh it, and out of date once
 * more students finish.
 */
function BriefBlock({
  activityId,
  courseId,
  saved,
  finished,
  outcome,
  base,
  names,
  nameOf,
}: {
  activityId: string;
  courseId: string;
  saved: SavedBrief | null;
  finished: number;
  outcome: string | null;
  base: string;
  names: boolean;
  nameOf: ReadonlyMap<string, string>;
}) {
  const brief = saved?.brief ?? null;
  const newer = brief && saved?.conversations !== null ? finished - (saved?.conversations ?? 0) : 0;
  const problem = outcome && outcome !== "made" ? OUTCOME[outcome] : saved?.failed ? OUTCOME.failed : null;
  const button = (
    <form action={runBriefAction}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="activityId" value={activityId} />
      {names && <input type="hidden" name="names" value="1" />}
      <BriefButton label={brief ? "Analyze again" : "Analyze conversations"} />
    </form>
  );
  const items = (title: string, list: BriefItem[]) =>
    list.length > 0 && (
      <div className="flex flex-col gap-2">
        <h4 className="font-bold">{title}</h4>
        <ul className="flex flex-col gap-3">
          {list.map((item) => (
            <li key={item.title}>
              <details className="group">
                <summary className="cursor-pointer list-none select-none">
                  <span className="mr-1.5 inline-block text-muted transition-transform group-open:rotate-90" aria-hidden>
                    ▸
                  </span>
                  <span className="font-medium">{item.title}</span>{" "}
                  <span className="text-sm text-muted">· {studentsLabel(item.students)}</span>
                  <span className="mt-0.5 block pl-4 text-sm">{item.detail}</span>
                </summary>
                <ul className="mt-2 ml-4 flex flex-col gap-2 border-l-2 border-border-strong pl-4">
                  {item.quotes.map((quote) => (
                    <QuoteLine key={quote.attemptId} quote={{ ...quote, studentName: nameOf.get(quote.attemptId) }} base={base} names={names} />
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div id={`brief-${activityId}`} className="flex scroll-mt-4 flex-col gap-4 rounded-panel border border-accent bg-surface px-5 py-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-bold">Class prep brief</h3>
        {brief && saved?.generatedAt ? (
          <p className="text-sm text-muted">
            From {saved.conversations} {saved.conversations === 1 ? "conversation" : "conversations"} · made{" "}
            <LocalTime value={saved.generatedAt} />
            {newer > 0 && ` · ${newer} more ${newer === 1 ? "student has" : "students have"} finished since`}
          </p>
        ) : (
          <p className="text-sm text-muted">
            The AI reads every finished conversation and tells you what the class found confusing, what it did well,
            the questions it asked, and questions to raise in class. It runs only when you ask.
          </p>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {saved?.running && !outcome && <p role="status" className="text-sm text-muted">The conversations are being read now.</p>}
      {brief && (
        <>
          {items("Confusions and misconceptions", brief.confusions)}
          {items("Strong ideas worth sharing", brief.strengths)}
          {items("Questions students asked", brief.questions)}
          {brief.discussion.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="font-bold">Questions to raise in class</h4>
              <ol className="flex list-decimal flex-col gap-1 pl-6">
                {brief.discussion.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </div>
          )}
          {brief.confusions.length + brief.strengths.length + brief.questions.length + brief.discussion.length === 0 && (
            <p className="text-muted">The AI found nothing to point out.</p>
          )}
        </>
      )}
      {finished === 0 ? (
        <p className="text-sm text-muted">Available once a student finishes.</p>
      ) : (
        (!brief || newer > 0 || problem) && button
      )}
      {brief && newer <= 0 && !problem && (
        <details className="text-sm">
          <summary className="cursor-pointer text-accent-text select-none">Analyze again</summary>
          <div className="mt-2">{button}</div>
        </details>
      )}
    </div>
  );
}
