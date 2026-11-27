import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ListSearch, NoMatches, SearchBox, SearchGroup, SearchItem } from "@/components/list-search";
import { LocalTime } from "@/components/local-time";
import { SeenByPill } from "@/components/seen-by-pill";
import { AI_ONLY_EXPLAINED } from "@/content/guide-label";
import { CANVAS_PROBLEM, loadMaterialRows, SOURCE_LABEL, type MaterialRow } from "@/content/materials";
import { SOURCE_FILTERS } from "@/content/material-sources";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { deleteMaterialAction } from "./actions";
import { MaterialsMenu } from "./materials-menu";

export const metadata: Metadata = { title: "Materials" };

/** The course's Materials tab (D-032): readings and AI-only notes, and the Canvas course's Pages and Files. */
export default async function MaterialsPage({ params, searchParams }: PageProps<"/courses/[courseId]/materials">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const q = await searchParams;
  const base = `/courses/${course.id}/materials`;
  const filter = SOURCE_FILTERS.find((f) => f.source === q.source)?.source ?? null;

  const { rows: all, canvas } = await loadMaterialRows(db(), actor, course.id);
  const rows = filter ? all.filter((r) => r.source === filter) : all;

  return (
    <ListSearch className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox placeholder="Search for material" />
        <MaterialsMenu base={base} />
      </div>
      <div>
        <nav aria-label="Show" className="flex flex-wrap gap-1 text-sm">
          {SOURCE_FILTERS.map((f) => (
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
      </div>

      {(q.added || q.deleted) && (
        <p role="status" className="rounded-control bg-accent-soft px-4 py-3 text-accent-text">
          {q.deleted ? "Material deleted." : "Material added."}
        </p>
      )}
      {canvas === "not-connected" ? (
        <p className="text-sm text-muted">
          <Link href={`/canvas/connect?next=${encodeURIComponent(base)}`} className="text-accent-text hover:underline">
            Connect Canvas
          </Link>{" "}
          to list this course&apos;s Pages and Files here.
        </p>
      ) : (
        canvas !== "connected" && <p className="text-sm text-muted">{CANVAS_PROBLEM[canvas]}</p>
      )}

      {rows.length === 0 ? (
        <p className="border border-dashed border-border-strong px-6 py-10 text-muted">
          {filter ? "Nothing of this kind yet." : "No materials yet. Use + Materials to upload or paste one."}
        </p>
      ) : (
        <>
          <SearchGroup texts={rows.map((r) => r.name)}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[15px]">
                <thead>
                  <tr className="border-b-2 border-border-strong text-left">
                    <th className="px-3 py-2.5 font-bold">Title</th>
                    <th className="px-3 py-2.5 font-bold whitespace-nowrap">Seen by</th>
                    <th className="px-3 py-2.5 font-bold whitespace-nowrap">Used in</th>
                    <th className="px-3 py-2.5 font-bold whitespace-nowrap">Updated</th>
                    <th className="w-0 px-1 py-2.5">
                      <span className="sr-only">Delete</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <SearchItem key={r.key} text={r.name}>
                      <tr className="border-b border-border align-top">
                        <td className="px-3 py-3">
                          {r.savedId ? (
                            <Link href={`${base}/${r.savedId}`} className="font-bold break-words text-text hover:text-accent hover:underline">
                              {r.name}
                            </Link>
                          ) : (
                            <span className="font-bold break-words">{r.name}</span>
                          )}
                          <span className="block text-[13px] text-muted">
                            {SOURCE_LABEL[r.source]}
                            {r.url && (
                              <>
                                {" · "}
                                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
                                  Open page
                                </a>
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <SeenByPill seenBy={r.seenBy} />
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
                        <td className="px-1 py-1.5">
                          {r.savedId && r.seenBy !== "canvas" && <DeleteMaterial courseId={course.id} row={r} id={r.savedId} seenBy={r.seenBy} />}
                        </td>
                      </tr>
                    </SearchItem>
                  ))}
                </tbody>
              </table>
            </div>
          </SearchGroup>
          <NoMatches texts={rows.map((r) => r.name)} noun="materials" />
        </>
      )}
      <p className="text-sm text-muted">
        Open a material to read it the way students do, or to edit it. This course&apos;s Canvas Pages and Files are
        listed automatically; one an activity uses can be opened and edited here too. Students see a material
        only inside an activity that uses it. {AI_ONLY_EXPLAINED} Canvas Files are listed when
        DALAA can read them: PDF, Word, PowerPoint, .txt and .md.
      </p>
    </ListSearch>
  );
}

/**
 * A saved material's trash button. One that an activity students can open
 * uses can't go (D-041); drafts that use it just lose it. A Canvas Page or
 * File keeps being listed from Canvas: only DALAA's copy goes.
 */
function DeleteMaterial({ courseId, row, id, seenBy }: { courseId: string; row: MaterialRow; id: string; seenBy: "students" | "ai" }) {
  const live = row.usedIn.filter((a) => a.published);
  const drafts = row.usedIn.filter((a) => !a.published);
  const titles = (list: typeof row.usedIn) => list.map((a) => `"${a.title}"`).join(", ");
  return (
    <ConfirmDelete
      action={deleteMaterialAction}
      fields={{ courseId, materialId: id, seenBy }}
      name={row.name}
      blocked={
        live.length > 0
          ? `It's in ${titles(live)}, which students can already open. Take it out of ${live.length === 1 ? "that activity" : "those activities"} first (Edit, then Materials), then delete it.`
          : undefined
      }
    >
      <p>It&apos;s removed from this course for good.</p>
      {row.canvas && <p className="text-muted">It stays in your Canvas course; only DALAA&apos;s copy goes.</p>}
      {drafts.length > 0 && (
        <p className="text-muted">
          {drafts.length === 1 ? "The draft" : "The drafts"} {titles(drafts)} will no longer use it.
        </p>
      )}
    </ConfirmDelete>
  );
}
