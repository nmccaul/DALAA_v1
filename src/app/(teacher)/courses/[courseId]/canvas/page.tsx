import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { clientFor } from "@/canvas/connection";
import { listImportable, type ImportableCourse } from "@/canvas/import";
import { Button, EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { linkAction } from "../students/actions";

export const metadata: Metadata = { title: "Connect to Canvas" };

/** Link a hand-made course to its Canvas course (D-017). */
export default async function LinkCanvasPage({ params }: PageProps<"/courses/[courseId]/canvas">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  if (course.canvasLinked) redirect(`/courses/${course.id}/students`);

  const canvas = await clientFor(db(), actor).catch(() => null);
  if (!canvas) redirect(`/canvas/connect?next=/courses/${course.id}/canvas`);

  let courses: ImportableCourse[] = [];
  let unreachable = false;
  try {
    courses = (await listImportable(db(), actor, canvas)).filter((c) => !c.dalaaCourseId);
  } catch {
    unreachable = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-2">
        <h2 className="font-display text-xl font-semibold">Connect this course to Canvas</h2>
        <p className="text-muted">
          Pick its Canvas course. Students are matched by NetID, so nobody gets a second account. Anyone on your list
          who isn&apos;t in Canvas is marked, never removed, and their work stays.
        </p>
      </div>
      {unreachable ? (
        <EmptyState title="We couldn't reach Canvas">
          <p>Try again in a minute, or reconnect Canvas in Settings.</p>
        </EmptyState>
      ) : courses.length === 0 ? (
        <EmptyState title="No Canvas courses to connect">
          <p>Every Canvas course you teach is already in DALAA, or Canvas doesn&apos;t list you as a teacher.</p>
        </EmptyState>
      ) : (
        <ul className="flex max-w-2xl flex-col divide-y divide-border rounded-panel border border-border bg-surface">
          {courses.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 flex-col">
                <span className="break-words font-medium">
                  {c.course_code}: {c.name}
                </span>
                <span className="text-sm text-muted">{c.term?.name ?? "No term"}</span>
              </div>
              <form action={linkAction}>
                <input type="hidden" name="courseId" value={course.id} />
                <input type="hidden" name="canvasCourseId" value={c.id} />
                <Button variant="secondary">Connect</Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/courses/${course.id}/students`} className="text-sm text-muted hover:text-text">
        Cancel
      </Link>
    </div>
  );
}
