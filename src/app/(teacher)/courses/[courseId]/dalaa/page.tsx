import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { listCourseActivities } from "@/activities/queries";
import { PreviewNote } from "@/components/preview-note";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { isLtiCourse } from "@/lti/roster";
import { newActivityPath } from "@/tools/catalog";

export const metadata: Metadata = { title: "Course setup" };

/**
 * The course's DALAA tab (D-032): what DALAA is, what's left to get this
 * course ready, and the course's setup (class list, Canvas). Every checklist
 * item reads stored state; nothing is assumed.
 */
export default async function DalaaTabPage({ params }: PageProps<"/courses/[courseId]/dalaa">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const base = `/courses/${course.id}`;
  const [activities, fromLti] = await Promise.all([
    listCourseActivities(db(), actor, course.id),
    isLtiCourse(db(), course.id),
  ]);
  const connected = course.canvasLinked || fromLti;

  const steps = [
    {
      done: connected,
      title: "Connect the course to Canvas",
      detail: connected ? "Grades go to this course's Canvas gradebook." : "So grades can go to the Canvas gradebook.",
      link: connected ? null : { href: `${base}/canvas`, label: "Connect" },
    },
    {
      done: course.students > 0,
      title: "Bring in the class list",
      detail: `${course.students} ${course.students === 1 ? "student" : "students"} on the list.`,
      link: { href: `${base}/students`, label: "Class list" },
    },
    {
      done: activities.length > 0,
      title: "Create an activity",
      detail: "Give it your reading; DALAA drafts the rest for you to edit.",
      link: { href: newActivityPath(course.id), label: "+ Activity" },
    },
    {
      done: activities.some((a) => a.status === "published"),
      title: "Publish it to students",
      detail: "Try it with a sample student first, then publish.",
      link: activities.length ? { href: base, label: "Activities" } : null,
    },
  ];

  const section = "flex flex-col gap-3 border-t border-border pt-6";
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-normal">Welcome to DALAA</h2>
        <p>
          DALAA adds interactive AI activities to this course. A student studies something, chats with an AI to reach a
          learning goal, and an AI grader reads the conversation and scores it against your rubric. You review the
          scores, then send them to the Canvas gradebook.
        </p>
      </section>

      <section className={section}>
        <h3 className="text-lg font-bold">Get this course ready</h3>
        <ol className="flex flex-col border border-border">
          {steps.map((s) => (
            <li key={s.title} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <span className={s.done ? "text-success" : "text-muted"}>
                {s.done ? <CheckCircle size={22} weight="fill" aria-label="Done" /> : <Circle size={22} aria-label="Not done" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-bold">{s.title}</span>
                <span className="text-sm text-muted">{s.detail}</span>
              </span>
              {s.link && (
                <Link href={s.link.href} className="text-sm whitespace-nowrap text-accent-text hover:underline">
                  {s.link.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className={section}>
        <h3 className="text-lg font-bold">Where things are</h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <b>Activities</b>: create, edit, copy and assign activities, and try them as a student.
          </li>
          <li>
            <b>Materials</b>: the readings and AI-only notes your activities use.
          </li>
          <li>
            <b>Results</b>: review scores and send them to Canvas.
          </li>
          <li>
            <b>DALAA</b> (this tab): the{" "}
            <Link href={`${base}/students`} className="text-accent-text hover:underline">
              class list
            </Link>
            {connected ? " and its sync with Canvas" : null}, and setup for this course.
          </li>
        </ul>
      </section>

      <section className={section}>
        <h3 className="text-lg font-bold">AI models and defaults</h3>
        <PreviewNote>
          Coming later: choose the AI model for chats and grading, see AI costs, and set the chat options every new
          activity in this course starts with.
        </PreviewNote>
      </section>
    </div>
  );
}
