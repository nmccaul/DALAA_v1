import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { listCourseActivities, listOtherCourseActivities, type ActivityRow, type LibraryActivity } from "@/activities/queries";
import { loginIdLabel } from "@/auth/login-id";
import { LocalTime } from "@/components/local-time";
import { Button, ButtonLink, EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { findTool } from "@/tools/catalog";
import { copyActivityAction } from "./actions";

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const points = (p: number | null) => (p === null ? "" : ` · ${pointsFormat.format(p)} ${p === 1 ? "pt" : "pts"}`);

/**
 * The Activities tab (D-034): what's assigned in Canvas on top; below it, this
 * course's other activities, or the teacher's activities from their other
 * courses to copy in.
 */
export default async function CourseAssignmentsPage({ params, searchParams }: PageProps<"/courses/[courseId]">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const q = await searchParams;
  const [activities, elsewhere] = await Promise.all([
    listCourseActivities(db(), actor, course.id),
    listOtherCourseActivities(db(), actor, course.id),
  ]);
  const create = <ButtonLink href={`/courses/${course.id}/activities/new`}>+ Activity</ButtonLink>;

  if (activities.length === 0 && elsewhere.length === 0) {
    const host = (await headers()).get("host") ?? "";
    return (
      <EmptyState title="No activities yet" action={create}>
        <p>
          Choose a type, give it your material, and DALAA drafts the activity for you to edit. Students on your class
          list can already sign in at{" "}
          <span className="font-medium text-text" translate="no">
            {host}/sign-in
          </span>{" "}
          with their {loginIdLabel().noun}.
        </p>
      </EmptyState>
    );
  }

  const assigned = activities.filter((a) => a.assigned);
  const notAssigned = activities.filter((a) => !a.assigned);
  const base = `/courses/${course.id}`;
  const showOther = q.show === "other" || (q.show !== "unassigned" && notAssigned.length === 0 && elsewhere.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{create}</div>
      {q.copyerror && (
        <p role="alert" className="rounded-control border border-border-strong bg-subtle px-4 py-3">
          We couldn&apos;t copy that activity. You can copy only from courses you teach.
        </p>
      )}

      {assigned.length > 0 && (
        <section className="border border-border">
          <h2 className="flex items-center gap-2 border-b border-border bg-subtle px-4 py-2.5 text-base font-bold">
            Assigned
            <span className="rounded-full border border-border-strong bg-surface px-2.5 py-0.5 text-[13px] font-normal text-muted">
              {assigned.length}
            </span>
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {assigned.map((a) => (
              <CourseRow key={a.id} activity={a} courseId={course.id} />
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="Show" className="flex flex-wrap gap-1 text-sm">
        {[
          { label: `Not assigned (${notAssigned.length})`, href: `${base}?show=unassigned`, current: !showOther },
          { label: `From my other courses (${elsewhere.length})`, href: `${base}?show=other`, current: showOther },
        ].map((f) => (
          <Link
            key={f.href}
            href={f.href}
            aria-current={f.current ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${
              f.current ? "border-accent bg-accent text-white" : "border-border-strong text-accent-text hover:bg-subtle"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {showOther ? (
        <OtherCourses activities={elsewhere} courseId={course.id} />
      ) : notAssigned.length === 0 ? (
        <p className="border border-dashed border-border-strong px-6 py-10 text-muted">
          Everything in this course is assigned. Use + Activity to make another.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border border-border">
          {notAssigned.map((a) => (
            <CourseRow
              key={a.id}
              activity={a}
              courseId={course.id}
              copy={<CopyButton activityId={a.id} courseId={course.id} label="Copy" />}
            />
          ))}
        </ul>
      )}

      <p className="text-sm text-muted">
        Each published activity also appears in Canvas Assignments, where students open it and where its grade goes.
      </p>
    </div>
  );
}

function CourseRow({ activity: a, courseId, copy }: { activity: ActivityRow; courseId: string; copy?: ReactNode }) {
  const tool = findTool(a.tool);
  const Icon = tool?.icon;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 pr-4 pl-4 hover:bg-subtle">
      {Icon && (
        <span className="shrink-0">
          <Icon size={24} aria-hidden />
        </span>
      )}
      <div className="flex min-w-0 flex-[1_1_260px] flex-col">
        <Link
          href={`/courses/${courseId}/activities/${a.id}`}
          className="font-bold break-words text-text hover:text-accent hover:underline"
        >
          {a.title}
        </Link>
        <span className="mt-0.5 text-[13px] text-muted">
          {tool?.name ?? a.tool}
          {points(a.points)}
          {" · "}
          {a.dueAt ? <>Due <LocalTime value={a.dueAt} /></> : "No due date"}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3.5">
        <StatusPill status={a.status} />
        <span className="min-w-[150px] text-right text-sm text-muted">
          {a.status === "published" ? `${a.submitted} submitted · ${a.graded} graded` : "Students can’t see it"}
        </span>
        {a.status === "published" && (
          <Link href={`/courses/${courseId}/grading`} className="text-sm text-accent-text hover:underline">
            Results
          </Link>
        )}
        {copy}
      </div>
    </li>
  );
}

/** The teacher's other courses' activities, one list per course, each with "Copy to this course". */
function OtherCourses({ activities, courseId }: { activities: LibraryActivity[]; courseId: string }) {
  if (activities.length === 0) {
    return (
      <p className="border border-dashed border-border-strong px-6 py-10 text-muted">
        Activities from your other courses show up here, ready to copy into this one.
      </p>
    );
  }
  const groups = new Map<string, LibraryActivity[]>();
  for (const a of activities) groups.set(a.courseId, [...(groups.get(a.courseId) ?? []), a]);
  return (
    <div className="flex flex-col gap-4">
      {[...groups.values()].map((rows) => (
        <section key={rows[0].courseId} className="border border-border">
          <h2 className="border-b border-border bg-subtle px-4 py-2.5 text-base font-bold">
            {rows[0].courseCode} <span className="font-normal text-muted">· {rows[0].courseTerm}</span>
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((a) => {
              const tool = findTool(a.tool);
              const Icon = tool?.icon;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 pr-4 pl-4 hover:bg-subtle">
                  {Icon && (
                    <span className="shrink-0">
                      <Icon size={24} aria-hidden />
                    </span>
                  )}
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col">
                    <Link
                      href={`/courses/${a.courseId}/activities/${a.id}`}
                      className="font-bold break-words text-text hover:text-accent hover:underline"
                    >
                      {a.title}
                    </Link>
                    <span className="mt-0.5 text-[13px] text-muted">
                      {tool?.name ?? a.tool}
                      {points(a.points)}
                      {" · Last edit "}
                      <LocalTime value={a.updatedAt} style="day" />
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3.5">
                    <StatusPill status={a.status} />
                    <CopyButton activityId={a.id} courseId={courseId} label="Copy to this course" />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: "draft" | "published" }) {
  return status === "published" ? (
    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] font-bold whitespace-nowrap text-accent-text">
      Published
    </span>
  ) : (
    <span className="rounded-full border border-dashed border-muted bg-surface px-2.5 py-0.5 text-[13px] font-bold whitespace-nowrap text-muted">
      Draft
    </span>
  );
}

/** Copies the activity into this course as a draft and opens the copy. */
function CopyButton({ activityId, courseId, label }: { activityId: string; courseId: string; label: string }) {
  return (
    <form action={copyActivityAction}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="creationKey" value={randomUUID()} />
      <Button variant="secondary" className="text-sm">
        {label}
      </Button>
    </form>
  );
}
