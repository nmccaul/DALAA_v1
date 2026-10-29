/**
 * The new-tab fallback for LTI launches (D-020). A browser that blocks
 * third-party cookies drops DALAA's session cookie inside the Canvas iframe,
 * so every launch also makes a one-time login code and goes through
 * /api/lti/landed: if the cookie arrived, the code is spent and the user goes
 * on; if not, they get an "Open DALAA in a new tab" button carrying the code,
 * and /api/lti/open starts the session in that first-party tab.
 *
 * A code lives LOGIN_CODE_TTL_SECONDS and is used once (lti_login_codes).
 */

import { randomBytes } from "node:crypto";
import type { Db } from "@/db/types";

export const LOGIN_CODE_TTL_SECONDS = 2 * 60;

export type LoginCode = { userId: string; path: string };

/** A fresh code that signs `userId` in and lands on `path` (a DALAA path). */
export async function createLoginCode(db: Db, userId: string, path: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await db.query("delete from lti_login_codes where expires_at < now() - interval '1 day'");
  await db.query(
    `insert into lti_login_codes (code, user_id, path, expires_at)
     values ($1, $2, $3, now() + make_interval(secs => $4))`,
    [code, userId, path, LOGIN_CODE_TTL_SECONDS],
  );
  return code;
}

/** The unused, unexpired code's user and path, without spending it. */
export async function pendingLoginCode(db: Db, code: string | null): Promise<LoginCode | null> {
  if (!code) return null;
  const [row] = await db.query<{ user_id: string; path: string }>(
    "select user_id, path from lti_login_codes where code = $1 and used_at is null and expires_at > now()",
    [code],
  );
  return row ? { userId: row.user_id, path: row.path } : null;
}

/** Spends the code: one update, so two tabs racing can't both use it. */
export async function redeemLoginCode(db: Db, code: string | null): Promise<LoginCode | null> {
  if (!code) return null;
  const [row] = await db.query<{ user_id: string; path: string }>(
    `update lti_login_codes set used_at = now()
     where code = $1 and used_at is null and expires_at > now()
     returning user_id, path`,
    [code],
  );
  return row ? { userId: row.user_id, path: row.path } : null;
}

export type Landing =
  | { kind: "go"; path: string }
  | { kind: "new-tab"; code: string }
  | { kind: "expired" };

/**
 * After a launch: go on if the session cookie came back for the code's user
 * (spending the code), otherwise offer the new tab.
 */
export async function land(db: Db, code: string | null, sessionUserId: string | null): Promise<Landing> {
  const pending = await pendingLoginCode(db, code);
  if (!pending || !code) return { kind: "expired" };
  if (sessionUserId !== pending.userId) return { kind: "new-tab", code };
  const spent = await redeemLoginCode(db, code);
  return spent ? { kind: "go", path: spent.path } : { kind: "expired" };
}
