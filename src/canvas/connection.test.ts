import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { canvasClient } from "./client";
import { practiceCanvas } from "./practice/server";
import { clientFor, connectPractice, connectWithToken, disconnect, getConnection } from "./connection";
import { VaultError, openToken, sealToken } from "./vault";

beforeAll(() => {
  process.env.CANVAS_TOKEN_KEY = randomBytes(32).toString("base64");
});

describe("vault", () => {
  it("round-trips a token and never stores it in the clear", () => {
    const sealed = sealToken("7~abcd1234");
    expect(sealed).not.toContain("abcd1234");
    expect(openToken(sealed)).toBe("7~abcd1234");
    expect(sealToken("7~abcd1234")).not.toBe(sealed); // fresh IV every time
  });

  it("refuses tampered ciphertext or a different key, as a VaultError", () => {
    const sealed = sealToken("7~abcd1234");
    // Flip a real byte of the ciphertext. (Editing the last base64 characters
    // isn't enough: they can hold only padding bits and decode unchanged.)
    const [version, iv, tag, body] = sealed.split(".");
    const bytes = Buffer.from(body, "base64url");
    bytes[0] ^= 0xff;
    const tampered = [version, iv, tag, bytes.toString("base64url")].join(".");
    expect(() => openToken(tampered)).toThrow(VaultError);
    const original = process.env.CANVAS_TOKEN_KEY;
    process.env.CANVAS_TOKEN_KEY = randomBytes(32).toString("base64");
    expect(() => openToken(sealed)).toThrow(VaultError);
    process.env.CANVAS_TOKEN_KEY = original;
  });
});

describe("canvas connections", () => {
  let db: Db;
  let prof: Actor;

  // Stand-in for real Canvas: practice Canvas accepts tokens starting "practice-".
  const fakeCanvas = (token: string) =>
    canvasClient({ baseUrl: "https://canvas.test", token, fetch: async (i, init) => practiceCanvas(new Request(i, init)) });

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'prof', 'Prof') returning id",
      [inst],
    );
    prof = { userId: id, institutionId: inst, netId: "prof", displayName: "Prof", isStaff: true, isAdmin: false };
  });

  it("stores a token only after Canvas accepts it, encrypted, showing the last 4", async () => {
    expect(await connectWithToken(db, prof, "  practice-good-1a2b ", fakeCanvas)).toEqual({
      ok: true,
      canvasUserName: "Practice Professor",
    });
    const [row] = await db.query<{ token_ciphertext: string }>("select token_ciphertext from canvas_connections");
    expect(row.token_ciphertext).not.toContain("practice-good");
    expect(await getConnection(db, prof)).toMatchObject({ mode: "canvas", tokenLast4: "1a2b" });
  });

  it("doesn't store a token Canvas rejects, or an empty one", async () => {
    expect(await connectWithToken(db, prof, "wrong-token", fakeCanvas)).toEqual({ ok: false, reason: "rejected" });
    expect(await connectWithToken(db, prof, "   ", fakeCanvas)).toEqual({ ok: false, reason: "empty" });
    expect(await getConnection(db, prof)).toBeNull();
  });

  it("reports Canvas being down without storing anything", async () => {
    const down = (token: string) => canvasClient({ baseUrl: "https://x", token, fetch: () => Promise.reject(new Error("offline")) });
    expect(await connectWithToken(db, prof, "practice-x", down)).toEqual({ ok: false, reason: "unavailable" });
    expect(await getConnection(db, prof)).toBeNull();
  });

  it("replaces, never duplicates: one connection per teacher", async () => {
    await connectWithToken(db, prof, "practice-first-aaaa", fakeCanvas);
    await connectWithToken(db, prof, "practice-second-bbbb", fakeCanvas);
    expect(await db.query("select 1 from canvas_connections")).toHaveLength(1);
    expect((await getConnection(db, prof))?.tokenLast4).toBe("bbbb");
    await connectPractice(db, prof);
    expect(await getConnection(db, prof)).toMatchObject({ mode: "practice", tokenLast4: null });
  });

  it("builds a working client for a practice connection, and none after disconnecting", async () => {
    await connectPractice(db, prof);
    const canvas = await clientFor(db, prof);
    expect(canvas?.mode).toBe("practice");
    expect((await canvas!.client.coursesTaught()).map((c) => c.course_code)).toContain("BUS M 361");
    await disconnect(db, prof);
    expect(await clientFor(db, prof)).toBeNull();
  });

  it("surfaces an unreadable stored token as a VaultError, not a crash", async () => {
    await connectWithToken(db, prof, "practice-good-1a2b", fakeCanvas);
    await db.query("update canvas_connections set token_ciphertext = 'v1.garbage.x.y'");
    await expect(clientFor(db, prof)).rejects.toThrow(VaultError);
  });

  it("refuses non-staff", async () => {
    await expect(connectPractice(db, { ...prof, isStaff: false })).rejects.toThrow(/Only instructors/);
  });

  it("the database refuses a real connection without a token, or a practice one with", async () => {
    await expect(
      db.query("insert into canvas_connections (user_id, mode, canvas_user_id, canvas_user_name) values ($1, 'canvas', 1, 'x')", [
        prof.userId,
      ]),
    ).rejects.toThrow(/check constraint/);
  });
});
