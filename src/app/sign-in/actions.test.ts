import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, signSession } from "@/auth/session";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { setPasswordAction } from "./actions";

// The action runs against the test database, a cookie jar and a fake Supabase.
const h = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  jar: new Map<string, { value: string }>(),
  set: [] as string[],
}));
vi.mock("@/db/client", () => ({ db: () => h.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => h.jar.get(name) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));
vi.mock("@/auth/supabase", () => ({
  supabasePasswords: {
    setPassword: async (email: string) => {
      h.set.push(email);
      return "set";
    },
  },
}));

const SECRET = "s".repeat(40);

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("setPasswordAction", () => {
  let userId: string;

  beforeAll(async () => {
    h.db = await testDb();
    const [{ id: inst }] = await h.db.query<{ id: string }>("select id from institutions");
    [{ id: userId }] = await h.db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name, email) values ($1, 'jdoe42', 'J', 'jdoe42@byu.edu') returning id",
      [inst],
    );
  });
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    h.jar.clear();
    h.set.length = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  const fields = { password: "longenough", confirm: "longenough", back: "/settings" };

  it("sends a signed-out request to sign in and sets nothing", async () => {
    await expect(setPasswordAction(form(fields))).rejects.toThrow("redirect /sign-in");
    h.jar.set(SESSION_COOKIE, { value: "forged" });
    await expect(setPasswordAction(form(fields))).rejects.toThrow("redirect /sign-in");
    expect(h.set).toEqual([]);
  });

  it("sets the password for the session's own email, whatever email the form names", async () => {
    h.jar.set(SESSION_COOKIE, { value: signSession(userId, SECRET, Math.floor(Date.now() / 1000)) });
    await expect(setPasswordAction(form({ ...fields, email: "victim@byu.edu" }))).rejects.toThrow(
      "redirect /settings?password=set#password",
    );
    expect(h.set).toEqual(["jdoe42@byu.edu"]);
  });

  it("only goes back to a page it knows", async () => {
    h.jar.set(SESSION_COOKIE, { value: signSession(userId, SECRET, Math.floor(Date.now() / 1000)) });
    await expect(setPasswordAction(form({ ...fields, confirm: "x", back: "https://evil.example" }))).rejects.toThrow(
      "redirect /?password=mismatch#password",
    );
  });
});
