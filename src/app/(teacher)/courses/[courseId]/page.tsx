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
  const create = <ButtonLink href={`/courses/${course.id}/activities/new`}>Create assignment</ButtonLink>;

  if (assignments.length === 0) {
    const host = (await headers()).get("host") ?? "";
    return (
      <EmptyState title="No assignments yet" action={create}>
        <p>
          Choose a type, give it your material, and DALAA drafts the assignment for you to edit. Students on your class
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
      <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
        {assignments.map((a) => {
          const tool = findTool(a.tool);
          const Icon = tool?.icon;
          return (
            <li key={a.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {Icon && (
                  <span style={{ color: tool.accent }}>
                    <Icon size={24} weight="duotone" aria-hidden />
                  </span>
                )}
                <div className="flex min-w-0 flex-col">
                  <Link href={`/courses/${course.id}/activities/${a.id}`} className="font-medium break-words hover:underline">
                    {a.title}
                  </Link>
                  <span className="text-sm text-muted">
                    {tool?.name ?? a.tool}
                    {a.points !== null && ` · ${pointsFormat.format(a.points)} ${a.points === 1 ? "point" : "points"}`}
                  </span>
                </div>
              </div>
              <span className="text-sm text-muted sm:w-48">
                {a.dueAt ? <>Due <LocalTime value={a.dueAt} /></> : "No due date"}
              </span>
              <span className="text-sm sm:w-44">
                {a.status === "published" ? (
                  <>
                    {a.submitted} submitted · {a.graded} graded
                  </>
                ) : (
                  <span className="rounded-control bg-bg px-2 py-0.5 text-xs font-medium text-muted">
                    Draft, students can&apos;t see it
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
