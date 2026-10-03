import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { admit } from "@/auth/admit";
import { createCourse, type NewCourse } from "./create";
import { listTaughtCourses } from "./queries";

describe("createCourse", () => {
  let db: Db;
  let prof: Actor;

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'prof', 'Prof') returning id",
      [inst],
    );
    prof = { userId: id, institutionId: inst, netId: "prof", displayName: "Prof", isStaff: true, isAdmin: false };
  });

  const input = (over: Partial<NewCourse> = {}): NewCourse => ({
    creationKey: randomUUID(),
    code: "BUS M 361",
    title: "Strategy",
    term: "Winter 2027",
    students: [
      { netId: "jdoe", name: "Jane Doe", section: "001" },
      { netId: "asmith", name: null, section: "002" },
      { netId: "bjones", name: "Bo Jones", section: "001" },
    ],
    ...over,
  });

  it("creates the course, sections, roster and teacher membership together", async () => {
    const result = await createCourse(db, prof, input());
    expect(result).toMatchObject({ studentsAdded: 3, alreadyExisted: false });

    const sections = await db.query<{ name: string; n: number }>(
      `select s.name, count(m.user_id)::int as n from sections s
         left join course_members m on m.section_id = s.id
        where s.course_id = $1 group by s.name order by s.name`,
      [result.courseId],
    );
    expect(sections).toEqual([{ name: "001", n: 2 }, { name: "002", n: 1 }]);
    expect(await listTaughtCourses(db, prof)).toMatchObject([{ id: result.courseId, students: 3 }]);
  });

  it("lets those students sign in by NetID", async () => {
    await createCourse(db, prof, input());
    expect(await admit(db, prof.institutionId, { netId: "JDoe" })).toMatchObject({ ok: true });
  });

  it("is idempotent: the same key twice makes one course", async () => {
    const once = input();
    const first = await createCourse(db, prof, once);
    const again = await createCourse(db, prof, once);
    expect(again).toEqual({ courseId: first.courseId, studentsAdded: 0, alreadyExisted: true });
    expect(await db.query("select id from courses")).toHaveLength(1);
  });

  it("reuses existing student accounts and never replaces a real name", async () => {
    await createCourse(db, prof, input({ students: [{ netId: "jdoe", name: null, section: null }] }));
    await createCourse(db, prof, input({ students: [{ netId: "jdoe", name: "Jane Doe", section: null }] }));
    await createCourse(db, prof, input({ students: [{ netId: "jdoe", name: "Typo Name", section: null }] }));
    const users = await db.query<{ display_name: string }>(
      "select display_name from users where external_id = 'jdoe'",
    );
    expect(users).toEqual([{ display_name: "Jane Doe" }]);
  });

  it("doesn't enrol the teacher as their own student", async () => {
    const result = await createCourse(db, prof, input({ students: [{ netId: "prof", name: "Me", section: null }] }));
    expect(result.studentsAdded).toBe(0);
  });

  it("saves nothing if any part fails", async () => {
    const bad = input({ students: [{ netId: "UPPER", name: null, section: null }] }); // violates the lowercase check
    await expect(createCourse(db, prof, bad)).rejects.toThrow();
    expect(await db.query("select id from courses")).toEqual([]);
  });

  it("refuses non-staff", async () => {
    await expect(createCourse(db, { ...prof, isStaff: false }, input())).rejects.toThrow(/Only instructors/);
  });
});
