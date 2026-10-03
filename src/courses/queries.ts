import { coursesTaughtBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";

export type CourseCard = {
  id: string;
  code: string;
  title: string;
  term: string;
  students: number;
};

/** The teacher's home list: courses they teach, newest first. */
export async function listTaughtCourses(db: Db, actor: Actor): Promise<CourseCard[]> {
  const scope = coursesTaughtBy(actor, "c");
  return db.query<CourseCard>(
    `select c.id, c.code, c.title, c.term,
            (select count(*)::int from course_members m
              where m.course_id = c.id and m.role = 'student' and m.status = 'active') as students
       from courses c
      where ${scope.text}
      order by c.created_at desc, c.code`,
    scope.values,
  );
}
