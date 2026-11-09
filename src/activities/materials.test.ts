import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { activityMaterials, activityReadings, setActivityMaterials } from "./materials";

const MIGRATION = "20261109071641_activity_materials.sql";

describe("activity materials", () => {
  let db: Db & { migrateRest: () => Promise<string[]> };
  let inst: string;
  let prof: Actor;
  let other: Actor;
  let course: string;
  let otherCourse: string;
  let activity: string;

  const actor = async (netId: string): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
  };
  const newCourse = async (owner: Actor) => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, owner.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [id, owner.userId]);
    return id;
  };
  const material = async (table: "course_content" | "course_guides", courseId: string, name: string) => {
    const [{ id }] = await db.query<{ id: string }>(
      `insert into ${table} (course_id, source, name, body, creation_key, created_by)
       values ($1, 'paste', $2, $3, $4, $5) returning id`,
      [courseId, name, `${name} body`, randomUUID(), prof.userId],
    );
    return id;
  };
  const newActivity = async (courseId: string, contentId: string | null = null, guideId: string | null = null) => {
    const [{ id }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, content_id, guide_id, creation_key, created_by)
       values ($1, 'study-chat', 'Harbor Bikes', '{}', $2, $3, $4, $5) returning id`,
      [courseId, contentId, guideId, randomUUID(), prof.userId],
    );
    return id;
  };
  const setup = async (options: { before?: string } = {}) => {
    db = await testDb(options);
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    prof = await actor("prof");
    other = await actor("other");
    course = await newCourse(prof);
    otherCourse = await newCourse(prof);
  };

  describe("backfill", () => {
    it("carries each activity's reading and guide over, reading first", async () => {
      await setup({ before: MIGRATION });
      const reading = await material("course_content", course, "Case");
      const guide = await material("course_guides", course, "Notes");
      const both = await newActivity(course, reading, guide);
      const none = await newActivity(course);
      expect(await db.migrateRest()).toEqual([MIGRATION]);

      const m = await activityMaterials(db, both);
      expect(m.readings.map((r) => r.name)).toEqual(["Case"]);
      expect(m.guides.map((g) => g.name)).toEqual(["Notes"]);
      expect(await activityMaterials(db, none)).toEqual({ readings: [], guides: [] });
    });
  });

  describe("set and read", () => {
    beforeEach(async () => {
      await setup();
      activity = await newActivity(course);
    });

    it("keeps the order given and replaces the whole set", async () => {
      const a = await material("course_content", course, "A");
      const b = await material("course_content", course, "B");
      const g1 = await material("course_guides", course, "G1");
      const g2 = await material("course_guides", course, "G2");

      expect(await setActivityMaterials(db, prof, activity, { contentIds: [b, a], guideIds: [g2, g1] })).toEqual({ ok: true });
      let m = await activityMaterials(db, activity);
      expect(m.readings.map((r) => r.name)).toEqual(["B", "A"]);
      expect(m.guides.map((g) => g.name)).toEqual(["G2", "G1"]);

      expect(await setActivityMaterials(db, prof, activity, { contentIds: [a], guideIds: [] })).toEqual({ ok: true });
      m = await activityMaterials(db, activity);
      expect(m.readings.map((r) => r.name)).toEqual(["A"]);
      expect(m.guides).toEqual([]);
    });

    it("saving the same set twice leaves one row per material", async () => {
      const a = await material("course_content", course, "A");
      const g = await material("course_guides", course, "G");
      await setActivityMaterials(db, prof, activity, { contentIds: [a, a], guideIds: [g] });
      await setActivityMaterials(db, prof, activity, { contentIds: [a], guideIds: [g, g] });
      expect(await db.query("select id from activity_materials")).toHaveLength(2);
    });

    it("readings never include AI-only notes", async () => {
      const a = await material("course_content", course, "A");
      const g = await material("course_guides", course, "G");
      await setActivityMaterials(db, prof, activity, { contentIds: [a], guideIds: [g] });
      const readings = await activityReadings(db, activity);
      expect(readings.map((r) => r.name)).toEqual(["A"]);
      expect(JSON.stringify(readings)).not.toContain("G body");
    });

    it("refuses an activity the actor doesn't teach", async () => {
      const a = await material("course_content", course, "A");
      expect(await setActivityMaterials(db, other, activity, { contentIds: [a], guideIds: [] })).toEqual({
        ok: false,
        reason: "That assignment isn't one of yours.",
      });
      expect(await db.query("select id from activity_materials")).toHaveLength(0);
    });

    it("refuses a reading or a note from another course, and changes nothing", async () => {
      const mine = await material("course_content", course, "Mine");
      await setActivityMaterials(db, prof, activity, { contentIds: [mine], guideIds: [] });
      const foreignReading = await material("course_content", otherCourse, "Theirs");
      const foreignGuide = await material("course_guides", otherCourse, "Their notes");
      const refusal = { ok: false, reason: "We couldn't find one of those materials in this course. Add it again." };

      expect(await setActivityMaterials(db, prof, activity, { contentIds: [foreignReading], guideIds: [] })).toEqual(refusal);
      expect(await setActivityMaterials(db, prof, activity, { contentIds: [mine], guideIds: [foreignGuide] })).toEqual(refusal);
      expect(await setActivityMaterials(db, prof, activity, { contentIds: ["not-a-uuid"], guideIds: [] })).toEqual(refusal);
      expect((await activityMaterials(db, activity)).readings.map((r) => r.name)).toEqual(["Mine"]);
    });

    it("the database refuses a row with both kinds, or neither", async () => {
      const a = await material("course_content", course, "A");
      const g = await material("course_guides", course, "G");
      const insert = (c: string | null, gd: string | null) =>
        db.query(
          "insert into activity_materials (activity_id, course_id, content_id, guide_id, position) values ($1, $2, $3, $4, 0)",
          [activity, course, c, gd],
        );
      await expect(insert(a, g)).rejects.toThrow();
      await expect(insert(null, null)).rejects.toThrow();
    });

    it("the database refuses the same reading twice and a reading from another course", async () => {
      const a = await material("course_content", course, "A");
      const foreign = await material("course_content", otherCourse, "F");
      const insert = (c: string, position: number) =>
        db.query(
          "insert into activity_materials (activity_id, course_id, content_id, position) values ($1, $2, $3, $4)",
          [activity, course, c, position],
        );
      await insert(a, 0);
      await expect(insert(a, 1)).rejects.toThrow();
      await expect(insert(foreign, 2)).rejects.toThrow();
    });
  });
});
