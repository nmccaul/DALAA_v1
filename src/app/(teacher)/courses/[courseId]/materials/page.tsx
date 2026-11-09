import type { Metadata } from "next";
import Link from "next/link";
import { clientFor } from "@/canvas/connection";
import { listCourseCanvasContent, type CourseContentProblem } from "@/canvas/content";
import { VaultError } from "@/canvas/vault";
import { LocalTime } from "@/components/local-time";
import { listCourseMaterials, mergeMaterials, SOURCE_LABEL, type Material, type MaterialRow } from "@/content/materials";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { MaterialsMenu } from "./materials-menu";

export const metadata: Metadata = { title: "Materials" };

type Source = Material["source"];

const FILTERS: { source: Source | null; label: string }[] = [
  { source: null, label: "All" },
  { source: "canvas-page", label: "Canvas Pages" },
  { source: "canvas-file", label: "Canvas Files" },
  { source: "upload", label: "Uploaded" },
  { source: "paste", label: "Pasted" },
];

const CANVAS_PROBLEM: Record<CourseContentProblem, string> = {
  "not-yours": "Canvas doesn't list you as a teacher of this course, so its Pages and Files aren't shown.",
  "not-linked": "This course isn't connected to Canvas, so its Pages and Files aren't shown.",
  "wrong-canvas": "This course is in the other Canvas (practice or real). Switch in Settings to see its Pages and Files.",
  reconnect: "Canvas didn't accept your connection. Reconnect Canvas to see this course's Pages and Files.",
  unavailable: "We couldn't reach Canvas just now, so its Pages and Files aren't shown. Try again in a minute.",
};

const pill = "rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap";
const SEEN_BY: Record<MaterialRow["seenBy"], { label: string; className: string }> = {
  students: { label: "Students + AI", className: `${pill} bg-accent-soft text-accent-text` },
  ai: { label: "AI only", className: `${pill} bg-warn-soft text-warn-text` },
  canvas: { label: "In Canvas", className: `${pill} border border-border-strong text-muted` },
};

/** The course's Materials tab (D-032): readings and AI-only notes, and the Canvas course's Pages and Files. */
export default async function MaterialsPage({ params, searchParams }: PageProps<"/courses/[courseId]/materials">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const q = await searchParams;
  const base = `/courses/${course.id}/materials`;
  const filter = FILTERS.find((f) => f.source === q.source)?.source ?? null;

  const canvas = await clientFor(db(), actor).catch((e) => {
    if (e instanceof VaultError) return null;
    throw e;
  });
  const [saved, listed] = await Promise.all([
    listCourseMaterials(db(), actor, course.id),
    canvas ? listCourseCanvasContent(db(), actor, canvas, course.id) : null,
  ]);
  const all = mergeMaterials(saved, listed?.ok ? listed.list : null);
  const rows = filter ? all.filter((r) => r.source === filter) : all;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Show" className="flex flex-wrap gap-1 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f.label}
              href={f.source ? `${base}?source=${f.source}` : base}
              aria-current={f.source === filter ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${
                f.source === filter ? "border-accent bg-accent text-white" : "border-border-strong text-accent-text hover:bg-subtle"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <span className="flex-1" />
        <MaterialsMenu base={base} />
      </div>

      {q.added && (
        <p role="status" className="rounded-control bg-accent-soft px-4 py-3 text-accent-text">
          Material added.
        </p>
      )}
      {!canvas ? (
        <p className="text-sm text-muted">
          <Link href={`/canvas/connect?next=${encodeURIComponent(base)}`} className="text-accent-text hover:underline">
            Connect Canvas
          </Link>{" "}
          to list this course&apos;s Pages and Files here.
        </p>
      ) : (
        listed && !listed.ok && <p className="text-sm text-muted">{CANVAS_PROBLEM[listed.reason]}</p>
      )}

      {rows.length === 0 ? (
        <p className="border border-dashed border-border-strong px-6 py-10 text-muted">
          {filter ? "Nothing of this kind yet." : "No materials yet. Use + Materials to upload or paste one."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[15px]">
            <thead>
              <tr className="border-b-2 border-border-strong text-left">
                <th className="px-3 py-2.5 font-bold">Title</th>
                <th className="px-3 py-2.5 font-bold whitespace-nowrap">Seen by</th>
                <th className="px-3 py-2.5 font-bold whitespace-nowrap">Used in</th>
                <th className="px-3 py-2.5 font-bold whitespace-nowrap">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border align-top">
                  <td className="px-3 py-3">
                    <span className="font-bold break-words">{r.name}</span>
                    <span className="block text-[13px] text-muted">{SOURCE_LABEL[r.source]}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={SEEN_BY[r.seenBy].className}>{SEEN_BY[r.seenBy].label}</span>
                  </td>
                  <td className="px-3 py-3">
                    {r.usedIn.length === 0 ? (
                      <span className="text-muted">Not used yet</span>
                    ) : (
                      <ul className="flex flex-col gap-0.5">
                        {r.usedIn.map((a) => (
                          <li key={a.id}>
                            <Link href={`/courses/${course.id}/activities/${a.id}`} className="text-accent-text hover:underline">
                              {a.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted">
                    <LocalTime value={r.date} style="day" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted">
        This course&apos;s Canvas Pages and Files are listed automatically; edit them in Canvas. Students see a material
        only inside an activity that uses it, and AI-only materials never reach students. Canvas Files are listed when
        DALAA can read them (.pdf, .txt, .md).
      </p>
    </div>
  );
}
