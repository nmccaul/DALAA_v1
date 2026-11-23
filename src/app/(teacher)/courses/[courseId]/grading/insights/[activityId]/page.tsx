import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { finishedCount, getBrief, type ClassBrief, type SavedBrief } from "@/results/brief";
import { listCourseGrades, testChats, testChatsNote } from "@/results/grading";
import { classInsights, weakestCriteria, type ClassInsights } from "@/results/insights";
import {
  BarRow,
  Histogram,
  Panel,
  pointsFormat,
  share,
  StackedBar,
  StatTile,
  studentsLabel,
  TakeawayCard,
  TallyRow,
  type TakeawayKind,
} from "@/results/insights-charts";
import { runBriefAction } from "../../actions";
import { BriefButton } from "../../brief-button";
import { AskPanel } from "./ask-panel";
import { CopyList } from "./copy-list";

export const metadata: Metadata = { title: "Insights" };

// "Analyze conversations" reads every finished conversation in one AI call.
export const maxDuration = 300;

const OUTCOME: Record<string, string> = {
  busy: "The conversations are already being read. Wait a minute, then reload this page.",
  failed: "The AI didn't finish reading the conversations. Try again in a minute.",
  nothing_finished: "No one has finished yet, so there's nothing to read.",
  not_found: "We couldn't find that activity.",
};

/**
 * One assignment's Insights (D-035, 2026-11-16): the numbers first, free from
 * saved grades; then, when the teacher asks, the AI's big takeaways from the
 * finished conversations. Quotes are anonymous until the teacher shows names;
 * until then no name is in the page at all.
 */
export default async function AssignmentInsightsPage({ params, searchParams }: PageProps<"/courses/[courseId]/grading/insights/[activityId]">) {
  const { courseId, activityId } = await params;
  const { actor, course } = await loadTaughtCourse(courseId);
  const assignment = (await listCourseGrades(db(), actor, course.id)).find((a) => a.activityId === activityId);
  if (!assignment) notFound();
  const q = await searchParams;
  const names = q.names === "1";
  const [view, saved, finished] = await Promise.all([
    classInsights(db(), actor, activityId),
    getBrief(db(), actor, activityId),
    finishedCount(db(), activityId),
  ]);
  if (!view || !saved) notFound();

  const base = `/courses/${course.id}/grading`;
  const here = `${base}/insights/${activityId}`;
  const students = assignment.students.filter((s) => !s.studentView);
  // Who each quote is from, by attempt: only filled once the teacher shows names.
  const nameOf = new Map(names ? assignment.students.flatMap((s) => (s.attemptId ? [[s.attemptId, s.name] as const] : [])) : []);
  const who = (attemptId: string) => nameOf.get(attemptId) ?? null;
  const quoteHref = (attemptId: string) => `${base}/attempts/${attemptId}?from=insights`;
  const outcome = typeof q.brief === "string" ? q.brief : null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href={`${base}?view=insights`} className="self-start text-sm text-accent-text hover:underline">
          ← All assignments
        </Link>
        <h2 className="text-2xl font-normal text-balance break-words">{assignment.title}</h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>
            {finished} of {studentsLabel(students.length)} finished · {view.graded} graded
          </span>
          <Link href={`${base}?view=grades#grades-${activityId}`} className="text-accent-text hover:underline">
            Grades
          </Link>
          <Link href={`${here}${names ? "" : "?names=1"}`} className="text-accent-text hover:underline">
            {names ? "Hide names" : "Show names"}
          </Link>
        </p>
        {testChats(assignment) > 0 && (
          <p role="note" className="mt-1 max-w-prose rounded-control border border-border bg-subtle px-3 py-2 text-sm">
            {testChatsNote(testChats(assignment))}{" "}
            <Link href={`${base}?view=grades#grades-${activityId}`} className="font-medium text-accent-text underline">
              Open Grades
            </Link>
          </p>
        )}
      </header>

      <Stats view={view} points={assignment.points} finished={finished} students={students.length} />

      <Takeaways
        saved={saved}
        finished={finished}
        outcome={outcome}
        form={{ courseId: course.id, activityId, names }}
        quoteHref={quoteHref}
        nameOf={who}
      />

      {finished > 0 && <AskPanel activityId={activityId} attemptsBase={`${base}/attempts`} names={Object.fromEntries(nameOf)} />}

      {view.graded > 0 && <Numbers view={view} quoteHref={quoteHref} nameOf={who} />}
    </div>
  );
}

