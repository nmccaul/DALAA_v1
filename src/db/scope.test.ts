import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Db } from "./types";
import {
  MATCH_ALL,
  MATCH_NOTHING,
  and,
  coursesTaughtBy,
  coursesVisibleTo,
  or,
  type Actor,
  type Scope,
} from "./scope";

describe("composition", () => {
  const x: Scope = { text: "a = $1 and b = $2", values: [1, 2] };
  const y: Scope = { text: "c = $1 or d = $1", values: [3] };

  it("renumbers placeholders by offset and keeps fragments intact", () => {
    expect(or(x, y)).toEqual({
      text: "(a = $1 and b = $2) or (c = $3 or d = $3)",
      values: [1, 2, 3],
    });
    expect(and(y, x)).toEqual({
      text: "(c = $1 or d = $1) and (a = $2 and b = $3)",
      values: [3, 1, 2],
    });
  });

  it("handles two-digit placeholders", () => {
    const many: Scope = {
      text: Array.from({ length: 10 }, (_, i) => `v = $${i + 1}`).join(" or "),
      values: Array.from({ length: 10 }, (_, i) => i),
    };
    expect(and(x, many).text).toContain("v = $12");
    expect(and(x, many).text).not.toContain("$110");
  });

  it("composes nothing into MATCH_NOTHING, never an empty string", () => {
    expect(and()).toBe(MATCH_NOTHING);
    expect(or()).toBe(MATCH_NOTHING);
  });

  it("rejects an alias that isn't a plain identifier", () => {
    expect(() => coursesVisibleTo(bareActor("u"), "c; drop table users")).toThrow(/alias/);
  });
});

// Two professors, two courses, one student in each, one flagged student.
describe("course scopes against Postgres", () => {
  let db: Db;
  const ids: Record<string, string> = {};

  async function run(scope: Scope): Promise<string[]> {
    const rows = await db.query<{ code: string }>(
      `select c.code from courses c where ${scope.text} order by c.code`,
      scope.values,
    );
    return rows.map((r) => r.code);
  }

  beforeAll(async () => {
    db = await testDb();
    const [inst] = await db.query<{ id: string }>("select id from institutions where slug = 'byu'");
    ids.inst = inst.id;
    for (const netId of ["profa", "profb", "stu1", "stu2", "gone"]) {
      const [u] = await db.query<{ id: string }>(
        "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
        [inst.id, netId],
      );
      ids[netId] = u.id;
    }
    for (const [code, owner] of [["A 100", "profa"], ["B 200", "profb"]]) {
      const [c] = await db.query<{ id: string }>(
        "insert into courses (institution_id, code, title, term, created_by) values ($1, $2, $2, 'Winter 2027', $3) returning id",
        [inst.id, code, ids[owner]],
      );
      ids[code] = c.id;
    }
    const member = (course: string, user: string, role: string, status = "active") =>
      db.query(
        "insert into course_members (course_id, user_id, role, status) values ($1, $2, $3, $4)",
        [ids[course], ids[user], role, status],
      );
    await member("A 100", "profa", "instructor");
    await member("B 200", "profb", "instructor");
    await member("A 100", "stu1", "student");
    await member("B 200", "stu2", "student");
    await member("A 100", "gone", "student", "flagged");
  });

  function actor(netId: string, isStaff: boolean, isAdmin = false): Actor {
    return {
      userId: ids[netId] ?? netId,
      institutionId: ids.inst,
      netId,
      displayName: netId,
      isStaff,
      isAdmin,
    };
  }

  it("keeps professors out of each other's courses", async () => {
    expect(await run(coursesTaughtBy(actor("profa", true)))).toEqual(["A 100"]);
    expect(await run(coursesTaughtBy(actor("profb", true)))).toEqual(["B 200"]);
    expect(await run(coursesVisibleTo(actor("profa", true)))).toEqual(["A 100"]);
  });

  it("shows students only their own course, and teaches them nothing", async () => {
    expect(await run(coursesVisibleTo(actor("stu1", false)))).toEqual(["A 100"]);
    expect(await run(coursesTaughtBy(actor("stu1", false)))).toEqual([]);
  });

  it("hides a course from a student flagged off the roster", async () => {
    expect(await run(coursesVisibleTo(actor("gone", false)))).toEqual([]);
  });

  it("gives a professor removed from the allowlist nothing to teach", async () => {
    expect(await run(coursesTaughtBy(actor("profa", false)))).toEqual([]);
  });

  it("lets an admin see every course but teach only their own", async () => {
    expect(coursesVisibleTo(actor("profa", true, true))).toBe(MATCH_ALL);
    expect(await run(coursesTaughtBy(actor("profa", true, true)))).toEqual(["A 100"]);
  });

  it("keeps parameters right when composed with another filter", async () => {
    const term: Scope = { text: "c.term = $1", values: ["Winter 2027"] };
    expect(await run(and(term, coursesTaughtBy(actor("profb", true))))).toEqual(["B 200"]);
  });
});

function bareActor(userId: string): Actor {
  return { userId, institutionId: "i", netId: userId, displayName: userId, isStaff: true, isAdmin: false };
}
