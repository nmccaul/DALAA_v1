import { db } from "@/db/client";
import { Button, ButtonLink, EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { listRoster } from "@/courses/queries";
import { syncAction } from "./actions";

const SYNC_ERRORS: Record<string, string> = {
  reconnect: "Canvas didn't accept your saved token. It may have expired. Reconnect Canvas in Settings.",
  unavailable: "We couldn't reach Canvas just now. Try again in a minute.",
  "not-yours": "Canvas doesn't list you as a teacher of that course any more.",
  taken: "That Canvas course is already in DALAA.",
  "wrong-canvas":
    "This course came from practice Canvas, but you're connected to your real Canvas (or the other way round). Switch in Settings to sync it.",
  "not-linked": "This course isn't connected to Canvas yet.",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function CourseStudentsPage({
  params,
  searchParams,
}: PageProps<"/courses/[courseId]/students">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const q = await searchParams;
  const count = (key: string) => {
    const v = q[key];
    return typeof v === "string" && Number(v) > 0 ? Number(v) : 0;
  };
  const roster = await listRoster(db(), actor, course.id);
  const hasSections = roster.some((s) => s.section);

  // After "Bring in" (PR #81): how many were added, and why anyone wasn't.
  const importNotes = [
    count("nonetid") && `${plural(count("nonetid"), "student wasn't", "students weren't")} added because Canvas didn't share their NetID.`,
    count("twosections") && `${plural(count("twosections"), "student is", "students are")} in two sections in Canvas, so they're listed without a section.`,
    count("dropped") && `${count("dropped")} who dropped the course in Canvas ${count("dropped") === 1 ? "wasn't" : "weren't"} added.`,
  ].filter(Boolean) as string[];

  // After "Sync with Canvas" or "Connect to Canvas".
  const syncChanges = [
    count("added") && `${plural(count("added"), "student", "students")} added`,
    count("returned") && `${count("returned")} back on the class list`,
    count("moved") && `${plural(count("moved"), "student", "students")} moved to a different section`,
    count("flagged") && `${count("flagged")} no longer in Canvas (marked below, nothing deleted)`,
  ].filter(Boolean) as string[];
  const syncError = typeof q.syncerror === "string" ? SYNC_ERRORS[q.syncerror] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {q.synced === "1" ? (
        <p role="status" className="rounded-control bg-accent-soft px-4 py-3 text-accent-text">
          {syncChanges.length ? `Synced with Canvas: ${syncChanges.join(", ")}.` : "Synced with Canvas. Everything already matched."}
        </p>
      ) : (
        count("added") > 0 || q.added === "0" ? (
          <p role="status" className="rounded-control bg-accent-soft px-4 py-3 text-accent-text">
            Course created. {plural(count("added"), "student", "students")} added.
            {importNotes.length > 0 && (
              <span className="mt-2 block text-sm text-text">
                {importNotes.map((n) => (
                  <span key={n} className="block">{n}</span>
                ))}
              </span>
            )}
          </p>
        ) : null
      )}
      {syncError && (
        <p role="alert" className="rounded-control bg-danger-soft px-4 py-3 text-danger">{syncError}</p>
      )}

      {course.canvasLinked ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {course.canvasSyncedAt
              ? `Class list last matched Canvas ${dateTime.format(course.canvasSyncedAt)}.`
              : "Class list from Canvas."}
          </p>
          <form action={syncAction}>
            <input type="hidden" name="courseId" value={course.id} />
            <Button variant="secondary">Sync with Canvas</Button>
          </form>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-dashed border-border-strong/60 px-4 py-3">
          <p className="text-sm text-muted">Connect this course to Canvas to keep its class list up to date.</p>
          <ButtonLink href={`/courses/${course.id}/canvas`} variant="secondary">
            Connect to Canvas
          </ButtonLink>
        </div>
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
