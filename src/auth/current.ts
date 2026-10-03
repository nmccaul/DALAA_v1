/**
 * The only way pages and actions learn who is acting. Resolves the session
 * cookie to an Actor (staff status read fresh), or sends them to sign in.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import type { Actor } from "@/db/scope";
import { loadActor } from "./admit";
import { SESSION_COOKIE, SESSION_SECONDS, sessionSecret, signSession, verifySession } from "./session";

const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function currentActor(): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = verifySession(token, sessionSecret(), nowSeconds());
  return userId ? loadActor(db(), userId) : null;
}

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/sign-in");
  return actor;
}

export async function startSession(userId: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, signSession(userId, sessionSecret(), nowSeconds()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** v1 serves one institution (D-018); which one is configuration, not code. */
export async function institutionId(): Promise<string> {
  const slug = process.env.INSTITUTION_SLUG ?? "byu";
  const [row] = await db().query<{ id: string }>("select id from institutions where slug = $1", [slug]);
  if (!row) throw new Error(`No institution with slug "${slug}" — run migrations`);
  return row.id;
}
