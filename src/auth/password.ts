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
import type { Db } from "@/db/types";
import { admit, normalizeNetId, type Admission } from "./admit";

/** What proves an email + password. Supabase in the app; a fake in tests. */
export type PasswordProvider = {
  verify(email: string, password: string): Promise<boolean>;
  create(email: string, password: string): Promise<"created" | "exists" | "weak">;
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

export function passwordSignInAvailable(): boolean {
  return Boolean(testTeacherLoginId() || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY));
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

  if (!isSchoolEmail(email)) return { ok: false, reason: "not-school-email" };
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

/**
 * A proven school email → the account it belongs to: the one whose login ID is
 * this email, else the only one with this email (two: don't guess), else a new
 * student account with no courses yet (D-024).
 */
async function admitByEmail(db: Db, institutionId: string, email: string): Promise<Admission> {
  const owners = await db.query<{ external_id: string }>(
    `select external_id from users
      where institution_id = $1 and (external_id = $2 or lower(email) = $2)
      order by (external_id = $2) desc
      limit 2`,
    [institutionId, email],
  );
  const loginId =
    owners[0]?.external_id === email || owners.length !== 1 ? email : owners[0].external_id;
  return admit(db, institutionId, { netId: loginId, email }, { newStudent: true });
}
