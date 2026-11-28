import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { PreviewNote } from "@/components/preview-note";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { feedbackArea, isTab, sectionsOf, TABS, type Place, type Tab } from "@/feedback/area";
import { isPriority, KINDS, type Kind, type Priority } from "@/feedback/report";
import { listEveryonesReports, listMyReports, standing } from "@/feedback/mine";
import { noteDate, RELEASE_NOTES } from "@/help/release-notes";
import { FeedbackFilters } from "./feedback-filters";
import { GiveFeedback } from "./give-feedback";
import { YourFeedback } from "./your-feedback";

export const metadata: Metadata = { title: "Help" };

/** The course's Help tab (D-032): the AI wizard (coming), feedback and what became of it, and what's new. */
export default async function HelpTabPage({ params, searchParams }: PageProps<"/courses/[courseId]/help">) {
  // Only the course's teachers see its tabs.
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const q = await searchParams;
  // An admin sees everyone's reports here by default (Nathan, 2026-11-22); everyone else, only their own.
  const everyone = actor.isAdmin && q.feedback !== "mine";
  const all = (await (everyone ? listEveryonesReports : listMyReports)(db(), actor)).map((r) => ({ ...r, place: feedbackArea(r.url) }));
  // Filtered by course tab, then by section, type and priority (D-042).
  const filter = readFilter(q);
  const reports = all.filter((r) => matches(r, filter));
  const openIn = (tab: Tab | null) => all.filter((r) => (tab === null || r.place.tab === tab) && !standing(r).done).length;
  const base = `/courses/${course.id}/help`;
  const href = (f: Partial<Filter>, mine = !everyone) => filterHref(base, { ...filter, ...f }, mine);
  const pills: { key: Tab | null; label: string }[] = [{ key: null, label: "All" }, ...TABS];

  const section = "flex flex-col gap-3 border-t border-border pt-6 first:border-t-0 first:pt-0";
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section className={section}>
        <h2 className="text-2xl font-normal">Ask the DALAA wizard</h2>
        <PreviewNote>
          Coming later: ask the AI how to do something in DALAA (&ldquo;how do I send grades to Canvas?&rdquo;) and get
          an answer for this course.
        </PreviewNote>
      </section>

      <section className={section}>
        <h3 className="text-lg font-bold">Give feedback</h3>
        <p>
          Something broken, confusing, or missing? Tell us. A picture of the page goes with your note, and you can mark it
          up or leave it out. The yellow Feedback tab on the right edge of every page does the same.
        </p>
        <GiveFeedback />
      </section>

      <section id="feedback" className={section}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{everyone ? "Everyone's feedback" : "Your feedback"}</h3>
          {actor.isAdmin && (
            <nav aria-label="Whose feedback" className="inline-flex rounded-control border border-border-strong text-sm">
              {[
                { key: "everyone", label: "Everyone", on: everyone, href: href({}, false) },
                { key: "mine", label: "Yours", on: !everyone, href: href({}, true) },
              ].map((v, i) => (
                <Link
                  key={v.key}
                  href={v.href}
                  aria-current={v.on ? "page" : undefined}
                  className={`px-3 py-1.5 ${i > 0 ? "border-l border-border-strong" : ""} ${
                    v.on ? "bg-accent font-bold text-white" : "bg-surface text-accent-text hover:bg-subtle"
                  }`}
                >
                  {v.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <p className="text-muted">
          {everyone
            ? "Every report anyone has sent, and where it stands. Only admins see this; teachers see just their own. Open one for its picture and details."
            : "Everything you've sent, and where it stands."}{" "}
          When one is fixed, it&apos;s crossed off and moves to Done.{!everyone && " If one looks fixed to you, say so and an admin will check and close it."} Pick a tab to see its feedback; each number is
          how many are still open there. Release notes below list every change, whether or not someone asked for it.
        </p>
        {all.length > 0 && (
          <>
            <nav aria-label="Feedback by tab" className="flex flex-wrap gap-1.5 text-sm">
              {pills.map((t) => {
                const on = t.key === filter.tab;
                const open = openIn(t.key);
                return (
                  <Link
                    key={t.label}
                    href={href({ tab: t.key, section: null })}
                    aria-current={on ? "page" : undefined}
                    className={`rounded-full border px-3 py-1 ${
                      on
                        ? "border-accent bg-accent text-white"
                        : `border-border-strong hover:bg-subtle ${open === 0 ? "text-muted" : "text-accent-text"}`
                    }`}
                  >
                    {t.label} <span className={on ? "" : "text-muted"}>{open}</span>
                  </Link>
                );
              })}
            </nav>
            <FeedbackFilters
              action={`${base}#feedback`}
              mine={!everyone}
              tab={filter.tab}
              sections={filter.tab ? sectionsOf(filter.tab).map((x) => ({ value: x.key, label: x.label })) : []}
              values={{ section: filter.section ?? "", type: filter.type ?? "", priority: filter.priority ?? "" }}
            />
          </>
        )}
        <YourFeedback reports={reports} here={href({})} everyone={everyone} filtered={reports.length < all.length} />
      </section>

      <section className={section}>
        <h3 className="text-lg font-bold">Latest release notes</h3>
        {/* One row per day, newest open; the rest fold away so the list stays short (Nathan, 2026-11-18). */}
        <ol className="flex flex-col divide-y divide-border rounded-panel border border-border">
          {RELEASE_NOTES.map((note, i) => (
            <li key={note.date}>
              <details open={i === 0} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-subtle [&::-webkit-details-marker]:hidden">
                  <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-90" />
                  <span className="font-bold">{noteDate(note.date)}</span>
                  <span className="ml-auto text-sm text-muted">
                    {note.changes.length} {note.changes.length === 1 ? "change" : "changes"}
                  </span>
                </summary>
                <ul className="flex list-disc flex-col gap-1 pr-4 pb-4 pl-12">
                  {note.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

type Filter = { tab: Tab | null; section: string | null; type: Kind | null; priority: Priority | "none" | null };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** The feedback filters from the address; anything unknown is ignored. */
function readFilter(q: Record<string, string | string[] | undefined>): Filter {
  const tab = isTab(q.tab) ? q.tab : null;
  const section = one(q.section);
  const type = one(q.type);
  const priority = one(q.priority);
  return {
    tab,
    section: tab && section && sectionsOf(tab).some((x) => x.key === section) ? section : null,
    type: KINDS.some((k) => k.value === type) ? (type as Kind) : null,
    priority: priority === "none" || isPriority(priority) ? priority : null,
  };
}

function matches(r: { place: Place; kind: Kind; priority: Priority | null }, f: Filter): boolean {
  if (f.tab && r.place.tab !== f.tab) return false;
  if (f.section && r.place.section !== f.section) return false;
  if (f.type && r.kind !== f.type) return false;
  if (f.priority && (r.priority ?? "none") !== f.priority) return false;
  return true;
}

function filterHref(base: string, f: Filter, mine: boolean): string {
  const p = new URLSearchParams();
  if (mine) p.set("feedback", "mine");
  if (f.tab) p.set("tab", f.tab);
  if (f.section) p.set("section", f.section);
  if (f.type) p.set("type", f.type);
  if (f.priority) p.set("priority", f.priority);
  const query = p.toString();
  return `${base}${query ? `?${query}` : ""}#feedback`;
}
