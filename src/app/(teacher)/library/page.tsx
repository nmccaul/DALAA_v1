import type { Metadata } from "next";
import Link from "next/link";
import { listLibraryActivities } from "@/activities/queries";
import { requireActor } from "@/auth/current";
import { LocalTime } from "@/components/local-time";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db/client";
import { findTool } from "@/tools/catalog";

export const metadata: Metadata = { title: "Library" };

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Assignments the teacher has made but not added to Canvas yet. */
export default async function LibraryPage() {
  const actor = await requireActor();
  const activities = await listLibraryActivities(db(), actor);
  const header = (
    <PageHeader
      title="Library"
      description="Assignments you've made that aren't in Canvas yet. Open one to finish it, then add it to your course in Canvas."
    />
  );

  if (activities.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing waiting in your library"
          action={<ButtonLink href="/courses">Go to your courses</ButtonLink>}
        >
          <p>
            When you create an assignment in a course, it waits here until you add it to Canvas. Everything already in
            Canvas is on its course&apos;s page.
          </p>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {header}
      <p className="-mt-4 text-sm text-muted">
        {activities.length} {activities.length === 1 ? "assignment" : "assignments"} not in Canvas yet
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr className="border-b-2 border-border-strong text-left">
              <th className="px-3 py-2.5 font-bold">Title</th>
              <th className="px-3 py-2.5 font-bold whitespace-nowrap">Course</th>
              <th className="px-3 py-2.5 font-bold whitespace-nowrap">Status</th>
              <th className="px-3 py-2.5 font-bold whitespace-nowrap">Last edit</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => {
              const tool = findTool(a.tool);
              const Icon = tool?.icon;
              return (
                <tr key={a.id} className="border-b border-border align-top hover:bg-subtle">
                  <td className="px-3 py-3">
                    <span className="flex items-start gap-3">
                      {Icon && (
                        <span className="mt-0.5 shrink-0">
                          <Icon size={22} aria-hidden />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-col">
                        <Link
                          href={`/courses/${a.courseId}/activities/${a.id}`}
                          className="font-bold break-words text-text hover:text-accent hover:underline"
                        >
                          {a.title}
                        </Link>
                        <span className="text-[13px] text-muted">
                          {tool?.name ?? a.tool}
                          {a.points !== null && ` · ${pointsFormat.format(a.points)} ${a.points === 1 ? "pt" : "pts"}`}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {a.courseCode} <span className="text-muted">· {a.courseTerm}</span>
                  </td>
                  <td className="px-3 py-3">
                    {a.status === "published" ? (
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-accent-text">
                        Ready to add to Canvas
                      </span>
                    ) : (
                      <span className="rounded-full border border-dashed border-muted px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-muted">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted">
                    <LocalTime value={a.updatedAt} style="day" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
