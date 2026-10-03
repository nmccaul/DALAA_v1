import { and, coursesTaughtBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";

export type CourseCard = {
  id: string;
  code: string;
  title: string;
  term: string;
  students: number;
  /** From practice Canvas: made-up students (D-019). */
  isPractice: boolean;
  /** Linked to a Canvas course (imported, or connected later). */
  canvasLinked: boolean;
  canvasSyncedAt: Date | null;
};

/** The teacher's home list: courses they teach, newest first. */
export async function listTaughtCourses(db: Db, actor: Actor): Promise<CourseCard[]> {
  const scope = coursesTaughtBy(actor, "c");
  return db.query<CourseCard>(
    `select c.id, c.code, c.title, c.term, c.is_practice as "isPractice",
            c.canvas_course_id is not null as "canvasLinked", c.canvas_synced_at as "canvasSyncedAt",
            (select count(*)::int from course_members m
              where m.course_id = c.id and m.role = 'student' and m.status = 'active') as students
       from courses c
      where ${scope.text}
      order by c.created_at desc, c.code`,
    scope.values,
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One course the actor teaches, or null (not theirs, or no such course). */
export async function getTaughtCourse(db: Db, actor: Actor, courseId: string): Promise<CourseCard | null> {
  if (!UUID.test(courseId)) return null;
  const where = and({ text: "c.id = $1", values: [courseId] }, coursesTaughtBy(actor, "c"));
  const [course] = await db.query<CourseCard>(
    `select c.id, c.code, c.title, c.term, c.is_practice as "isPractice",
            c.canvas_course_id is not null as "canvasLinked", c.canvas_synced_at as "canvasSyncedAt",
            (select count(*)::int from course_members m
              where m.course_id = c.id and m.role = 'student' and m.status = 'active') as students
       from courses c
      where ${where.text}`,
    where.values,
  );
  return course ?? null;
}

export type RosterEntry = {
  netId: string;
  name: string;
  section: string | null;
  status: "active" | "flagged";
};

/** Students in a course the actor teaches: current ones first, then by section and name. */
export async function listRoster(db: Db, actor: Actor, courseId: string): Promise<RosterEntry[]> {
  if (!UUID.test(courseId)) return [];
  const where = and(
    { text: "m.course_id = $1 and m.role = 'student'", values: [courseId] },
    coursesTaughtBy(actor, "c"),
  );
  return db.query<RosterEntry>(
    `select u.external_id as "netId", u.display_name as name, s.name as section, m.status
       from course_members m
       join courses c on c.id = m.course_id
       join users u on u.id = m.user_id
       left join sections s on s.id = m.section_id
      where ${where.text}
      order by m.status = 'flagged', s.name nulls last, u.display_name`,
    where.values,
  );
}