/** Four numbers a teacher reads first, all from saved grades. */
function Stats({ view, points, finished, students }: { view: ClassInsights; points: number; finished: number; students: number }) {
  const lowest = weakestCriteria(view.criteria);
  const weakest = lowest.length === 1 ? lowest[0] : null;
  const missed = view.touchpoints.length > 0 ? view.touchpoints[view.touchpoints.length - 1] : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Finished" value={`${finished} of ${students}`} note={`${share(finished, students)}% of the class`} />
      <StatTile
        label="Average score"
        value={view.average === null ? "—" : `${pointsFormat.format(view.average * points)} / ${pointsFormat.format(points)}`}
        note={view.average === null ? "Once chats are graded" : `${Math.round(view.average * 100)}% across ${studentsLabel(view.graded)}`}
      />
      <StatTile
        label="Weakest criterion"
        value={<span className="text-lg leading-snug">{weakest ? weakest.label : lowest.length > 1 ? `${lowest.length} tied` : "—"}</span>}
        note={
          weakest
            ? `${pointsFormat.format(weakest.average)} of ${pointsFormat.format(weakest.max)} on average`
            : lowest.length > 1
              ? `${share(lowest[0].average, lowest[0].max)}% on average each`
              : view.criteria.length > 1 && view.graded > 0
                ? "Every criterion scored the same"
                : undefined
        }
        tone={lowest.length > 0 && lowest[0].average / lowest[0].max < 0.7 ? "warn" : "plain"}
      />
      <StatTile
        label="Most-missed point"
        value={<span className="text-lg leading-snug">{missed && view.graded > 0 ? missed.label : "—"}</span>}
        note={missed && view.graded > 0 ? `Raised by ${missed.students} of ${view.graded}` : undefined}
        tone={missed && share(missed.students, view.graded) < 50 ? "warn" : "plain"}
      />
    </div>
  );
}

/** How many takeaways show before "more findings". */
const TOP_TAKEAWAYS = 3;

const SECTIONS: { kind: TakeawayKind; key: keyof Pick<ClassBrief, "confusions" | "strengths" | "questions"> }[] = [
  { kind: "confusion", key: "confusions" },
  { kind: "strength", key: "strengths" },
  { kind: "question", key: "questions" },
];

/**
 * The AI's big takeaways: made only when the teacher asks (it reads every
 * finished conversation), kept until they run it again, and marked out of
 * date once more students finish.
 */
