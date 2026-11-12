import type { Metadata } from "next";
import { PreviewNote } from "@/components/preview-note";
import { loadTaughtCourse } from "@/courses/load";
import { noteDate, RELEASE_NOTES } from "@/help/release-notes";
import { GiveFeedback } from "./give-feedback";

export const metadata: Metadata = { title: "Help" };

/** The course's Help tab (D-032): the AI wizard (coming), feedback, and what's new. */
export default async function HelpTabPage({ params }: PageProps<"/courses/[courseId]/help">) {
  // Only the course's teachers see its tabs.
  await loadTaughtCourse((await params).courseId);

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
          up or leave it out. The Feedback button at the bottom right of every page does the same.
        </p>
        <GiveFeedback />
      </section>

      <section className={section}>
        <h3 className="text-lg font-bold">Latest release notes</h3>
        <ol className="flex flex-col gap-5">
          {RELEASE_NOTES.map((note) => (
            <li key={note.date} className="flex flex-col gap-1.5">
              <h4 className="font-bold">{noteDate(note.date)}</h4>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {note.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
