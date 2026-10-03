import { db } from "@/db/client";
import { EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { listRoster } from "@/courses/queries";

export default async function CourseStudentsPage({
  params,
  searchParams,
}: PageProps<"/courses/[courseId]/students">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const { added } = await searchParams;
  const roster = await listRoster(db(), actor, course.id);
  const hasSections = roster.some((s) => s.section);
  const justAdded = typeof added === "string" ? Number(added) : null;

  return (
    <div className="flex flex-col gap-6">
      {justAdded !== null && Number.isFinite(justAdded) && (
        <p role="status" className="rounded-control bg-accent-soft px-4 py-3 text-accent-text">
          Course created. {justAdded} {justAdded === 1 ? "student" : "students"} added.
        </p>
      )}

      {roster.length === 0 ? (
        <EmptyState title="No students yet">
          <p>Students you add will appear here and can sign in with their NetID.</p>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-panel border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">NetID</th>
                {hasSections && <th scope="col" className="px-4 py-3 font-medium">Section</th>}
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Status</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roster.map((s) => (
                <tr key={s.netId}>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted" translate="no">{s.netId}</td>
                  {hasSections && <td className="px-4 py-3 tabular-nums text-muted">{s.section ?? "None"}</td>}
                  <td className="px-4 py-3 text-muted">{s.status === "flagged" ? "Not on the latest class list" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
