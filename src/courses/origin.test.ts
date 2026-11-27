import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import { createCourse } from "./create";
import { keepFrom, originCourse, originListPath } from "./origin";

describe("originCourse", () => {
  it("is the other course only when the teacher teaches it", async () => {
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
    const course = async (actor: Actor, code: string) =>
      (await createCourse(db, actor, { creationKey: randomUUID(), code, title: "T", term: "W27", students: [] })).courseId;
    const here = await course(prof, "HERE 1");
    const origin = await course(prof, "FROM 1");
    const theirs = await course(other, "THEIRS 1");

    expect(await originCourse(db, prof, origin, here)).toMatchObject({ id: origin, code: "FROM 1" });
    expect(await originCourse(db, prof, origin.toUpperCase(), here)).toMatchObject({ code: "FROM 1" });
    expect(await originCourse(db, prof, here, here)).toBeNull();
    expect(await originCourse(db, prof, here.toUpperCase(), here)).toBeNull();
    expect(await originCourse(db, prof, theirs, here)).toBeNull();
    expect(await originCourse(db, other, origin, theirs)).toBeNull();
    expect(await originCourse(db, prof, undefined, here)).toBeNull();
    expect(await originCourse(db, prof, ["x"], here)).toBeNull();
    expect(await originCourse(db, prof, "not-a-uuid", here)).toBeNull();
  });
});

describe("keepFrom and originListPath", () => {
  it("keep the course on a path, alongside its other query", () => {
    expect(keepFrom("/courses/a/activities/b", null)).toBe("/courses/a/activities/b");
    expect(keepFrom("/courses/a/activities/b", "c")).toBe("/courses/a/activities/b?from=c");
    expect(keepFrom("/courses/a/activities/b/setup/scenario?addToCanvas=r", "c")).toBe(
      "/courses/a/activities/b/setup/scenario?addToCanvas=r&from=c",
    );
    expect(originListPath("c")).toBe("/courses/c?show=other");
  });
});
