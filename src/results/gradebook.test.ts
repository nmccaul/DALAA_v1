import { describe, expect, it } from "vitest";
import { canvasState, getGradebook } from "./gradebook";
import { setTeacherScore } from "./grading";
import { setup } from "./test-course";

describe("canvasState", () => {
  const graded = { status: "graded" as const, aiScore: 7, teacherScore: null };
  it("says whether Canvas has the score that counts", () => {
    expect(canvasState(graded, null)).toBe("not_sent");
    expect(canvasState(graded, 7)).toBe("in_canvas");
    expect(canvasState({ ...graded, teacherScore: 8.5 }, 7)).toBe("changed");
    expect(canvasState({ ...graded, teacherScore: 8.5 }, 8.5)).toBe("in_canvas");
    expect(canvasState({ status: "submitted", aiScore: null, teacherScore: null }, null)).toBe("none");
  });
});

describe("getGradebook", () => {
  it("lays out students by assignments, with what Canvas last confirmed for each", async () => {
    const { db, prof, other, course, activity, student, attempt, grade } = await setup();
    const a = await activity("Case 1", "published", null);
    const b = await activity("Case 2", "published", null);
    const ana = await student("ana", "Ana");
    const ben = await student("ben", "Ben");
    const anaA = await attempt(a, ana, true);
    await grade(anaA, 7);
    const benA = await attempt(a, ben, true);
    await grade(benA, 9);
    await attempt(b, ana, false);

    // Canvas confirmed Ana's 7 and Ben's 9; Ben's then changed in DALAA.
    const [{ id: push }] = await db.query<{ id: string }>(
      `insert into grade_pushes (activity_id, client_key, pushed_by, line_item_url, summary, finished_at)
       values ($1, gen_random_uuid(), $2, 'https://canvas.test/line/1', '{}', now()) returning id`,
      [a, prof.userId],
    );
    await db.query("insert into grade_push_lines (push_id, user_id, score, status) values ($1, $2, 7, 'sent'), ($1, $3, 9, 'sent')", [
      push,
      ana.userId,
      ben.userId,
    ]);
    expect(await setTeacherScore(db, prof, benA, 9.5)).toBe("saved");

    const book = await getGradebook(db, prof, course);
    expect(book.columns.map((c) => [c.title, c.graded, c.unsent]).sort()).toEqual([
      ["Case 1", 2, 1],
      ["Case 2", 0, 0],
    ]);
    expect(book.rows.map((r) => r.name)).toEqual(["Ana", "Ben"]);
    expect(book.rows[0].cells[a]).toMatchObject({ canvas: "in_canvas", lastSent: 7 });
    expect(book.rows[1].cells[a]).toMatchObject({ canvas: "changed", lastSent: 9, teacherScore: 9.5 });
    expect(book.rows[0].cells[b]).toMatchObject({ status: "in_progress", canvas: "none" });

    expect(await getGradebook(db, other, course)).toEqual({ columns: [], rows: [] });
  });
});
