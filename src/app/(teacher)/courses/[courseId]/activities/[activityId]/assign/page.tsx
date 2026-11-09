import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assignSetup, assignToCanvasOn } from "@/activities/assign";
import { getTaughtActivity } from "@/activities/store";
import { clientFor } from "@/canvas/connection";
import { ButtonLink, EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { AssignForm } from "./assign-form";

export const metadata: Metadata = { title: "Assign" };

/**
 * Assign (D-034, behind ASSIGN_TO_CANVAS): DALAA adds the activity to the
 * Canvas course as an assignment. For one already assigned this way, it
 * changes the due date.
 */
export default async function AssignPage({ params }: PageProps<"/courses/[courseId]/activities/[activityId]/assign">) {
  if (!assignToCanvasOn()) notFound();
  const { courseId, activityId } = await params;
  const { actor, course } = await loadTaughtCourse(courseId);
  const activity = await getTaughtActivity(db(), actor, activityId);
  if (!activity || activity.courseId !== course.id) notFound();

  const here = `/courses/${course.id}/activities/${activity.id}/assign`;
  const connectHref = `/canvas/connect?next=${encodeURIComponent(here)}`;
  const canvas = await clientFor(db(), actor).catch(() => null);
  const setup = await assignSetup(db(), actor, canvas, activity.id);
  if (!setup) notFound();
  const dueOnly = setup.canvasAssignmentId !== null;

  let body;
  if (setup.linkedByHand) {
    body = (
      <EmptyState title="This activity is already in Canvas">
        <p>It was added from Canvas, so change its due date in Canvas.</p>
      </EmptyState>
    );
  } else if (!course.canvasLinked) {
    body = (
      <EmptyState
        title="Connect this course to Canvas first"
        action={<ButtonLink href={`/courses/${course.id}/canvas`}>Connect to Canvas</ButtonLink>}
      >
        <p>DALAA adds the assignment to this course&apos;s Canvas course.</p>
      </EmptyState>
    );
  } else if (!canvas) {
    body = (
      <EmptyState title="Connect Canvas" action={<ButtonLink href={connectHref}>Connect Canvas</ButtonLink>}>
        <p>DALAA uses your Canvas account to add the assignment. You&apos;ll come straight back here.</p>
      </EmptyState>
    );
  } else {
    body = (
      <AssignForm
        courseId={course.id}
        activityId={activity.id}
        dueAt={setup.dueAt ? setup.dueAt.toISOString() : null}
        groups={setup.groups && setup.groups.map((g) => ({ id: g.id, name: g.name }))}
        dueOnly={dueOnly}
        connectHref={connectHref}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/courses/${course.id}`} className="-mb-2 text-sm text-accent-text hover:underline">
        ‹ Assigned Activities
      </Link>
      <div className="flex max-w-2xl flex-col gap-1">
        <h2 className="font-display text-xl font-semibold">
          {dueOnly ? `Change the due date: ${activity.title}` : `Assign ${activity.title}`}
        </h2>
        <p className="text-muted">
          {dueOnly
            ? "DALAA changes it in Canvas too."
            : "DALAA publishes it and adds it to Canvas Assignments, where students open it and where its grade goes."}
        </p>
      </div>
      {body}
    </div>
  );
}
