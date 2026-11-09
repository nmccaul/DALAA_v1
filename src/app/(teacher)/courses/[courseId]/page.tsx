import { headers } from "next/headers";
import Link from "next/link";
import { listCourseActivities } from "@/activities/queries";
import { loginIdLabel } from "@/auth/login-id";
import { LocalTime } from "@/components/local-time";
import { ButtonLink, EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { findTool } from "@/tools/catalog";

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export default async function CourseAssignmentsPage({ params }: PageProps<"/courses/[courseId]">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const assignments = await listCourseActivities(db(), actor, course.id);
  const create = <ButtonLink href={`/courses/${course.id}/activities/new`}>+ Activity</ButtonLink>;

  if (assignments.length === 0) {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{create}</div>
      <section className="border border-border">
        <h2 className="flex items-center gap-2 border-b border-border bg-subtle px-4 py-2.5 text-base font-bold">
          All activities
          <span className="rounded-full border border-border-strong bg-surface px-2.5 py-0.5 text-[13px] font-normal text-muted">
            {assignments.length}
          </span>
        </h2>
        <ul className="flex flex-col divide-y divide-border">
          {assignments.map((a) => {
            const tool = findTool(a.tool);
            const Icon = tool?.icon;
            const href = `/courses/${course.id}/activities/${a.id}`;
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 pr-4 pl-4 hover:bg-subtle">
                {Icon && (
                  <span className="shrink-0">
                    <Icon size={24} aria-hidden />
                  </span>
                )}
                <div className="flex min-w-0 flex-[1_1_260px] flex-col">
                  <Link href={href} className="font-bold break-words text-text hover:text-accent hover:underline">
                    {a.title}
                  </Link>
                  <span className="mt-0.5 text-[13px] text-muted">
                    {tool?.name ?? a.tool}
                    {a.points !== null && ` · ${pointsFormat.format(a.points)} ${a.points === 1 ? "pt" : "pts"}`}
                    {" · "}
                    {a.dueAt ? <>Due <LocalTime value={a.dueAt} /></> : "No due date"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3.5">
                  {a.status === "published" ? (
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] font-bold whitespace-nowrap text-accent-text">
                      Published
                    </span>
                  ) : (
                    <span className="rounded-full border border-dashed border-muted bg-surface px-2.5 py-0.5 text-[13px] font-bold whitespace-nowrap text-muted">
                      Draft
                    </span>
                  )}
                  <span className="min-w-[150px] text-right text-sm text-muted">
                    {a.status === "published" ? `${a.submitted} submitted · ${a.graded} graded` : "Students can\u2019t see it"}
                  </span>
                  {a.status === "published" && (
                    <Link href={`/courses/${course.id}/grading`} className="text-sm text-accent-text hover:underline">
                      Results
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="text-sm text-muted">
        Each published activity also appears in Canvas Assignments, where students open it and where its grade goes.
      </p>
    </div>
  );
}
