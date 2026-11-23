"use client";

import { CheckCircle, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CanvasState } from "@/results/gradebook";
import { sendGradesAction } from "./actions";

export type GridCell = {
  attemptId: string | null;
  status: "not_started" | "in_progress" | "submitted" | "graded";
  /** The score that counts; NULL until graded. */
  score: number | null;
  canvas: CanvasState;
  disputed: boolean;
};

export type GridColumn = { id: string; title: string; points: number; graded: number; unsent: number; sendKey: string };
export type GridRow = { userId: string; name: string; loginId: string; note: string | null; cells: Record<string, GridCell> };

type Show = "all" | "unsent" | "disputed";

const pts = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const STATUS_WORD: Record<GridCell["status"], string> = {
  not_started: "–",
  in_progress: "In progress",
  submitted: "Grading…",
  graded: "",
};

/** The Canvas mark under a grade: the one thing a teacher must never have to guess (D-046). */
function CanvasMark({ cell, linked }: { cell: GridCell; linked: boolean }) {
  return (
    <>
      {cell.disputed && <span className="rounded-full bg-danger-soft px-1.5 text-[11px] font-bold text-danger">Disputed</span>}
      <CanvasState cell={cell} linked={linked} />
    </>
  );
}

function CanvasState({ cell, linked }: { cell: GridCell; linked: boolean }) {
  if (!linked || cell.canvas === "none") return null;
  if (cell.canvas === "in_canvas")
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-success">
        <CheckCircle size={12} weight="fill" aria-hidden /> In Canvas
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-warn-text">
      <WarningCircle size={12} weight="fill" aria-hidden /> {cell.canvas === "changed" ? "Changed, not sent" : "Not sent"}
    </span>
  );
}

function label(row: GridRow, col: GridColumn, cell: GridCell, linked: boolean): string {
  const grade = cell.score === null ? (STATUS_WORD[cell.status] === "–" ? "Not started" : STATUS_WORD[cell.status]) : `${pts.format(cell.score)} of ${pts.format(col.points)}`;
  const canvas = !linked || cell.canvas === "none" ? "" : cell.canvas === "in_canvas" ? ", in Canvas" : cell.canvas === "changed" ? ", changed since sent to Canvas" : ", not sent to Canvas";
  return `${row.name}, ${col.title}: ${grade}${canvas}${cell.disputed ? ", disputed" : ""}`;
}

/**
 * The Gradebook grid (D-046, after Canvas's): students down, assignments
 * across, each grade with its Canvas mark. Clicking a grade opens it beside
 * the grid (`?open=`), on the same page. Searching and the Show filter run
 * here, without reloading.
 */
