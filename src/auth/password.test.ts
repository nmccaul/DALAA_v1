import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "@/test/db";
import type { Db } from "@/db/types";
import { loadActor } from "./admit";
import { devPasswordMatches } from "./dev";
import {
  createAccount,
  isSchoolEmail,
  secretsMatch,
  setOwnPassword,
  signInWithPassword,
  type PasswordProvider,
} from "./password";

/** A fake Supabase: accounts in a map. */
function fakeProvider(accounts: Record<string, string> = {}) {
  const calls: string[] = [];
  const provider: PasswordProvider = {
    async verify(email, password) {
      calls.push(`verify ${email}`);
      return accounts[email] === password;
    },
    async create(email, password) {
      calls.push(`create ${email}`);
      if (email in accounts) return "exists";
      accounts[email] = password;
      return "created";
    },
    async setPassword(email, password) {
      calls.push(`set ${email}`);
      accounts[email] = password;
      return "set";
    },
  };
  return { provider, calls, accounts };
}

beforeEach(() => {
  vi.stubEnv("SCHOOL_EMAIL_DOMAINS", "byu.edu, Example.EDU");
  vi.stubEnv("TEST_TEACHER_EMAIL", "Teacher@DALAA.test");
  vi.stubEnv("TEST_TEACHER_PASSWORD", "correct horse");
});
afterEach(() => vi.unstubAllEnvs());

describe("school email domains", () => {
  it("admits exactly the listed domains, case-insensitively", () => {
    expect(isSchoolEmail("a@byu.edu")).toBe(true);
    expect(isSchoolEmail("a@example.edu")).toBe(true);
    for (const bad of ["a@mail.byu.edu", "a@notbyu.edu", "a@byu.edu.evil.com", "a@gmail.com"]) {
      expect(isSchoolEmail(bad), bad).toBe(false);
    }
  });

  it("admits nothing when unset", () => {
    vi.stubEnv("SCHOOL_EMAIL_DOMAINS", "");
    expect(isSchoolEmail("a@byu.edu")).toBe(false);
  });
});

describe("secretsMatch", () => {
  it("matches only the same secret", () => {
    expect(secretsMatch("abc", "abc")).toBe(true);
    expect(secretsMatch("abc", "abd")).toBe(false);
    expect(secretsMatch("abc", "abcd")).toBe(false);
    expect(secretsMatch("", "x")).toBe(false);
  });

  it("still guards the dev sign-in password", () => {
    vi.stubEnv("DEV_SIGN_IN_PASSWORD", "dev-pw");
    expect(devPasswordMatches("dev-pw")).toBe(true);
    expect(devPasswordMatches("nope")).toBe(false);
  });
});

