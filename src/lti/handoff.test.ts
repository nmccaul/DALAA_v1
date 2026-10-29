import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, signSession, verifySession } from "@/auth/session";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { createLoginCode, land, pendingLoginCode, redeemLoginCode } from "./handoff";
import { ltiPageHtml } from "./page";

// The routes run against the test database and a cookie jar.
const h = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  jar: new Map<string, { value: string; options: unknown }>(),
}));
vi.mock("@/db/client", () => ({ db: () => h.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => h.jar.get(name),
    set: (name: string, value: string, options: unknown) => h.jar.set(name, { value, options }),
  }),
}));

const SECRET = "s".repeat(40);
const now = () => Math.floor(Date.now() / 1000);
const BASE = "https://dalaa.example.com";

describe("LTI new-tab fallback", () => {
  let db: Db;
  let userId: string;
  let otherId: string;
  let landed: (r: Request) => Promise<Response>;
  let open: (r: Request) => Promise<Response>;

  beforeAll(async () => {
    db = h.db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const make = async (netId: string) =>
      (
        await db.query<{ id: string }>(
          "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
          [inst, netId],
        )
      )[0].id;
    userId = await make("pat");
    otherId = await make("kim");
    process.env.SESSION_SECRET = SECRET;
    process.env.APP_URL = BASE;
    ({ GET: landed } = await import("@/app/api/lti/landed/route"));
    ({ GET: open } = await import("@/app/api/lti/open/route"));
  });

  beforeEach(() => h.jar.clear());

  const expire = (code: string) =>
    db.query(
      "update lti_login_codes set created_at = now() - interval '3 minutes', expires_at = now() - interval '1 minute' where code = $1",
      [code],
    );
  const get = (route: string, code: string) => new Request(`${BASE}/api/lti/${route}?code=${encodeURIComponent(code)}`);
  const signIn = (id: string) => h.jar.set(SESSION_COOKIE, { value: signSession(id, SECRET, now()), options: {} });

  it("a code is used once", async () => {
    const code = await createLoginCode(db, userId, "/courses/c1");
    expect(code.length).toBeGreaterThanOrEqual(32);
    expect(await pendingLoginCode(db, code)).toEqual({ userId, path: "/courses/c1" });
    expect(await redeemLoginCode(db, code)).toEqual({ userId, path: "/courses/c1" });
    expect(await redeemLoginCode(db, code)).toBeNull();
    expect(await pendingLoginCode(db, code)).toBeNull();
  });

  it("an expired or unknown code does nothing", async () => {
    const code = await createLoginCode(db, userId, "/");
    await expire(code);
    expect(await redeemLoginCode(db, code)).toBeNull();
    expect(await redeemLoginCode(db, "nope")).toBeNull();
    expect(await redeemLoginCode(db, null)).toBeNull();
    expect(await land(db, code, userId)).toEqual({ kind: "expired" });
  });

  it("only stores a path on DALAA's own origin", async () => {
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", ""]) {
      await expect(createLoginCode(db, userId, bad)).rejects.toThrow();
    }
  });

  it("goes on when the cookie came back, spending the code", async () => {
    const code = await createLoginCode(db, userId, "/courses/c2");
    expect(await land(db, code, userId)).toEqual({ kind: "go", path: "/courses/c2" });
    expect(await pendingLoginCode(db, code)).toBeNull();
  });

  it("offers the new tab when the cookie was blocked or names someone else", async () => {
    const code = await createLoginCode(db, userId, "/");
    expect(await land(db, code, null)).toEqual({ kind: "new-tab", code });
    expect(await land(db, code, otherId)).toEqual({ kind: "new-tab", code });
    expect(await pendingLoginCode(db, code)).not.toBeNull();
  });

  it("landed redirects to the course when the session cookie arrived", async () => {
    const code = await createLoginCode(db, userId, "/courses/c3");
    signIn(userId);
    const res = await landed(get("landed", code));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${BASE}/courses/c3`);
  });

  it("landed shows the new-tab button, and the new tab signs in and lands on the same page", async () => {
    const code = await createLoginCode(db, userId, "/courses/c4");
    const page = await landed(get("landed", code));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/^text\/html/);
    const html = await page.text();
    expect(html).toContain("Open DALAA in a new tab");
    expect(html).toContain('target="_blank"');
    const href = /href="([^"]+)"/.exec(html)![1].replaceAll("&#38;", "&");
    expect(href).toBe(`${BASE}/api/lti/open?code=${encodeURIComponent(code)}`);

    const res = await open(new Request(href));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${BASE}/courses/c4`);
    expect(verifySession(h.jar.get(SESSION_COOKIE)?.value, SECRET, now())).toBe(userId);

    h.jar.clear();
    const again = await open(new Request(href));
    expect(again.status).toBe(410);
    expect(await again.text()).toContain("This link has expired");
    expect(h.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("an expired code opens nothing", async () => {
    const code = await createLoginCode(db, userId, "/");
    await expire(code);
    expect((await landed(get("landed", code))).status).toBe(410);
    expect((await open(get("open", code))).status).toBe(410);
    expect(h.jar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("ltiPageHtml", () => {
  it("escapes what it shows", () => {
    const html = ltiPageHtml({ title: "<b>", message: `"x" & 'y'`, action: { href: "/a?b=1&c=2", label: "Go" } });
    expect(html).toContain("&#60;b&#62;");
    expect(html).toContain("&#34;x&#34; &#38; &#39;y&#39;");
    expect(html).toContain('href="/a?b=1&#38;c=2"');
    expect(html).not.toContain("target=");
  });
});
