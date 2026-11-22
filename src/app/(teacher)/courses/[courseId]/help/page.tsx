import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { PreviewNote } from "@/components/preview-note";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { listEveryonesReports, listMyReports } from "@/feedback/mine";
import { noteDate, RELEASE_NOTES } from "@/help/release-notes";
import { GiveFeedback } from "./give-feedback";
import { YourFeedback } from "./your-feedback";

export const metadata: Metadata = { title: "Help" };

/** The course's Help tab (D-032): the AI wizard (coming), feedback and what became of it, and what's new. */
export default async function HelpTabPage({ params, searchParams }: PageProps<"/courses/[courseId]/help">) {
  // Only the course's teachers see its tabs.
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  // An admin sees everyone's reports here by default (Nathan, 2026-11-22); everyone else, only their own.
  const everyone = actor.isAdmin && (await searchParams).feedback !== "mine";
  const reports = await (everyone ? listEveryonesReports : listMyReports)(db(), actor);
  const base = `/courses/${course.id}/help`;

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
                { key: "everyone", label: "Everyone", on: everyone, href: `${base}#feedback` },
                { key: "mine", label: "Yours", on: !everyone, href: `${base}?feedback=mine#feedback` },
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
          When one is fixed, it&apos;s crossed off and moves to Done. Release notes below list every change, whether or
          not someone asked for it.
        </p>
        <YourFeedback reports={reports} everyone={everyone} />
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
