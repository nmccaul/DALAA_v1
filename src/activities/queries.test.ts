import { describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import { listCourseActivities } from "./queries";

describe("listCourseActivities", () => {
  it("lists a course's activities for its teacher, soonest due first, and nothing for anyone else", async () => {
    const db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const actorFor = async (netId: string): Promise<Actor> => {
      const [{ id }] = await db.query<{ id: string }>(
        "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
        [inst, netId],
      );
      return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
    };
    const prof = await actorFor("prof");
    const other = await actorFor("other");
    const [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'BUS M 361', 'T', 'Winter 2027', $2) returning id",
      [inst, prof.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [course, prof.userId]);
    const activity = async (title: string, status: string, points: number | null, dueAt: string | null) =>
      (
        await db.query<{ id: string }>(
          `insert into activities (course_id, tool, title, settings, status, points, due_at, created_by)
           values ($1, 'study-chat', $2, '{}', $3, $4, $5, $6) returning id`,
          [course, title, status, points, dueAt, prof.userId],
        )
      )[0].id;
    const undated = await activity("Practice", "draft", null, null);
    const later = await activity("Case 2", "published", 10, "2027-02-10T23:59:00Z");
    const sooner = await activity("Case 1", "published", 12.5, "2027-01-20T23:59:00Z");

    const rows = await listCourseActivities(db, prof, course);
    expect(rows.map((r) => r.id)).toEqual([sooner, later, undated]);
    expect(rows[0]).toEqual({
      id: sooner,
      tool: "study-chat",
      title: "Case 1",
      status: "published",
      points: 12.5,
      dueAt: new Date("2027-01-20T23:59:00Z"),
      submitted: 0,
      graded: 0,
    });
    expect(rows[2]).toMatchObject({ status: "draft", points: null, dueAt: null });

    expect(await listCourseActivities(db, other, course)).toEqual([]);
    expect(await listCourseActivities(db, prof, "not-a-uuid")).toEqual([]);
  });
});
