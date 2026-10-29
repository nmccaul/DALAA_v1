import type { Metadata } from "next";
import Link from "next/link";
import { listCourseActivities } from "@/activities/queries";
import { Button, EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { pendingDeepLink } from "@/lti/deep-link";
import { findTool } from "@/tools/catalog";

export const metadata: Metadata = { title: "Add to Canvas" };

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/**
 * Where Canvas's "DALAA Study Chat" assignment picker lands (LTI Deep Linking):
 * pick a published assignment and it goes back to Canvas as the assignment.
 */
export default async function AddToCanvasPage({ params }: PageProps<"/courses/[courseId]/add-to-canvas/[requestId]">) {
  const { courseId, requestId } = await params;
  const { actor, course } = await loadTaughtCourse(courseId);
  const pending = await pendingDeepLink(db(), actor, requestId);
  const create = (
    <Link href={`/courses/${course.id}/activities/new`} className="text-sm font-medium underline">
      Create a new assignment
    </Link>
  );

  if (!pending || pending.courseId !== course.id) {
    return (
      <EmptyState title="This has expired">
        <p>Close this window and choose DALAA again in Canvas.</p>
      </EmptyState>
    );
  }

  const published = (await listCourseActivities(db(), actor, course.id)).filter((a) => a.status === "published");
  if (published.length === 0) {
    return (
      <EmptyState title="No published assignments yet" action={create}>
        <p>Create one and publish it, then choose DALAA again in Canvas to add it.</p>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">Add an assignment to Canvas</h2>
        <p className="text-sm text-muted">Canvas makes a gradebook column for it, worth its points.</p>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
        {published.map((a) => (
          <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium break-words">{a.title}</span>
              <span className="text-sm text-muted">
                {findTool(a.tool)?.name ?? a.tool}
                {a.points !== null && ` · ${pointsFormat.format(a.points)} ${a.points === 1 ? "point" : "points"}`}
              </span>
            </div>
            <form method="post" action="/api/lti/deep-link">
              <input type="hidden" name="request" value={pending.id} />
              <input type="hidden" name="activity" value={a.id} />
              <Button type="submit" variant="secondary">
                Add to Canvas
              </Button>
            </form>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        Not here? {create}, publish it, then choose DALAA again in Canvas.
      </p>
    </div>
  );
}