function Takeaways({
  saved,
  finished,
  outcome,
  form,
  quoteHref,
  nameOf,
}: {
  saved: SavedBrief;
  finished: number;
  outcome: string | null;
  form: { courseId: string; activityId: string; names: boolean };
  quoteHref: (attemptId: string) => string;
  nameOf: (attemptId: string) => string | null;
}) {
  const brief = saved.brief;
  const read = saved.conversations ?? 0;
  const newer = brief ? finished - read : 0;
  const problem = outcome && outcome !== "made" ? OUTCOME[outcome] : saved.failed ? OUTCOME.failed : null;
  const button = (label: string, variant: "primary" | "secondary") => (
    <form action={runBriefAction}>
      <input type="hidden" name="courseId" value={form.courseId} />
      <input type="hidden" name="activityId" value={form.activityId} />
      {form.names && <input type="hidden" name="names" value="1" />}
      <BriefButton label={label} variant={variant} />
    </form>
  );
  const status = (
    <>
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {saved.running && !outcome && (
        <p role="status" className="text-sm text-muted">
          The conversations are being read now. Reload in a minute.
        </p>
      )}
    </>
  );

  if (!brief) {
    return (
      <section id="takeaways" aria-labelledby="takeaways-title" className="flex scroll-mt-4 flex-col items-start gap-3 rounded-panel border border-accent/30 bg-accent-soft px-6 py-6">
        <h3 id="takeaways-title" className="text-xl font-bold">
          Big takeaways
        </h3>
        <p className="max-w-[60ch]">
          {finished === 0
            ? "Once students finish, DALAA can read their conversations and tell you what the class understood, what confused it, and what to raise in class."
            : `DALAA reads the ${finished} finished ${finished === 1 ? "conversation" : "conversations"} and tells you what the class understood, what confused it, and what to raise in class. It takes about a minute and runs only when you ask.`}
        </p>
        {status}
        {finished > 0 && button("Analyze conversations", "primary")}
      </section>
    );
  }

  // The big ones first: what covers the most students, whatever its kind; the rest a click away.
  const cards = SECTIONS.flatMap(({ kind, key }) => brief[key].map((item) => ({ kind, item }))).sort((a, b) => b.item.students - a.item.students);
  const top = cards.slice(0, TOP_TAKEAWAYS);
  const more = cards.slice(TOP_TAKEAWAYS);
  const card = ({ kind, item }: (typeof cards)[number]) => (
    <TakeawayCard key={`${kind}-${item.title}`} kind={kind} item={item} of={read} quoteHref={quoteHref} nameOf={nameOf} />
  );
  return (
    <section id="takeaways" aria-labelledby="takeaways-title" className="flex scroll-mt-4 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h3 id="takeaways-title" className="text-xl font-bold">
            Big takeaways
          </h3>
          <p className="text-sm text-muted">
            From {read} {read === 1 ? "conversation" : "conversations"}
            {saved.generatedAt && (
              <>
                {" "}
                · made <LocalTime value={saved.generatedAt} />
              </>
            )}
            {newer > 0 && <strong className="font-bold text-warn-text"> · {newer} more finished since</strong>}
          </p>
        </div>
        {finished > 0 && button(newer > 0 ? `Analyze again with ${newer} more` : "Analyze again", newer > 0 ? "primary" : "secondary")}
      </div>
      {status}
      {brief.summary && (
        <p className="rounded-panel border-l-4 border-accent bg-accent-soft px-5 py-4 text-lg leading-relaxed text-balance">{brief.summary}</p>
      )}
      {cards.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-3">{top.map(card)}</div>
      ) : (
        <p className="text-muted">The AI found nothing to point out.</p>
      )}
      {more.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer font-medium text-accent-text select-none">
            {more.length} more {more.length === 1 ? "finding" : "findings"}
          </summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{more.map(card)}</div>
        </details>
      )}
      {brief.discussion.length > 0 && (
        <Panel title="Questions to raise in class" note="Built on what students said.">
          <div className="flex flex-col gap-3">
            <ol className="flex list-decimal flex-col gap-2 pl-6">
              {brief.discussion.map((question) => (
                <li key={question} className="break-words">
                  {question}
                </li>
              ))}
            </ol>
            <div>
              <CopyList lines={brief.discussion} />
            </div>
          </div>
        </Panel>
      )}
    </section>
  );
}

/** The class's grades as pictures: the spread, each criterion, each point raised, each position. */
function Numbers({ view, quoteHref, nameOf }: { view: ClassInsights; quoteHref: (attemptId: string) => string; nameOf: (attemptId: string) => string | null }) {
  const criteria = [...view.criteria].sort((a, b) => a.average / a.max - b.average / b.max);
  const weakest = new Set(weakestCriteria(view.criteria).map((c) => c.label));
  const positions = [...view.positions.map((p) => ({ label: p.label, count: p.students })), ...(view.noPosition > 0 ? [{ label: "No position", count: view.noPosition }] : [])];
  return (
    <section aria-labelledby="numbers-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h3 id="numbers-title" className="text-xl font-bold">
          The numbers
        </h3>
        <p className="text-sm text-muted">From the {studentsLabel(view.graded)} graded so far.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Score spread" note="How many students scored in each band.">
          <Histogram scores={view.scores} />
        </Panel>
        {criteria.length > 0 && (
          <Panel title="Rubric" note="The class average on each criterion, weakest first.">
            {criteria.map((c) => (
              <BarRow
                key={c.label}
                label={c.label}
                value={`${pointsFormat.format(c.average)} of ${pointsFormat.format(c.max)}`}
                percent={share(c.average, c.max)}
                tone={c.average / c.max < 0.7 ? "warn" : "accent"}
                badge={weakest.has(c.label) ? "Weakest" : undefined}
              />
            ))}
          </Panel>
        )}
        {view.touchpoints.length > 0 && (
          <Panel
            title="Key points raised"
            note="How many students brought up each point. Open one to see what they said."
            className={view.positions.length === 0 ? "lg:col-span-2" : ""}
          >
            {view.touchpoints.map((t) => (
              <TallyRow key={t.label} tally={t} of={view.graded} quoteHref={quoteHref} nameOf={nameOf} />
            ))}
          </Panel>
        )}
        {positions.length > 0 && view.positions.length > 0 && (
          <Panel title="Positions taken" note="Where the class landed.">
            <StackedBar parts={positions} of={view.graded} />
          </Panel>
        )}
      </div>
    </section>
  );
}
