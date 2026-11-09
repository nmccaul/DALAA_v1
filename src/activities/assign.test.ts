import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import { canvasClient } from "@/canvas/client";
import { practiceClient, type TeacherCanvas } from "@/canvas/connection";
import { importCourse } from "@/canvas/import";
import { PRACTICE_ASSIGNMENT_GROUPS } from "@/canvas/practice/data";
import { createCourse } from "@/courses/create";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { activityLaunchUrl, assignActivity } from "./assign";

const APP = "https://dalaa.test";
const asPractice = (): TeacherCanvas => ({ client: practiceClient(), mode: "practice" });

/** A Canvas that answers every request with `status`, counting writes. */
function failing(status: number) {
  const writes: string[] = [];
  const canvas: TeacherCanvas = {
    mode: "practice",
    client: canvasClient({
      baseUrl: "https://canvas.test",
      token: "t",
      fetch: async (input, init) => {
        if (init?.method && init.method !== "GET") writes.push(`${init.method} ${String(input)}`);
        return new Response("{}", { status });
      },
    }),
  };
  return { canvas, writes };
}

describe("assignActivity", () => {
  let db: Db;
  let prof: Actor;
  let other: Actor;
  let courseId: string;
  let activityId: string;

  const due = new Date("2027-02-01T06:59:00Z");
  const closes = new Date("2027-02-08T06:59:00Z");

  const newActivity = async (course: string, extra = "") => {
    const [{ id }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, points, creation_key, created_by ${extra ? ", lti_resource_link_id" : ""})
       values ($1, 'study-chat', 'Harbor Bikes', '{}', 12, $2, $3 ${extra ? ", $4" : ""}) returning id`,
      extra ? [course, randomUUID(), prof.userId, extra] : [course, randomUUID(), prof.userId],
    );
    return id;
  };
  const row = async (id: string) =>
    (
      await db.query<{ status: string; canvas_assignment_id: string | null; due_at: Date | null }>(
        "select status, canvas_assignment_id, due_at from activities where id = $1",
        [id],
      )
    )[0];
  /** The practice Canvas assignment as it stands (an empty update reads it back unchanged). */
  const inCanvas = (assignmentId: string) => practiceClient().updateAssignment(1101, Number(assignmentId), {});

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const actor = async (netId: string): Promise<Actor> => {
      const [{ id }] = await db.query<{ id: string }>(
        "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
        [inst, netId],
      );
      return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
    };
    prof = await actor("prof");
    other = await actor("other");
    const imported = await importCourse(db, prof, asPractice(), 1101, randomUUID());
    if (!imported.ok) throw new Error(imported.reason);
    courseId = imported.courseId;
    activityId = await newActivity(courseId);
  });

  it("publishes the activity and makes an external-tool assignment that launches it", async () => {
    const group = PRACTICE_ASSIGNMENT_GROUPS.get(1101)![1].id;
    const r = await assignActivity(
      db,
      prof,
      asPractice(),
      activityId,
      { dueAt: due, lockAt: closes, groupId: group, publish: true },
      APP,
    );
    expect(r).toMatchObject({ ok: true, created: true });
    if (!r.ok) return;

    expect(await row(activityId)).toEqual({ status: "published", canvas_assignment_id: r.canvasAssignmentId, due_at: due });
    expect(await inCanvas(r.canvasAssignmentId)).toMatchObject({
      name: "Harbor Bikes",
      points_possible: 12,
      due_at: due.toISOString(),
      lock_at: closes.toISOString(),
      assignment_group_id: group,
      published: true,
      submission_types: ["external_tool"],
      external_tool_tag_attributes: { url: `${APP}/api/lti/launch?activity_id=${activityId}`, new_tab: false },
    });
  });

  it("assigning again updates the same Canvas assignment: a new due date, or none", async () => {
    const first = await assignActivity(db, prof, asPractice(), activityId, { dueAt: due, lockAt: null, publish: false }, APP);
    if (!first.ok) throw new Error(first.reason);
    const later = new Date("2027-02-15T06:59:00Z");

    const second = await assignActivity(db, prof, asPractice(), activityId, { dueAt: later, lockAt: null, publish: true }, APP);
    expect(second).toEqual({ ok: true, canvasAssignmentId: first.canvasAssignmentId, created: false });
    expect(await inCanvas(first.canvasAssignmentId)).toMatchObject({ due_at: later.toISOString(), published: true });
    expect((await row(activityId)).due_at).toEqual(later);

    const cleared = await assignActivity(db, prof, asPractice(), activityId, { dueAt: null, lockAt: null, publish: true }, APP);
    expect(cleared.ok).toBe(true);
    expect(await inCanvas(first.canvasAssignmentId)).toMatchObject({ due_at: null });
    expect((await row(activityId)).due_at).toBeNull();
  });

  it("two assigns at once make one Canvas assignment", async () => {
    const both = await Promise.all([
      assignActivity(db, prof, asPractice(), activityId, { dueAt: due, lockAt: null, publish: true }, APP),
      assignActivity(db, prof, asPractice(), activityId, { dueAt: due, lockAt: null, publish: true }, APP),
    ]);
    const ids = both.map((r) => (r.ok ? r.canvasAssignmentId : r.reason));
    expect(ids[0]).toBe(ids[1]);
    expect(both.filter((r) => r.ok && r.created)).toHaveLength(1);
  });

  it("asks a teacher with no Canvas connection to connect, and changes nothing", async () => {
    const r = await assignActivity(db, prof, null, activityId, { dueAt: due, lockAt: null, publish: true }, APP);
    expect(r).toMatchObject({ ok: false, problem: "connect" });
    expect(await row(activityId)).toMatchObject({ status: "draft", canvas_assignment_id: null });
  });

  it("refuses a course that isn't linked to Canvas, or is in the other Canvas", async () => {
    const manual = await createCourse(db, prof, { creationKey: randomUUID(), code: "X", title: "X", term: "W", students: [] });
    const unlinked = await newActivity(manual.courseId);
    expect(await assignActivity(db, prof, asPractice(), unlinked, { dueAt: due, lockAt: null, publish: true }, APP)).toMatchObject({
      ok: false,
      problem: "not-linked",
    });

    const real: TeacherCanvas = { client: practiceClient(), mode: "canvas" };
    expect(await assignActivity(db, prof, real, activityId, { dueAt: due, lockAt: null, publish: true }, APP)).toMatchObject({
      ok: false,
      problem: "wrong-canvas",
    });
    expect((await row(activityId)).status).toBe("draft");
  });

  it("refuses someone who doesn't teach the course", async () => {
    const r = await assignActivity(db, other, asPractice(), activityId, { dueAt: due, lockAt: null, publish: true }, APP);
    expect(r).toMatchObject({ ok: false, problem: "not-yours" });
  });

  it("refuses a close date before the due date, and an activity with no points", async () => {
    expect(await assignActivity(db, prof, asPractice(), activityId, { dueAt: closes, lockAt: due, publish: true }, APP)).toMatchObject({
      ok: false,
      reason: "The close date can't be before the due date.",
    });
    await db.query("update activities set points = null where id = $1", [activityId]);
    expect(await assignActivity(db, prof, asPractice(), activityId, { dueAt: due, lockAt: null, publish: true }, APP)).toMatchObject({
      ok: false,
      reason: "Give it points before you publish it.",
    });
    expect(await row(activityId)).toMatchObject({ status: "draft", canvas_assignment_id: null });
  });

  it("won't make a second Canvas assignment for an activity already linked from Canvas", async () => {
    const linked = await newActivity(courseId, "link-1");
    const r = await assignActivity(db, prof, asPractice(), linked, { dueAt: due, lockAt: null, publish: true }, APP);
    expect(r).toMatchObject({ ok: false, problem: "linked-by-hand" });
    expect((await row(linked)).canvas_assignment_id).toBeNull();
  });

  it("says plainly when Canvas refuses, and remembers no assignment", async () => {
    const cases: [number, string, RegExp][] = [
      [401, "reconnect", /Reconnect Canvas/],
      [403, "refused", /won't let your account/],
      [400, "refused", /didn't accept the assignment/],
      [503, "refused", /didn't answer/],
    ];
    for (const [status, problem, reason] of cases) {
      const { canvas, writes } = failing(status);
      const r = await assignActivity(db, prof, canvas, activityId, { dueAt: due, lockAt: null, publish: true }, APP);
      expect(r).toMatchObject({ ok: false, problem });
      expect(!r.ok && r.reason).toMatch(reason);
      expect(writes).toHaveLength(1);
      expect((await row(activityId)).canvas_assignment_id).toBeNull();
    }
  });

  it("says so when the Canvas assignment it made is gone", async () => {
    await db.query("update activities set canvas_assignment_id = '999999' where id = $1", [activityId]);
    const r = await assignActivity(db, prof, asPractice(), activityId, { dueAt: due, lockAt: null, publish: true }, APP);
    expect(r).toEqual({ ok: false, problem: "refused", reason: "Its Canvas assignment isn't in Canvas anymore." });
  });

  it("builds the launch URL from DALAA's address", () => {
    expect(activityLaunchUrl("https://dalaa.test/", "abc")).toBe("https://dalaa.test/api/lti/launch?activity_id=abc");
  });
});
