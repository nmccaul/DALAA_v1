/**
 * A teacher's Canvas connection: real (their own token, D-004) or practice
 * (D-019). This is the only place that builds a Canvas client for a teacher,
 * so pages never touch tokens and practice vs real is decided once.
 *
 * Each teacher uses their own token: no lending, no shared token, no fallback.
 */

import { randomBytes } from "node:crypto";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { CanvasError, canvasClient, type CanvasClient } from "./client";
import { exchangeCode, oauthApp, refreshAccessToken, type OAuthTokens } from "./oauth";
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
           canvas_user_id = $4, canvas_user_name = $5, added_at = now(), verified_at = now(),
           refresh_ciphertext = null, token_expires_at = null`,
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
           canvas_user_id = $2, canvas_user_name = $3, added_at = now(), verified_at = now(),
           refresh_ciphertext = null, token_expires_at = null`,
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

/** Only same-site paths, so ?next= can't send a teacher off-site. */
export function connectReturnPath(value: unknown): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/settings";
}

/** How long a teacher may take to approve DALAA in Canvas. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/** A fresh one-use OAuth state for this teacher, returning to `next` afterwards. */
export async function beginOAuth(db: Db, actor: Actor, next: string): Promise<string> {
  if (!actor.isStaff) throw new Error("Only instructors connect Canvas");
  const state = randomBytes(32).toString("base64url");
  await db.query("delete from canvas_oauth_states where expires_at < now() - interval '1 day'");
  await db.query(
    `insert into canvas_oauth_states (state, user_id, next_path, expires_at)
     values ($1, $2, $3, now() + make_interval(secs => $4))`,
    [state, actor.userId, connectReturnPath(next), OAUTH_STATE_TTL_SECONDS],
  );
  return state;
}

export type OAuthCallback = { code: string | null; state: string | null; error: string | null };

export type OAuthResult =
  | { ok: true; next: string; canvasUserName: string }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "denied" | "rejected" | "unavailable"; next: string };

/**
 * Finishes the OAuth callback: spends the state (only for the teacher who
 * started it), trades the code, and stores the tokens sealed. `exchange` and
 * `makeClient` are for tests.
 */
export async function finishOAuth(
  db: Db,
  actor: Actor,
  callback: OAuthCallback,
  exchange: (code: string) => Promise<OAuthTokens>,
  makeClient: (token: string) => CanvasClient = (token) => canvasClient({ baseUrl: canvasBaseUrl(), token }),
): Promise<OAuthResult> {
  if (!callback.state) return { ok: false, reason: "expired" };
  const [spent] = await db.query<{ next_path: string }>(
    `update canvas_oauth_states set used_at = now()
     where state = $1 and user_id = $2 and used_at is null and expires_at > now()
     returning next_path`,
    [callback.state, actor.userId],
  );
  if (!spent) return { ok: false, reason: "expired" };
  const next = spent.next_path;
  if (callback.error || !callback.code) return { ok: false, reason: "denied", next };

  let tokens: OAuthTokens;
  let user: { id: number; name: string };
  try {
    tokens = await exchange(callback.code);
    user = tokens.user ?? (await makeClient(tokens.accessToken).self());
  } catch (e) {
    const rejected = e instanceof CanvasError && (e.kind === "token-rejected" || e.kind === "forbidden");
    return { ok: false, reason: rejected ? "rejected" : "unavailable", next };
  }
  // Without a refresh token an expiring access token would strand the teacher in an hour.
  if (tokens.expiresAt && !tokens.refreshToken) return { ok: false, reason: "rejected", next };

  await db.query(
    `insert into canvas_connections
       (user_id, mode, token_ciphertext, token_last4, canvas_user_id, canvas_user_name,
        refresh_ciphertext, token_expires_at)
     values ($1, 'canvas', $2, $3, $4, $5, $6, $7)
     on conflict (user_id) do update
       set mode = 'canvas', token_ciphertext = $2, token_last4 = $3,
           canvas_user_id = $4, canvas_user_name = $5, added_at = now(), verified_at = now(),
           refresh_ciphertext = $6, token_expires_at = $7`,
    [
      actor.userId,
      sealToken(tokens.accessToken),
      tokens.accessToken.slice(-4),
      user.id,
      user.name,
      tokens.refreshToken && tokens.expiresAt ? sealToken(tokens.refreshToken) : null,
      tokens.refreshToken ? tokens.expiresAt : null,
    ],
  );
  return { ok: true, next, canvasUserName: user.name };
}

/** The real code exchange, for the callback route. */
export function canvasCodeExchange(redirectUri: string): ((code: string) => Promise<OAuthTokens>) | null {
  const app = oauthApp(canvasBaseUrl());
  return app ? (code) => exchangeCode(app, code, redirectUri) : null;
}

/** Refresh an OAuth access token this long before Canvas says it expires. */
const REFRESH_EARLY_MS = 5 * 60_000;

export type ClientDeps = {
  /** Trades a refresh token; null when OAuth isn't configured. */
  refresh?: ((refreshToken: string) => Promise<OAuthTokens>) | null;
  now?: () => number;
};

function envRefresh(): ((refreshToken: string) => Promise<OAuthTokens>) | null {
  const app = oauthApp(canvasBaseUrl());
  return app ? (refreshToken) => refreshAccessToken(app, refreshToken) : null;
}

export type TeacherCanvas = { client: CanvasClient; mode: "canvas" | "practice" };

/**
 * A Canvas client acting as this teacher, or null if they haven't connected.
 * Throws VaultError if their stored token can't be read (show "reconnect").
 *
 * An OAuth token near expiry is refreshed first. If Canvas refuses or can't
 * be reached, the stored token is used as it is: a dead one comes back from
 * Canvas as "token-rejected", which every caller already shows as "reconnect".
 */
export async function clientFor(db: Db, actor: Actor, deps: ClientDeps = {}): Promise<TeacherCanvas | null> {
  const [row] = await db.query<{
    mode: "canvas" | "practice";
    token_ciphertext: string | null;
    refresh_ciphertext: string | null;
    token_expires_at: Date | null;
  }>(
    "select mode, token_ciphertext, refresh_ciphertext, token_expires_at from canvas_connections where user_id = $1",
    [actor.userId],
  );
  if (!row) return null;
  if (row.mode === "practice") return { client: practiceClient(), mode: "practice" };

  let token = openToken(row.token_ciphertext!);
  const now = (deps.now ?? Date.now)();
  const refresh = deps.refresh === undefined ? envRefresh() : deps.refresh;
  if (row.refresh_ciphertext && row.token_expires_at && refresh) {
    if (new Date(row.token_expires_at).getTime() - REFRESH_EARLY_MS <= now) {
      try {
        const fresh = await refresh(openToken(row.refresh_ciphertext));
        token = fresh.accessToken;
        await db.query(
          `update canvas_connections
              set token_ciphertext = $2, token_last4 = $3, token_expires_at = coalesce($4, token_expires_at),
                  verified_at = now()
            where user_id = $1`,
          [actor.userId, sealToken(token), token.slice(-4), fresh.expiresAt],
        );
      } catch (e) {
        if (!(e instanceof CanvasError)) throw e;
      }
    }
  }
  return { client: canvasClient({ baseUrl: canvasBaseUrl(), token }), mode: "canvas" };
}
