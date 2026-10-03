/**
 * The dev stand-in sign-in (D-016): type a NetID, no BYU login. It stands in
 * for Okta until BYU registers us (#14) and goes through the same `admit` rules.
 *
 * Off unless DEV_SIGN_IN=1. In production builds (Vercel previews, a staging
 * URL) it also requires DEV_SIGN_IN_PASSWORD, so a stray deploy isn't open to
 * anyone who types a professor's NetID. Never enable it where real students are.
 */

import { timingSafeEqual } from "node:crypto";

export function devSignInEnabled(): boolean {
  if (process.env.DEV_SIGN_IN !== "1") return false;
  return process.env.NODE_ENV !== "production" || Boolean(process.env.DEV_SIGN_IN_PASSWORD);
}

export function devPasswordRequired(): boolean {
  return Boolean(process.env.DEV_SIGN_IN_PASSWORD);
}

export function devPasswordMatches(given: string): boolean {
  const expected = process.env.DEV_SIGN_IN_PASSWORD;
  if (!expected) return true;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
