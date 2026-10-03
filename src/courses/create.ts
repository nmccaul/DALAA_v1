/**
 * "Set up a course yourself" (D-016, D-017): the course, its sections, its
 * roster, and the teacher's own membership, in one transaction.
 *
 * Students are keyed on NetID so connecting Canvas later links this course
 * instead of duplicating anyone. An existing account is reused; a real name
 * is never replaced, only a placeholder (the NetID) is filled in.
 */

import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import type { RosterRow } from "./roster";

export type NewCourse = {
  /** Client-generated; a retry with the same key returns the same course. */
  creationKey: string;
  code: string;
  title: string;
  term: string;
  students: RosterRow[];
  /** Set when the course comes from Canvas (src/canvas/import.ts). */
  canvas?: {
    courseId: string;
    isPractice: boolean;
    /** Every Canvas section, even empty ones; students refer to them by name. */
    sections: { name: string; canvasSectionId: string }[];
  };
};

export type Created = { courseId: string; studentsAdded: number; alreadyExisted: boolean };

export async function createCourse(db: Db, actor: Actor, input: NewCourse): Promise<Created> {
  if (!actor.isStaff) throw new Error("Only instructors can set up courses");

  return db.transaction(async (tx) => {
    const [course] = await tx.query<{ id: string }>(
      `insert into courses (institution_id, code, title, term, created_by, creation_key, canvas_course_id, is_practice)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (creation_key) do nothing
       returning id`,
      [
        actor.institutionId,
        input.code,
        input.title,
        input.term,
        actor.userId,
        input.creationKey,
        input.canvas?.courseId ?? null,
        input.canvas?.isPractice ?? false,
      ],
    );
    if (!course) {
      const [existing] = await tx.query<{ id: string; created_by: string }>(
        "select id, created_by from courses where creation_key = $1",
        [input.creationKey],
      );
      if (existing.created_by !== actor.userId) throw new Error("Course key belongs to someone else");
      return { courseId: existing.id, studentsAdded: 0, alreadyExisted: true };
    }

    await tx.query(
      "insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')",
      [course.id, actor.userId],
    );

    const sectionIds = new Map<string, string>();
    for (const { name, canvasSectionId } of input.canvas?.sections ?? []) {
      const [section] = await tx.query<{ id: string }>(
        "insert into sections (course_id, name, canvas_section_id) values ($1, $2, $3) returning id",
        [course.id, name, canvasSectionId],
      );
      sectionIds.set(name, section.id);
    }
    for (const name of new Set(input.students.flatMap((s) => (s.section ? [s.section] : [])))) {
      if (sectionIds.has(name)) continue;
      const [section] = await tx.query<{ id: string }>(
        "insert into sections (course_id, name) values ($1, $2) returning id",
        [course.id, name],
      );
      sectionIds.set(name, section.id);
    }

    let studentsAdded = 0;
    for (const student of input.students) {
      if (student.netId === actor.netId) continue; // the teacher isn't their own student
      const [user] = await tx.query<{ id: string }>(
        `insert into users (institution_id, external_id, display_name)
         values ($1, $2, coalesce($3, $2))
         on conflict (institution_id, external_id) do update
           set display_name = case when users.display_name = users.external_id
                                   then coalesce($3, users.display_name)
                                   else users.display_name end
         returning id`,
        [actor.institutionId, student.netId, student.name],
      );
      const added = await tx.query(
        `insert into course_members (course_id, user_id, role, section_id)
         values ($1, $2, 'student', $3)
         on conflict (course_id, user_id) do nothing
         returning user_id`,
        [course.id, user.id, student.section ? sectionIds.get(student.section) : null],
      );
      studentsAdded += added.length;
    }

    return { courseId: course.id, studentsAdded, alreadyExisted: false };
  });
}
