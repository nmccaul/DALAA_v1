/**
 * The Gradebook (D-046): every student by every published assignment, like
 * Canvas's, with what is and isn't in Canvas on each grade. Disputes live in
 * it too. Built on listCourseGrades; adds what DALAA last sent to Canvas for
 * each student, which is what "in Canvas" means here (CLAUDE.md: an
 * unconfirmed push is never recorded as sent).
 */

import { and, coursesTaughtBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { listCourseGrades, type AssignmentGrades, type StudentGrade } from "./grading";

/** Where a grade stands with Canvas. */
export type CanvasState =
  | "in_canvas" // the score that counts is what Canvas last confirmed
  | "not_sent" // graded, never sent
  | "changed" // sent, then changed in DALAA: Canvas has the old score
  | "none"; // nothing to send yet (not graded)

export type GradebookCell = StudentGrade & { lastSent: number | null; canvas: CanvasState };

export type GradebookColumn = Omit<AssignmentGrades, "students"> & {
  /** Graded but not in Canvas: never sent, or changed since. */
  unsent: number;
  graded: number;
};

export type GradebookRow = {
  userId: string;
  name: string;
  loginId: string;
  studentView: boolean;
  flagged: boolean;
  /** By activity id. */
  cells: Record<string, GradebookCell>;
};

export type Gradebook = { columns: GradebookColumn[]; rows: GradebookRow[] };

const same = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

/** A grade's Canvas state, from the score that counts and what Canvas last confirmed. */
export function canvasState(cell: Pick<StudentGrade, "status" | "aiScore" | "teacherScore">, lastSent: number | null): CanvasState {
  if (cell.status !== "graded" || cell.aiScore === null) return "none";
  if (lastSent === null) return "not_sent";
  return same(cell.teacherScore ?? cell.aiScore, lastSent) ? "in_canvas" : "changed";
}

/** The course's gradebook for one of its teachers; empty for anyone else. */
export async function getGradebook(db: Db, actor: Actor, courseId: string): Promise<Gradebook> {
  const assignments = await listCourseGrades(db, actor, courseId);
  if (assignments.length === 0) return { columns: [], rows: [] };
  const where = and({ text: "a.course_id = $1", values: [courseId] }, coursesTaughtBy(actor, "c"));
  // The latest score Canvas confirmed for each student on each assignment.
  const sent = await db.query<{ activityId: string; userId: string; score: number }>(
    `select distinct on (p.activity_id, l.user_id) p.activity_id as "activityId", l.user_id as "userId", l.score::float8 as score
       from grade_push_lines l
       join grade_pushes p on p.id = l.push_id
       join activities a on a.id = p.activity_id
       join courses c on c.id = a.course_id
      where ${where.text} and l.status = 'sent'
      order by p.activity_id, l.user_id, l.sent_at desc`,
    where.values,
  );
  const lastSent = new Map(sent.map((s) => [`${s.activityId}:${s.userId}`, s.score]));

  const rows = new Map<string, GradebookRow>();
  const columns: GradebookColumn[] = assignments.map(({ students, ...a }) => {
    let unsent = 0;
    let graded = 0;
    for (const s of students) {
      const last = lastSent.get(`${a.activityId}:${s.userId}`) ?? null;
      const canvas = canvasState(s, last);
      if (s.status === "graded") graded += 1;
      if (canvas === "not_sent" || canvas === "changed") unsent += 1;
      let row = rows.get(s.userId);
      if (!row) {
        row = { userId: s.userId, name: s.name, loginId: s.loginId, studentView: s.studentView, flagged: s.flagged, cells: {} };
        rows.set(s.userId, row);
      }
      row.cells[a.activityId] = { ...s, lastSent: last, canvas };
    }
    return { ...a, unsent, graded };
  });
  // Students by name; Canvas's Student View test users last.
  const ordered = [...rows.values()].sort((x, y) => Number(x.studentView) - Number(y.studentView) || x.name.localeCompare(y.name));
  return { columns, rows: ordered };
}
