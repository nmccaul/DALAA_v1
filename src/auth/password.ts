/**
 * Email + password sign-in outside Canvas (D-022). Supabase Auth only proves
 * the email and password belong together; `admit()` decides what they get.
 *
 * - Only `SCHOOL_EMAIL_DOMAINS` emails may create an account themselves. A
 *   signed-in user may set a password for the email already on their account,
 *   any domain; so sign-in takes any email the provider verifies (D-029).
 * - The shared test teacher (D-023) is checked here, not in Supabase, and is
 *   staff only while `TEST_TEACHER_EMAIL` / `TEST_TEACHER_PASSWORD` are set.
 *   The shared test student (D-029, `TEST_STUDENT_EMAIL` / `_PASSWORD`) is
 *   checked the same way and is never staff. Test-only: remove before the pilot.
 * - An email that matches an existing account signs in to that account (D-024).
 * - A password never makes anyone staff: that is still the allowlist or
 *   teaching an LTI course (D-020).
 */

import { timingSafeEqual } from "node:crypto";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { admit, normalizeNetId, type Admission } from "./admit";

/** What proves an email + password. Supabase in the app; a fake in tests. */
export type PasswordProvider = {
  verify(email: string, password: string): Promise<boolean>;
  create(email: string, password: string): Promise<"created" | "exists" | "weak">;
  /** This email signs in with this password from now on: made already confirmed, or its password replaced. */
  setPassword(email: string, password: string): Promise<"set" | "weak">;
};

export type PasswordRefusal = "bad-email" | "not-school-email" | "password" | "account-exists" | "weak-password";

export const MIN_PASSWORD = 8;

export type PasswordAdmission = Admission | { ok: false; reason: PasswordRefusal };

/** Same secret, compared in constant time. */
export function secretsMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A lowercased email, or null if it isn't one. */
export function normalizeEmail(raw: string): string | null {
  const id = normalizeNetId(raw);
  return id?.includes("@") ? id : null;
}

/** The domains that may sign up, from `SCHOOL_EMAIL_DOMAINS` (comma-separated). */
export function schoolDomains(): string[] {
  return (process.env.SCHOOL_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** Exactly one of the school domains: `byu.edu` admits `a@byu.edu`, not `a@mail.byu.edu` or `a@notbyu.edu`. */
export function isSchoolEmail(email: string): boolean {
  return schoolDomains().includes(email.slice(email.lastIndexOf("@") + 1));
}

/** The shared test teacher's login ID, or null when it isn't configured (D-023). */
export function testTeacherLoginId(): string | null {
  if (!process.env.TEST_TEACHER_PASSWORD) return null;
  return normalizeEmail(process.env.TEST_TEACHER_EMAIL ?? "");
}

/** The shared logins (D-023, D-029). Nobody sets a password for these; it lives in env. */
export function isSharedLogin(email: string): boolean {
  return [process.env.TEST_TEACHER_EMAIL, process.env.TEST_STUDENT_EMAIL].some(
    (shared) => normalizeEmail(shared ?? "") === email,
  );
}

function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function passwordSignInAvailable(): boolean {
  return Boolean(testTeacherLoginId() || supabaseConfigured());
}

/**
 * The email "Sign in without Canvas" would set a password for, or null when it
 * can't be offered: no Supabase to hold it, no email, or a shared login.
 */
export async function passwordSettingEmail(db: Db, userId: string): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const email = await accountEmail(db, userId);
  return email && !isSharedLogin(email) ? email : null;
}

export async function signInWithPassword(
  db: Db,
  institutionId: string,
  form: { email: string; password: string },
  provider: PasswordProvider,
): Promise<PasswordAdmission> {
  const email = normalizeEmail(form.email);
  if (!email) return { ok: false, reason: "bad-email" };

  if (email === testTeacherLoginId()) {
    if (!secretsMatch(form.password, process.env.TEST_TEACHER_PASSWORD ?? "")) {
      return { ok: false, reason: "password" };
    }
    return admit(db, institutionId, { netId: email, displayName: "Test Teacher", email });
  }

  // Any domain: only a school email can sign up, but anyone may have set a password (D-029).
  if (!(await provider.verify(email, form.password))) return { ok: false, reason: "password" };
  return admitByEmail(db, institutionId, email);
}

export async function createAccount(
  db: Db,
  institutionId: string,
  form: { email: string; password: string },
  provider: PasswordProvider,
): Promise<PasswordAdmission> {
  const email = normalizeEmail(form.email);
  if (!email) return { ok: false, reason: "bad-email" };
  if (email === testTeacherLoginId()) return { ok: false, reason: "account-exists" };
  if (!isSchoolEmail(email)) return { ok: false, reason: "not-school-email" };
  if (form.password.length < MIN_PASSWORD) return { ok: false, reason: "weak-password" };

  const created = await provider.create(email, form.password);
  if (created === "exists") return { ok: false, reason: "account-exists" };
  if (created === "weak") return { ok: false, reason: "weak-password" };
  return admitByEmail(db, institutionId, email);
}

export type SetPasswordRefusal = "no-email" | "shared-login" | "email-elsewhere" | "mismatch" | "weak-password";

/**
 * "Sign in without Canvas" (D-029): the signed-in person gives the email on
 * their own account a password. The session proves who they are, so the form
 * never takes an email. Refused when that email would sign in to some other
 * account, so a password never moves an email to a different DALAA user.
 */
export async function setOwnPassword(
  db: Db,
  actor: Actor,
  form: { password: string; confirm: string },
  provider: PasswordProvider,
): Promise<{ ok: true; email: string } | { ok: false; reason: SetPasswordRefusal }> {
  const email = await accountEmail(db, actor.userId);
  if (!email) return { ok: false, reason: "no-email" };
  if (isSharedLogin(email)) return { ok: false, reason: "shared-login" };
  if ((await loginIdForEmail(db, actor.institutionId, email)) !== actor.netId) {
    return { ok: false, reason: "email-elsewhere" };
  }
  if (form.password !== form.confirm) return { ok: false, reason: "mismatch" };
  if (form.password.length < MIN_PASSWORD) return { ok: false, reason: "weak-password" };
  if ((await provider.setPassword(email, form.password)) === "weak") return { ok: false, reason: "weak-password" };
  return { ok: true, email };
}

/** The email an account signs in with: its email, else its login ID when that is one. */
export async function accountEmail(db: Db, userId: string): Promise<string | null> {
  const [row] = await db.query<{ email: string | null; external_id: string }>(
    "select email, external_id from users where id = $1",
    [userId],
  );
  if (!row) return null;
  return normalizeEmail(row.email ?? "") ?? normalizeEmail(row.external_id);
}

/**
 * Whose login an email is: the account whose login ID is this email, else the
 * only one with this email (two: don't guess), else this email as a new login ID.
 */
async function loginIdForEmail(db: Db, institutionId: string, email: string): Promise<string> {
  const owners = await db.query<{ external_id: string }>(
    `select external_id from users
      where institution_id = $1 and (external_id = $2 or lower(email) = $2)
      order by (external_id = $2) desc
      limit 2`,
    [institutionId, email],
  );
  return owners[0]?.external_id === email || owners.length !== 1 ? email : owners[0].external_id;
}

/** A proven email → the account it belongs to, or a new student account with no courses yet (D-024). */
async function admitByEmail(db: Db, institutionId: string, email: string): Promise<Admission> {
  const loginId = await loginIdForEmail(db, institutionId, email);
  return admit(db, institutionId, { netId: loginId, email }, { newStudent: true });
}