export function GradebookGrid({
  courseId,
  columns,
  rows,
  linked,
  base,
  open,
  initialAssignment,
}: {
  courseId: string;
  columns: GridColumn[];
  rows: GridRow[];
  linked: boolean;
  base: string;
  open: string | null;
  initialAssignment: string | null;
}) {
  const [student, setStudent] = useState("");
  const [assignment, setAssignment] = useState(columns.find((c) => c.id === initialAssignment)?.title ?? "");
  const [show, setShow] = useState<Show>("all");

  const shownCols = useMemo(() => {
    const q = assignment.trim().toLowerCase();
    return columns.filter((c) => !q || c.title.toLowerCase().includes(q));
  }, [columns, assignment]);
  const shownRows = useMemo(() => {
    const q = student.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.loginId.toLowerCase().includes(q)) return false;
      if (show === "all") return true;
      return shownCols.some((c) => {
        const cell = r.cells[c.id];
        return show === "disputed" ? cell?.disputed : cell && (cell.canvas === "not_sent" || cell.canvas === "changed");
      });
    });
  }, [rows, student, show, shownCols]);

  const href = (attemptId: string) => {
    const q = new URLSearchParams({ open: attemptId });
    if (initialAssignment) q.set("assignment", initialAssignment);
    return `${base}?${q}`;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Student names
          <span className="relative">
            <MagnifyingGlass size={16} aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={student}
              onChange={(e) => setStudent(e.target.value)}
              placeholder="Search students"
              className="w-full rounded-control border border-border-strong bg-surface py-2 pr-3 pl-9 font-normal"
            />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Assignment names
          <span className="relative">
            <MagnifyingGlass size={16} aria-hidden className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={assignment}
              onChange={(e) => setAssignment(e.target.value)}
              placeholder="Search assignments"
              className="w-full rounded-control border border-border-strong bg-surface py-2 pr-3 pl-9 font-normal"
            />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Show
          <select
            value={show}
            onChange={(e) => setShow(e.target.value as Show)}
            className="rounded-control border border-border-strong bg-surface px-3 py-2 font-normal"
          >
            <option value="all">Every student</option>
            {linked && <option value="unsent">Grades not in Canvas</option>}
            <option value="disputed">Disputed grades</option>
          </select>
        </label>
      </div>

      {shownCols.length === 0 || shownRows.length === 0 ? (
        <p className="border border-dashed border-border-strong px-6 py-8 text-muted">
          {shownCols.length === 0 ? "No assignment matches that search." : show === "all" ? "No student matches that search." : "Nothing here: no student matches."}
        </p>
      ) : (
        <div className="max-w-full overflow-x-auto rounded-panel border border-border bg-surface">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border-strong bg-subtle align-bottom">
                <th scope="col" className="sticky left-0 z-10 min-w-44 bg-subtle px-3 py-2 text-left font-bold">
                  Student name
                </th>
                {shownCols.map((c) => (
                  <th key={c.id} scope="col" className="w-44 min-w-44 border-l border-border px-3 py-2 text-left align-top font-normal">
                    <span className="line-clamp-2 font-bold break-words" title={c.title}>
                      {c.title}
                    </span>
                    <span className="block text-[13px] text-muted">Out of {pts.format(c.points)}</span>
                    {linked && c.graded > 0 && (
                      <span className="mt-1.5 block">
                        {c.unsent > 0 ? (
                          <form action={sendGradesAction} className="flex flex-col items-start gap-1">
                            <input type="hidden" name="courseId" value={courseId} />
                            <input type="hidden" name="activityId" value={c.id} />
                            <input type="hidden" name="clientKey" value={c.sendKey} />
                            <span className="text-[12px] font-bold text-warn-text">
                              {c.unsent} not in Canvas
                            </span>
                            <button className="rounded-control border border-accent-hover bg-accent px-2 py-1 text-[12px] font-bold text-white hover:bg-accent-hover">
                              Send to Canvas
                            </button>
                          </form>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[12px] font-bold text-success">
                            <CheckCircle size={13} weight="fill" aria-hidden /> All in Canvas
                          </span>
                        )}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownRows.map((r) => (
                <tr key={r.userId} className="border-b border-border last:border-b-0 even:bg-subtle/40">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left align-top font-normal">
                    <span className="block font-medium break-words">{r.name}</span>
                    {r.note && <span className="block text-[12px] text-muted">{r.note}</span>}
                  </th>
                  {shownCols.map((c) => {
                    const cell = r.cells[c.id];
                    if (!cell) return <td key={c.id} className="border-l border-border px-3 py-2 text-muted">–</td>;
                    const isOpen = cell.attemptId !== null && cell.attemptId === open;
                    const body = (
                      <span className="flex flex-col items-start gap-0.5">
                        <span className={cell.score === null ? "text-muted" : "font-bold tabular-nums"}>
                          {cell.score === null ? STATUS_WORD[cell.status] : pts.format(cell.score)}
                        </span>
                        <CanvasMark cell={cell} linked={linked} />
                      </span>
                    );
                    return (
                      <td key={c.id} className={`border-l border-border p-0 align-top ${isOpen ? "outline-2 -outline-offset-2 outline-accent" : ""}`}>
                        {cell.attemptId ? (
                          <Link
                            href={href(cell.attemptId)}
                            scroll={false}
                            aria-label={label(r, c, cell, linked)}
                            aria-current={isOpen ? "true" : undefined}
                            className="block h-full px-3 py-2 hover:bg-accent-soft"
                          >
                            {body}
                          </Link>
                        ) : (
                          <span className="block px-3 py-2" aria-label={label(r, c, cell, linked)}>
                            {body}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
