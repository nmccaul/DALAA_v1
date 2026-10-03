/**
 * The session cookie: `<userId>.<expiresAtSeconds>.<hmac>`, HMAC-SHA256 with
 * SESSION_SECRET. HttpOnly, Secure, SameSite=Lax (docs/CANVAS.md). It says only
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
