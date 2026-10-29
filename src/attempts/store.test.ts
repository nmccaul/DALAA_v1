import { describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import { getTakenActivity } from "./store";

describe("getTakenActivity", () => {
  it("links back to the activity's course in real Canvas, and never to a practice or unlinked one", async () => {
    const db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const actorFor = async (netId: string): Promise<Actor> => {
      const [{ id }] = await db.query<{ id: string }>(
        "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
        [inst, netId],
      );
      return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: false, isAdmin: false };
    };
    const prof = await actorFor("prof");
    const student = await actorFor("student");
    const activityIn = async (canvasCourseId: string | null, isPractice: boolean) => {
      const [{ id: course }] = await db.query<{ id: string }>(
        `insert into courses (institution_id, code, title, term, created_by, canvas_course_id, is_practice)
         values ($1, 'BUS M 361', 'T', 'Winter 2027', $2, $3, $4) returning id`,
        [inst, prof.userId, canvasCourseId, isPractice],
      );
      await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'student')", [course, student.userId]);
      const [{ id }] = await db.query<{ id: string }>(
        `insert into activities (course_id, tool, title, settings, status, points, created_by)
         values ($1, 'study-chat', 'Case', '{}', 'published', 10, $2) returning id`,
        [course, prof.userId],
      );
      return id;
    };

    const real = await getTakenActivity(db, student, await activityIn("12345", false));
    expect(real?.canvasCourseUrl).toBe("https://byu.instructure.com/courses/12345");
    const practice = await getTakenActivity(db, student, await activityIn(`practice:${prof.userId}:7`, true));
    expect(practice?.canvasCourseUrl).toBeNull();
    const unlinked = await getTakenActivity(db, student, await activityIn(null, false));
    expect(unlinked?.canvasCourseUrl).toBeNull();
  });
});
