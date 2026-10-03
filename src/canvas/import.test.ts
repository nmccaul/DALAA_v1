import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import { admit } from "@/auth/admit";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { getTaughtCourse, listRoster } from "@/courses/queries";
import { canvasClient } from "./client";
import { practiceClient, type TeacherCanvas } from "./connection";
import { importCourse, listImportable } from "./import";

describe("bring in a course from Canvas", () => {
  let db: Db;
  let inst: string;
  const practice: TeacherCanvas = { client: practiceClient(), mode: "practice" };

  async function teacher(netId: string): Promise<Actor> {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
  }

  beforeEach(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
  });

  it("creates the course, its sections and roster in one step", async () => {
    const prof = await teacher("prof");
    const result = await importCourse(db, prof, practice, 1101, randomUUID());
    expect(result).toMatchObject({
      ok: true,
      added: 48,
      skipped: { notEnrolled: 2, noNetId: 1, inTwoSections: 1 },
      alreadyInDalaa: false,
    });
    if (!result.ok) return;
    expect(await getTaughtCourse(db, prof, result.courseId)).toMatchObject({
      code: "BUS M 361",
      title: "Business Strategy",
      term: "Winter 2027",
      students: 48,
    });
    const sections = await db.query<{ name: string; canvas_section_id: string }>(
      "select name, canvas_section_id from sections where course_id = $1 order by name",
      [result.courseId],
    );
    expect(sections.map((s) => s.name)).toEqual(["BUS M 361 Section 001", "BUS M 361 Section 002", "BUS M 361R Section 001"]);
    expect(sections[0].canvas_section_id).toBe(`practice:${prof.userId}:11011`);
    const roster = await listRoster(db, prof, result.courseId);
    expect(roster.filter((r) => r.section === null)).toHaveLength(1); // the two-section student
  });

  it("lets imported students sign in with their NetID", async () => {
    const prof = await teacher("prof");
    await importCourse(db, prof, practice, 1102, randomUUID());
    const [{ external_id }] = await db.query<{ external_id: string }>(
      "select external_id from users where external_id like 'practice.%' limit 1",
    );
    expect(await admit(db, inst, { netId: external_id })).toMatchObject({ ok: true });
  });

  it("marks practice courses, and gives each teacher their own practice copy", async () => {
    const a = await teacher("profa");
    const b = await teacher("profb");
    const first = await importCourse(db, a, practice, 1102, randomUUID());
    const second = await importCourse(db, b, practice, 1102, randomUUID());
    expect(first.ok && second.ok && first.courseId !== second.courseId).toBe(true);
    expect(await db.query("select 1 from courses where is_practice")).toHaveLength(2);
  });

  it("doesn't import the same course twice: the second time opens the first", async () => {
    const prof = await teacher("prof");
    const first = await importCourse(db, prof, practice, 1102, randomUUID());
    const again = await importCourse(db, prof, practice, 1102, randomUUID());
    expect(again).toMatchObject({ ok: true, alreadyInDalaa: true, courseId: first.ok ? first.courseId : "" });
    const listed = await listImportable(db, prof, practice);
    expect(listed.find((c) => c.id === 1102)?.dalaaCourseId).toBe(first.ok ? first.courseId : "x");
    expect(listed.find((c) => c.id === 1101)?.dalaaCourseId).toBeNull();
  });

  it("refuses a Canvas course the teacher doesn't teach", async () => {
    expect(await importCourse(db, await teacher("prof"), practice, 4242, randomUUID())).toEqual({
      ok: false,
      reason: "not-yours",
    });
  });

  it("asks to reconnect when Canvas rejects the token, and saves nothing", async () => {
    const rejected: TeacherCanvas = {
      mode: "canvas",
      client: canvasClient({ baseUrl: "https://x", token: "t", fetch: async () => new Response("", { status: 401 }) }),
    };
    expect(await importCourse(db, await teacher("prof"), rejected, 1101, randomUUID())).toEqual({
      ok: false,
      reason: "reconnect",
    });
    expect(await db.query("select 1 from courses")).toEqual([]);
  });
});
