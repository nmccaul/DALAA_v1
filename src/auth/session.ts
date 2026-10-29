/**
 * The session cookie: `<userId>.<expiresAtSeconds>.<hmac>`, HMAC-SHA256 with
 * SESSION_SECRET. HttpOnly; in production Secure + SameSite=None so it survives
 * inside the Canvas iframe (D-020), Lax locally over http. It says only
 * *who* signed in — staff/admin status is re-read from the database on every
 * request, so removing someone from the allowlist takes effect immediately.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "dalaa_session";
export const SESSION_SECONDS = 12 * 60 * 60;

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set (32+ characters)");
  }
  return secret;
}

/** Cross-site (iframe) cookies must be Secure, which local http can't be. */
export function sessionCookieOptions(production: boolean) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}

function mac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(userId: string, secret: string, nowSeconds: number): string {
  const payload = `${userId}.${nowSeconds + SESSION_SECONDS}`;
  return `${payload}.${mac(payload, secret)}`;
}

/** The user id, or null if the cookie is forged, malformed, or expired. */
export function verifySession(
  token: string | undefined,
  secret: string,
  nowSeconds: number,
): string | null {
  const parts = token?.split(".") ?? [];
  if (parts.length !== 3) return null;
  const [userId, expires, given] = parts;
  const expected = Buffer.from(mac(`${userId}.${expires}`, secret));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  if (!(Number(expires) > nowSeconds)) return null;
  return userId;
}
