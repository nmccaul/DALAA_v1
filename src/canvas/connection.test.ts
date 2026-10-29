import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { canvasClient } from "./client";
import { practiceCanvas } from "./practice/server";
import {
  beginOAuth,
  clientFor,
  connectPractice,
  connectReturnPath,
  connectWithToken,
  disconnect,
  finishOAuth,
  getConnection,
} from "./connection";
import { CanvasError } from "./client";
import type { OAuthTokens } from "./oauth";
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

  describe("OAuth", () => {
    const HOUR = 3_600_000;
    const tokens = (over: Partial<OAuthTokens> = {}): OAuthTokens => ({
      accessToken: "oauth-access-1111",
      refreshToken: "oauth-refresh-2222",
      expiresAt: new Date(Date.now() + HOUR),
      user: { id: 140, name: "Nathan" },
      ...over,
    });
    const stored = async () =>
      (
        await db.query<{ token_ciphertext: string; refresh_ciphertext: string | null; token_expires_at: Date | null }>(
          "select token_ciphertext, refresh_ciphertext, token_expires_at from canvas_connections",
        )
      )[0];

    it("keeps ?next= on this site", () => {
      expect(connectReturnPath("/courses/1")).toBe("/courses/1");
      for (const bad of ["//evil.test", "https://evil.test", "", null, 5]) expect(connectReturnPath(bad)).toBe("/settings");
    });

    it("stores both tokens sealed and returns to where the teacher started", async () => {
      const state = await beginOAuth(db, prof, "/courses/abc/new");
      const result = await finishOAuth(db, prof, { code: "c", state, error: null }, async () => tokens());
      expect(result).toEqual({ ok: true, next: "/courses/abc/new", canvasUserName: "Nathan" });
      const row = await stored();
      expect(row.token_ciphertext).not.toContain("oauth-access");
      expect(openToken(row.token_ciphertext)).toBe("oauth-access-1111");
      expect(openToken(row.refresh_ciphertext!)).toBe("oauth-refresh-2222");
      expect(await getConnection(db, prof)).toMatchObject({ mode: "canvas", tokenLast4: "1111", canvasUserName: "Nathan" });
    });

    it("a state works once, only for the teacher who started it, and not after it expires", async () => {
      const exchange = async () => tokens();
      const state = await beginOAuth(db, prof, "/settings");
      const other = { ...prof, userId: (await db.query<{ id: string }>(
        "insert into users (institution_id, external_id, display_name) values ($1, 'other', 'Other') returning id",
        [prof.institutionId],
      ))[0].id };
      expect(await finishOAuth(db, other, { code: "c", state, error: null }, exchange)).toEqual({ ok: false, reason: "expired" });
      expect(await finishOAuth(db, prof, { code: "c", state, error: null }, exchange)).toMatchObject({ ok: true });
      expect(await finishOAuth(db, prof, { code: "c", state, error: null }, exchange)).toEqual({ ok: false, reason: "expired" });

      const late = await beginOAuth(db, prof, "/settings");
      await db.query("update canvas_oauth_states set created_at = now() - interval '1 hour', expires_at = now() - interval '1 minute' where state = $1", [late]);
      expect(await finishOAuth(db, prof, { code: "c", state: late, error: null }, exchange)).toEqual({ ok: false, reason: "expired" });
      expect(await finishOAuth(db, prof, { code: "c", state: null, error: null }, exchange)).toEqual({ ok: false, reason: "expired" });
    });

    it("stores nothing when the teacher says no or Canvas refuses the code", async () => {
      const denied = await beginOAuth(db, prof, "/settings");
      expect(await finishOAuth(db, prof, { code: null, state: denied, error: "access_denied" }, async () => tokens())).toEqual({
        ok: false,
        reason: "denied",
        next: "/settings",
      });
      const refused = await beginOAuth(db, prof, "/settings");
      const reject = async (): Promise<OAuthTokens> => {
        throw new CanvasError("token-rejected", 400);
      };
      expect(await finishOAuth(db, prof, { code: "c", state: refused, error: null }, reject)).toMatchObject({ reason: "rejected" });
      const noRefresh = await beginOAuth(db, prof, "/settings");
      expect(
        await finishOAuth(db, prof, { code: "c", state: noRefresh, error: null }, async () => tokens({ refreshToken: null })),
      ).toMatchObject({ reason: "rejected" });
      expect(await getConnection(db, prof)).toBeNull();
    });

    it("refreshes a token about to expire, and leaves a fresh one alone", async () => {
      await finishOAuth(db, prof, { code: "c", state: await beginOAuth(db, prof, "/"), error: null }, async () =>
        tokens({ expiresAt: new Date(Date.now() + 2 * 60_000) }),
      );
      const refreshed: string[] = [];
      const refresh = async (r: string) => {
        refreshed.push(r);
        return tokens({ accessToken: "oauth-access-3333", refreshToken: null, user: null });
      };
      expect((await clientFor(db, prof, { refresh }))?.mode).toBe("canvas");
      expect(refreshed).toEqual(["oauth-refresh-2222"]);
      const row = await stored();
      expect(openToken(row.token_ciphertext)).toBe("oauth-access-3333");
      expect(openToken(row.refresh_ciphertext!)).toBe("oauth-refresh-2222"); // kept
      expect(new Date(row.token_expires_at!).getTime()).toBeGreaterThan(Date.now() + HOUR / 2);
      expect((await getConnection(db, prof))?.tokenLast4).toBe("3333");

      await clientFor(db, prof, { refresh });
      expect(refreshed).toHaveLength(1);
    });

    it("uses the stored token when Canvas won't refresh it, so the next call says reconnect", async () => {
      await finishOAuth(db, prof, { code: "c", state: await beginOAuth(db, prof, "/"), error: null }, async () =>
        tokens({ expiresAt: new Date(Date.now() - 60_000) }),
      );
      const refuse = async (): Promise<OAuthTokens> => {
        throw new CanvasError("token-rejected", 400);
      };
      expect((await clientFor(db, prof, { refresh: refuse }))?.mode).toBe("canvas");
      expect(openToken((await stored()).token_ciphertext)).toBe("oauth-access-1111");
    });

    it("pasting a token or choosing practice clears the OAuth tokens", async () => {
      await finishOAuth(db, prof, { code: "c", state: await beginOAuth(db, prof, "/"), error: null }, async () => tokens());
      await connectWithToken(db, prof, "practice-good-1a2b", fakeCanvas);
      expect(await stored()).toMatchObject({ refresh_ciphertext: null, token_expires_at: null });
    });

    it("the database refuses a refresh token without an expiry", async () => {
      await connectWithToken(db, prof, "practice-good-1a2b", fakeCanvas);
      await expect(db.query("update canvas_connections set refresh_ciphertext = 'x'")).rejects.toThrow(/check constraint/);
    });
  });
});
