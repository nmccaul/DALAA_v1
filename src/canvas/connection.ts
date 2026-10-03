/**
 * A teacher's Canvas connection: real (their own token, D-004) or practice
 * (D-019). This is the only place that builds a Canvas client for a teacher,
 * so pages never touch tokens and practice vs real is decided once.
 *
 * Each teacher uses their own token: no lending, no shared token, no fallback.
 */

import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { CanvasError, canvasClient, type CanvasClient } from "./client";
import { PRACTICE_TOKEN, practiceCanvas } from "./practice/server";
import { openToken, sealToken } from "./vault";

export type ConnectionSummary = {
  mode: "canvas" | "practice";
  canvasUserName: string;
  /** Last 4 characters only; the token itself is never shown again. */
  tokenLast4: string | null;
  addedAt: Date;
  verifiedAt: Date;
};

/** Where real Canvas is. One institution in v1 (D-018). */
export function canvasBaseUrl(): string {
  return process.env.CANVAS_BASE_URL || "https://byu.instructure.com";
}

/**
 * Practice Canvas runs in-process: the real client code (URLs, headers,
 * paging) talks to practice Canvas without a network hop, so it also works on
 * password-protected preview deployments.
 */
const PRACTICE_BASE = "https://practice-canvas.local/practice-canvas";
export function practiceClient(): CanvasClient {
  return canvasClient({
    baseUrl: PRACTICE_BASE,
    token: PRACTICE_TOKEN,
    fetch: async (input, init) => practiceCanvas(new Request(input, init)),
  });
}

export type ConnectResult =
  | { ok: true; canvasUserName: string }
  | { ok: false; reason: "empty" | "rejected" | "unavailable" };

/**
 * Checks a pasted token against Canvas (GET /users/self) and stores it only if
 * Canvas accepts it. `makeClient` is for tests; the app uses real Canvas.
 */
export async function connectWithToken(
  db: Db,
  actor: Actor,
  pasted: string,
  makeClient: (token: string) => CanvasClient = (token) => canvasClient({ baseUrl: canvasBaseUrl(), token }),
): Promise<ConnectResult> {
  if (!actor.isStaff) throw new Error("Only instructors connect Canvas");
  const token = pasted.trim();
  if (!token) return { ok: false, reason: "empty" };

  let me;
  try {
    me = await makeClient(token).self();
  } catch (e) {
    if (e instanceof CanvasError && (e.kind === "token-rejected" || e.kind === "forbidden")) {
      return { ok: false, reason: "rejected" };
    }
    return { ok: false, reason: "unavailable" };
  }

  await db.query(
    `insert into canvas_connections
       (user_id, mode, token_ciphertext, token_last4, canvas_user_id, canvas_user_name)
     values ($1, 'canvas', $2, $3, $4, $5)
     on conflict (user_id) do update
       set mode = 'canvas', token_ciphertext = $2, token_last4 = $3,
           canvas_user_id = $4, canvas_user_name = $5, added_at = now(), verified_at = now()`,
    [actor.userId, sealToken(token), token.slice(-4), me.id, me.name],
  );
  return { ok: true, canvasUserName: me.name };
}

export async function connectPractice(db: Db, actor: Actor): Promise<void> {
  if (!actor.isStaff) throw new Error("Only instructors connect Canvas");
  const me = await practiceClient().self();
  await db.query(
    `insert into canvas_connections (user_id, mode, canvas_user_id, canvas_user_name)
     values ($1, 'practice', $2, $3)
     on conflict (user_id) do update
       set mode = 'practice', token_ciphertext = null, token_last4 = null,
           canvas_user_id = $2, canvas_user_name = $3, added_at = now(), verified_at = now()`,
    [actor.userId, me.id, me.name],
  );
}

export async function getConnection(db: Db, actor: Actor): Promise<ConnectionSummary | null> {
  const [row] = await db.query<ConnectionSummary>(
    `select mode, canvas_user_name as "canvasUserName", token_last4 as "tokenLast4",
            added_at as "addedAt", verified_at as "verifiedAt"
       from canvas_connections where user_id = $1`,
    [actor.userId],
  );
  return row ?? null;
}

export async function disconnect(db: Db, actor: Actor): Promise<void> {
  await db.query("delete from canvas_connections where user_id = $1", [actor.userId]);
}

export type TeacherCanvas = { client: CanvasClient; mode: "canvas" | "practice" };

/**
 * A Canvas client acting as this teacher, or null if they haven't connected.
 * Throws VaultError if their stored token can't be read (show "reconnect").
 */
export async function clientFor(db: Db, actor: Actor): Promise<TeacherCanvas | null> {
  const [row] = await db.query<{ mode: "canvas" | "practice"; token_ciphertext: string | null }>(
    "select mode, token_ciphertext from canvas_connections where user_id = $1",
    [actor.userId],
  );
  if (!row) return null;
  if (row.mode === "practice") return { client: practiceClient(), mode: "practice" };
  return {
    client: canvasClient({ baseUrl: canvasBaseUrl(), token: openToken(row.token_ciphertext!) }),
    mode: "canvas",
  };
}
