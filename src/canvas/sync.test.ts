import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { createCourse } from "@/courses/create";
import { listRoster } from "@/courses/queries";
import type { CanvasClient, CanvasEnrollment, CanvasSection } from "./client";
import { practiceClient, type TeacherCanvas } from "./connection";
import { importCourse } from "./import";
import { canvasIdOf, linkToCanvas, syncRoster } from "./sync";

/** A Canvas whose course 500 has exactly the sections and students given. */
function canvasWith(sections: string[], students: [netId: string, section: number, state?: CanvasEnrollment["enrollment_state"]][]): TeacherCanvas {
  const secs: CanvasSection[] = sections.map((name, i) => ({ id: 900 + i, name, course_id: 500, nonxlist_course_id: null }));
  const enrollments: CanvasEnrollment[] = students.map(([netId, section, state = "active"], i) => ({
    id: i,
    user_id: 7000 + netId.charCodeAt(0) * 100 + netId.length,
    course_section_id: 900 + section,
    enrollment_state: state,
    user: { id: 7000 + netId.charCodeAt(0) * 100 + netId.length, name: netId.toUpperCase(), login_id: netId },
  }));
  const client = {
    self: async () => ({ id: 1, name: "Canvas Teacher" }),
    coursesTaught: async () => [{ id: 500, name: "Strategy", course_code: "BUS 500" }],
    sections: async () => secs,
    studentEnrollments: async () => enrollments,
  } as unknown as CanvasClient;
  return { client, mode: "canvas" };
}

describe("roster sync", () => {
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

  const roster = async (courseId: string) =>
    (await listRoster(db, prof, courseId)).map((r) => `${r.netId}:${r.section ?? "-"}:${r.status}`).sort();

  async function imported(canvas: TeacherCanvas) {
    const r = await importCourse(db, prof, canvas, 500, randomUUID());
    if (!r.ok) throw new Error(r.reason);
    return r.courseId;
  }

  it("adds new students, flags ones who left, moves section changes, never deletes", async () => {
    const id = await imported(canvasWith(["001", "002"], [["amy", 0], ["bo", 0], ["cy", 1]]));
    const result = await syncRoster(db, prof, canvasWith(["001", "002"], [["amy", 1], ["cy", 1], ["dee", 0]]), id);
    expect(result).toMatchObject({ ok: true, added: 1, flagged: 1, moved: 1, returned: 0 });
    expect(await roster(id)).toEqual(["amy:002:active", "bo:001:flagged", "cy:002:active", "dee:001:active"]);
  });

  it("brings a flagged student back when they reappear", async () => {
    const id = await imported(canvasWith(["001"], [["amy", 0], ["bo", 0]]));
    await syncRoster(db, prof, canvasWith(["001"], [["amy", 0]]), id);
    const back = await syncRoster(db, prof, canvasWith(["001"], [["amy", 0], ["bo", 0]]), id);
    expect(back).toMatchObject({ ok: true, returned: 1, flagged: 0 });
    expect(await roster(id)).toEqual(["amy:001:active", "bo:001:active"]);
  });

  it("flags a student who dropped in Canvas", async () => {
    const id = await imported(canvasWith(["001"], [["amy", 0], ["bo", 0]]));
    await syncRoster(db, prof, canvasWith(["001"], [["amy", 0], ["bo", 0, "completed"]]), id);
    expect(await roster(id)).toEqual(["amy:001:active", "bo:001:flagged"]);
  });

  it("adds a new Canvas section", async () => {
    const id = await imported(canvasWith(["001"], [["amy", 0]]));
    await syncRoster(db, prof, canvasWith(["001", "003"], [["amy", 0], ["zed", 1]]), id);
    expect(await roster(id)).toEqual(["amy:001:active", "zed:003:active"]);
  });

  it("is a no-op when nothing changed, and records when it ran", async () => {
    const canvas = canvasWith(["001"], [["amy", 0]]);
    const id = await imported(canvas);
    expect(await syncRoster(db, prof, canvas, id)).toMatchObject({ added: 0, flagged: 0, moved: 0, returned: 0 });
    const [{ canvas_synced_at }] = await db.query<{ canvas_synced_at: Date | null }>(
      "select canvas_synced_at from courses where id = $1",
      [id],
    );
    expect(canvas_synced_at).not.toBeNull();
  });

  it("won't sync a practice course with real Canvas, or a hand-made course at all", async () => {
    const practice: TeacherCanvas = { client: practiceClient(), mode: "practice" };
    const p = await importCourse(db, prof, practice, 1102, randomUUID());
    if (!p.ok) throw new Error();
    expect(await syncRoster(db, prof, canvasWith([], []), p.courseId)).toEqual({ ok: false, reason: "wrong-canvas" });
    const manual = await createCourse(db, prof, { creationKey: randomUUID(), code: "X", title: "X", term: "W", students: [] });
    expect(await syncRoster(db, prof, practice, manual.courseId)).toEqual({ ok: false, reason: "not-linked" });
  });

  it("links a hand-made course to Canvas by NetID: same accounts, sections adopted, extras flagged", async () => {
    const manual = await createCourse(db, prof, {
      creationKey: randomUUID(),
      code: "BUS 500",
      title: "Strategy",
      term: "W",
      students: [
        { netId: "amy", name: "Amy Real", section: "001" },
        { netId: "typo", name: "Typo Student", section: "001" },
      ],
    });
    const [{ id: amyBefore }] = await db.query<{ id: string }>("select id from users where external_id = 'amy'");

    const result = await linkToCanvas(db, prof, canvasWith(["001"], [["amy", 0], ["bo", 0]]), manual.courseId, 500);
    expect(result).toMatchObject({ ok: true, added: 1, flagged: 1 });
    expect(await roster(manual.courseId)).toEqual(["amy:001:active", "bo:001:active", "typo:001:flagged"]);
    expect(await db.query("select 1 from sections where course_id = $1", [manual.courseId])).toHaveLength(1);
    const [{ id: amyAfter, display_name }] = await db.query<{ id: string; display_name: string }>(
      "select id, display_name from users where external_id = 'amy'",
    );
    expect(amyAfter).toBe(amyBefore);
    expect(display_name).toBe("Amy Real");
  });

  it("won't link to a Canvas course the teacher doesn't teach, or one already in DALAA", async () => {
    const manual = await createCourse(db, prof, { creationKey: randomUUID(), code: "X", title: "X", term: "W", students: [] });
    expect(await linkToCanvas(db, prof, canvasWith([], []), manual.courseId, 999)).toEqual({ ok: false, reason: "not-yours" });
    await imported(canvasWith(["001"], [["amy", 0]]));
    expect(await linkToCanvas(db, prof, canvasWith([], []), manual.courseId, 500)).toEqual({ ok: false, reason: "taken" });
  });
});

describe("canvasIdOf", () => {
  it("reads real and practice ids", () => {
    expect(canvasIdOf("24795")).toBe(24795);
    expect(canvasIdOf("practice:3f2a:1101")).toBe(1101);
  });
});
