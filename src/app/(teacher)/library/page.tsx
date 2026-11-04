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
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {activities.map((a) => {
          const tool = findTool(a.tool);
          const Icon = tool?.icon;
          return (
            <li key={a.id}>
              <Link
                href={`/courses/${a.courseId}/activities/${a.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-panel border border-border bg-surface transition-shadow hover:shadow-md"
              >
                <div
                  className="flex h-20 items-end px-5 pb-3 text-white"
                  style={{ background: tool?.accent ?? "var(--accent)" }}
                >
                  {Icon && <Icon size={32} weight="duotone" aria-hidden />}
                </div>
                <div className="flex flex-1 flex-col gap-1 px-5 py-4">
                  <span className="font-medium break-words group-hover:underline">{a.title}</span>
                  <span className="text-sm text-muted">
                    {tool?.name ?? a.tool}
                    {a.points !== null && ` · ${pointsFormat.format(a.points)} ${a.points === 1 ? "point" : "points"}`}
                  </span>
                  <span className="text-sm text-muted">
                    {a.courseCode} · {a.courseTerm}
                  </span>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-xs">
                    <span
                      className={`rounded-control px-2 py-0.5 font-medium ${
                        a.status === "published" ? "bg-accent-soft text-accent-text" : "bg-bg text-muted"
                      }`}
                    >
                      {a.status === "published" ? "Ready to add to Canvas" : "Draft"}
                    </span>
                    <span className="text-muted">
                      Edited <LocalTime value={a.updatedAt} style="day" />
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