describe("password sign-in", () => {
  let db: Db;
  let inst: string;

  beforeEach(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
  });

  async function enrolStudent(externalId: string, email: string | null) {
    const [prof] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'prof', 'Prof') returning id",
      [inst],
    );
    const [course] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, prof.id],
    );
    const [stu] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name, email) values ($1, $2, 'Student', $3) returning id",
      [inst, externalId, email],
    );
    await db.query("insert into course_members (course_id, user_id, role, status) values ($1, $2, 'student', 'active')", [
      course.id,
      stu.id,
    ]);
    return stu.id;
  }

  describe("shared test teacher", () => {
    it("signs in as staff with the right password, without asking Supabase", async () => {
      const { provider, calls } = fakeProvider();
      const result = await signInWithPassword(db, inst, { email: " teacher@dalaa.TEST ", password: "correct horse" }, provider);
      if (!result.ok) throw new Error(result.reason);
      expect(calls).toEqual([]);
      expect(await loadActor(db, result.userId)).toMatchObject({ isStaff: true, isAdmin: false, netId: "teacher@dalaa.test" });
    });

    it("refuses a wrong password", async () => {
      const { provider } = fakeProvider();
      for (const password of ["correct horse ", "wrong", ""]) {
        expect(await signInWithPassword(db, inst, { email: "teacher@dalaa.test", password }, provider)).toEqual({
          ok: false,
          reason: "password",
        });
      }
      expect(await db.query("select 1 from users where external_id = 'teacher@dalaa.test'")).toEqual([]);
    });

    it("stops being staff the moment it's unconfigured (D-023)", async () => {
      const result = await signInWithPassword(db, inst, { email: "teacher@dalaa.test", password: "correct horse" }, fakeProvider().provider);
      if (!result.ok) throw new Error(result.reason);
      vi.stubEnv("TEST_TEACHER_PASSWORD", "");
      expect(await loadActor(db, result.userId)).toMatchObject({ isStaff: false });
      // …and can't sign in: Supabase has no password for it.
      expect(await signInWithPassword(db, inst, { email: "teacher@dalaa.test", password: "" }, fakeProvider().provider)).toEqual({
        ok: false,
        reason: "password",
      });
    });

    it("can't be created as a student account", async () => {
      vi.stubEnv("SCHOOL_EMAIL_DOMAINS", "dalaa.test");
      expect(await createAccount(db, inst, { email: "teacher@dalaa.test", password: "12345678" }, fakeProvider().provider)).toEqual({
        ok: false,
        reason: "account-exists",
      });
    });
  });

  describe("shared test student (D-029)", () => {
    beforeEach(() => {
      vi.stubEnv("TEST_STUDENT_EMAIL", "Student@DALAA.test");
      vi.stubEnv("TEST_STUDENT_PASSWORD", "battery staple");
    });
    const form = { email: "student@dalaa.test", password: "battery staple" };

    it("links to the account a roster sync made for that email, without asking Supabase", async () => {
      const id = await enrolStudent("canvas.student", "student@dalaa.test");
      const { provider, calls } = fakeProvider();
      expect(await signInWithPassword(db, inst, { ...form, email: " STUDENT@dalaa.test" }, provider)).toEqual({ ok: true, userId: id });
      expect(calls).toEqual([]);
      expect(await loadActor(db, id)).toMatchObject({ isStaff: false, netId: "canvas.student" });
    });

    it("gets a new student account with no courses when nothing has synced it yet", async () => {
      const result = await signInWithPassword(db, inst, form, fakeProvider().provider);
      if (!result.ok) throw new Error(result.reason);
      expect(await loadActor(db, result.userId)).toMatchObject({ isStaff: false, netId: "student@dalaa.test", displayName: "Test Student" });
      expect(await db.query("select 1 from course_members where user_id = $1", [result.userId])).toEqual([]);
    });

    it("is never staff: refused when the email is on the allowlist or teaches an LTI course", async () => {
      await db.query("insert into staff_allowlist (institution_id, external_id) values ($1, 'student@dalaa.test')", [inst]);
      expect(await signInWithPassword(db, inst, form, fakeProvider().provider)).toEqual({ ok: false, reason: "password" });
      expect(await db.query("select 1 from users where external_id = 'student@dalaa.test'")).toEqual([]);

      await db.query("delete from staff_allowlist");
      const id = await enrolStudent("canvas.student", "student@dalaa.test");
      const [platform] = await db.query<{ id: string }>(
        `insert into lti_platforms (institution_id, issuer, client_id, auth_url, token_url, jwks_url)
         values ($1, 'https://canvas.test', 'c', 'https://a', 'https://t', 'https://j') returning id`,
        [inst],
      );
      const [course] = await db.query<{ id: string }>("select course_id as id from course_members where user_id = $1", [id]);
      await db.query("insert into lti_contexts (platform_id, context_id, course_id) values ($1, 'ctx', $2)", [platform.id, course.id]);
      await db.query("update course_members set role = 'instructor' where user_id = $1", [id]);
      expect(await signInWithPassword(db, inst, form, fakeProvider().provider)).toEqual({ ok: false, reason: "password" });
    });

    it("refuses a wrong password, even one Supabase holds for that email", async () => {
      const { provider } = fakeProvider({ "student@dalaa.test": "supabase pw" });
      for (const password of ["battery staple ", "wrong", "", "supabase pw"]) {
        expect(await signInWithPassword(db, inst, { ...form, password }, provider)).toEqual({ ok: false, reason: "password" });
      }
      expect(await db.query("select 1 from users")).toEqual([]);
    });

    it("can't be signed up for", async () => {
      vi.stubEnv("SCHOOL_EMAIL_DOMAINS", "dalaa.test");
      const { provider, calls } = fakeProvider();
      expect(await createAccount(db, inst, { email: "student@dalaa.test", password: "12345678" }, provider)).toEqual({
        ok: false,
        reason: "account-exists",
      });
      expect(calls).toEqual([]);
    });
  });

  describe("students", () => {
    it("creates an account for a school email: a student with no courses, not staff", async () => {
      const { provider, accounts } = fakeProvider();
      const result = await createAccount(db, inst, { email: "New.Kid@BYU.edu", password: "longenough" }, provider);
      if (!result.ok) throw new Error(result.reason);
      expect(accounts).toEqual({ "new.kid@byu.edu": "longenough" });
      const [user] = await db.query<{ external_id: string; email: string }>("select external_id, email from users where id = $1", [
        result.userId,
      ]);
      expect(user).toEqual({ external_id: "new.kid@byu.edu", email: "new.kid@byu.edu" });
      expect(await loadActor(db, result.userId)).toMatchObject({ isStaff: false });
      expect(await db.query("select 1 from course_members where user_id = $1", [result.userId])).toEqual([]);

      // And signs in again later to the same account.
      const again = await signInWithPassword(db, inst, { email: "new.kid@byu.edu", password: "longenough" }, provider);
      expect(again).toEqual({ ok: true, userId: result.userId });
    });

    it("refuses other domains, bad emails and short passwords before asking Supabase", async () => {
      const { provider, calls } = fakeProvider();
      const cases = [
        [{ email: "a@gmail.com", password: "longenough" }, "not-school-email"],
        [{ email: "a@mail.byu.edu", password: "longenough" }, "not-school-email"],
        [{ email: "not an email", password: "longenough" }, "bad-email"],
        [{ email: "jdoe42", password: "longenough" }, "bad-email"],
        [{ email: "a@byu.edu", password: "short" }, "weak-password"],
      ] as const;
      for (const [form, reason] of cases) {
        expect(await createAccount(db, inst, form, provider), form.email).toEqual({ ok: false, reason });
      }
      expect(calls).toEqual([]);
      expect(await db.query("select 1 from users")).toEqual([]);
    });

    it("refuses a second account and a wrong password, creating nobody", async () => {
      const { provider } = fakeProvider({ "a@byu.edu": "longenough" });
      expect(await createAccount(db, inst, { email: "a@byu.edu", password: "different1" }, provider)).toEqual({
        ok: false,
        reason: "account-exists",
      });
      expect(await signInWithPassword(db, inst, { email: "a@byu.edu", password: "wrong" }, provider)).toEqual({
        ok: false,
        reason: "password",
      });
      expect(await db.query("select 1 from users")).toEqual([]);
    });

    it("passes on Supabase's weak-password answer", async () => {
      const provider: PasswordProvider = {
        verify: async () => false,
        create: async () => "weak",
        setPassword: async () => "weak",
      };
      expect(await createAccount(db, inst, { email: "a@byu.edu", password: "password" }, provider)).toEqual({
        ok: false,
        reason: "weak-password",
      });
    });

    it("links to the rostered account with that email instead of making a second one (D-024)", async () => {
      const id = await enrolStudent("jdoe42", "JDoe42@byu.edu");
      const result = await createAccount(db, inst, { email: "jdoe42@byu.edu", password: "longenough" }, fakeProvider().provider);
      expect(result).toEqual({ ok: true, userId: id });
      expect(await db.query("select external_id from users where external_id <> 'prof'")).toEqual([{ external_id: "jdoe42" }]);
    });

    it("signs a rostered student in by login ID when it is their email", async () => {
      const id = await enrolStudent("stu@byu.edu", null);
      const { provider } = fakeProvider({ "stu@byu.edu": "longenough" });
      expect(await signInWithPassword(db, inst, { email: "STU@byu.edu", password: "longenough" }, provider)).toEqual({
        ok: true,
        userId: id,
      });
      const [user] = await db.query<{ email: string }>("select email from users where id = $1", [id]);
      expect(user.email).toBe("stu@byu.edu"); // the gap is filled
    });

    it("admits allowlisted staff who sign in with a school email", async () => {
      await db.query("insert into staff_allowlist (institution_id, external_id) values ($1, 'prof@byu.edu')", [inst]);
      const { provider } = fakeProvider({ "prof@byu.edu": "longenough" });
      const result = await signInWithPassword(db, inst, { email: "prof@byu.edu", password: "longenough" }, provider);
      if (!result.ok) throw new Error(result.reason);
      expect(await loadActor(db, result.userId)).toMatchObject({ isStaff: true });
    });
  });

  describe("sign in without Canvas (D-029)", () => {
    const pw = { password: "longenough", confirm: "longenough" };
    const actor = async (userId: string) => (await loadActor(db, userId))!;

    /** A teacher Canvas made by launching (LTI), on no allowlist, with a non-school email. */
    async function ltiTeacher() {
      const [platform] = await db.query<{ id: string }>(
        `insert into lti_platforms (institution_id, issuer, client_id, auth_url, token_url, jwks_url)
         values ($1, 'https://canvas.test', 'c', 'https://a', 'https://t', 'https://j') returning id`,
        [inst],
      );
      const [teacher] = await db.query<{ id: string }>(
        "insert into users (institution_id, external_id, display_name, email) values ($1, 'sampson@gitgrade.org', 'Dr. Sampson', 'sampson@gitgrade.org') returning id",
        [inst],
      );
      const [course] = await db.query<{ id: string }>(
        "insert into courses (institution_id, code, title, term, created_by) values ($1, 'L', 'L', 'W27', $2) returning id",
        [inst, teacher.id],
      );
      await db.query("insert into lti_contexts (platform_id, context_id, course_id) values ($1, 'ctx', $2)", [platform.id, course.id]);
      await db.query("insert into course_members (course_id, user_id, role, status) values ($1, $2, 'instructor', 'active')", [
        course.id,
        teacher.id,
      ]);
      return teacher.id;
    }

    it("lets an LTI teacher set a password and sign in as staff for their course", async () => {
      const id = await ltiTeacher();
      const { provider, accounts } = fakeProvider();
      expect(await setOwnPassword(db, await actor(id), pw, provider)).toEqual({ ok: true, email: "sampson@gitgrade.org" });
      expect(accounts).toEqual({ "sampson@gitgrade.org": "longenough" });

      const signedIn = await signInWithPassword(db, inst, { email: "Sampson@gitgrade.org", password: "longenough" }, provider);
      expect(signedIn).toEqual({ ok: true, userId: id });
      expect(await actor(id)).toMatchObject({ isStaff: true });

      // Staff is read fresh: once Canvas says they've left the course, it ends, password or not.
      await db.query("update course_members set status = 'flagged' where user_id = $1", [id]);
      expect(await actor(id)).toMatchObject({ isStaff: false });
    });

    it("lets a student set one, and it never makes them staff", async () => {
      const id = await enrolStudent("jdoe42", "JDoe42@byu.edu");
      const { provider } = fakeProvider();
      expect(await setOwnPassword(db, await actor(id), pw, provider)).toEqual({ ok: true, email: "jdoe42@byu.edu" });
      expect(await signInWithPassword(db, inst, { email: "jdoe42@byu.edu", password: "longenough" }, provider)).toEqual({
        ok: true,
        userId: id,
      });
      expect(await actor(id)).toMatchObject({ isStaff: false, netId: "jdoe42" });
    });

    it("signs in with any domain, but a non-school email still can't sign up", async () => {
      const { provider, calls } = fakeProvider({ "a@gmail.com": "longenough" });
      expect(await createAccount(db, inst, { email: "b@gmail.com", password: "longenough" }, provider)).toEqual({
        ok: false,
        reason: "not-school-email",
      });
      expect(calls).toEqual([]);
      // A password Supabase has for an email with no DALAA account yet: a student with no courses.
      const result = await signInWithPassword(db, inst, { email: "a@gmail.com", password: "longenough" }, provider);
      if (!result.ok) throw new Error(result.reason);
      expect(await actor(result.userId)).toMatchObject({ isStaff: false, netId: "a@gmail.com" });
    });

    it("refuses when the email would sign in to a different account", async () => {
      const { provider, calls } = fakeProvider();
      // Someone else's login ID is this email: signing in with it lands there, not here.
      // (Two accounts can't share an email: `users_institution_email_key`.)
      const mine = await enrolStudent("jdoe42", "jdoe42@byu.edu");
      await db.query("insert into users (institution_id, external_id, display_name) values ($1, 'jdoe42@byu.edu', 'Other')", [inst]);
      expect(await setOwnPassword(db, await actor(mine), pw, provider)).toEqual({ ok: false, reason: "email-elsewhere" });
      expect(calls).toEqual([]);
    });

    it("refuses the shared logins, accounts with no email, and bad passwords, before asking Supabase", async () => {
      vi.stubEnv("TEST_STUDENT_EMAIL", "student@dalaa.test");
      const { provider, calls } = fakeProvider();
      const make = async (externalId: string, email: string | null) =>
        (
          await db.query<{ id: string }>(
            "insert into users (institution_id, external_id, display_name, email) values ($1, $2, 'X', $3) returning id",
            [inst, externalId, email],
          )
        )[0].id;
      const cases = [
        [await make("teacher@dalaa.test", null), pw, "shared-login"],
        [await make("student@dalaa.test", null), pw, "shared-login"],
        [await make("noemail", null), pw, "no-email"],
        [await make("ok1", "ok1@byu.edu"), { password: "longenough", confirm: "longenougH" }, "mismatch"],
        [await make("ok2", "ok2@byu.edu"), { password: "short", confirm: "short" }, "weak-password"],
      ] as const;
      for (const [id, form, reason] of cases) {
        expect(await setOwnPassword(db, await actor(id), form, provider), reason).toEqual({ ok: false, reason });
      }
      expect(calls).toEqual([]);
    });
  });
});
