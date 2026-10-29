/**
 * Canvas OAuth 2 (T16a): a teacher clicks "Connect with Canvas" instead of
 * pasting a token. The HTTP to Canvas's /login/oauth2 endpoints lives here;
 * state and storage live in connection.ts.
 *
 * The developer key is CANVAS_OAUTH_CLIENT_ID / CANVAS_OAUTH_CLIENT_SECRET on
 * CANVAS_BASE_URL. Never log the code, the secret, tokens or response bodies.
 */

import { CanvasError } from "./client";

export type OAuthApp = { baseUrl: string; clientId: string; clientSecret: string };

export type OAuthTokens = {
  accessToken: string;
  /** Only the code exchange returns one; refreshing keeps the old one. */
  refreshToken: string | null;
  /** NULL when Canvas doesn't say: the token doesn't expire. */
  expiresAt: Date | null;
  /** The Canvas user, when the token response names one. */
  user: { id: number; name: string } | null;
};

export type OAuthDeps = { fetch?: typeof fetch; now?: () => number; timeoutMs?: number };

/** The Canvas developer key from the environment, or null if OAuth isn't set up. */
export function oauthApp(baseUrl: string): OAuthApp | null {
  const clientId = process.env.CANVAS_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.CANVAS_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), clientId, clientSecret };
}

/** DALAA's callback under the public origin; must match the developer key's redirect URIs. */
export function oauthRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/canvas/oauth/callback`;
}

/** Where to send the teacher's browser to approve DALAA in Canvas. */
export function authorizeUrl(app: OAuthApp, state: string, redirectUri: string): string {
  const url = new URL(`${app.baseUrl}/login/oauth2/auth`);
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

/** Trades the callback's code for tokens. */
export function exchangeCode(app: OAuthApp, code: string, redirectUri: string, deps: OAuthDeps = {}) {
  return tokenRequest(app, { grant_type: "authorization_code", code, redirect_uri: redirectUri }, deps);
}

/** A fresh access token from a refresh token. */
export function refreshAccessToken(app: OAuthApp, refreshToken: string, deps: OAuthDeps = {}) {
  return tokenRequest(app, { grant_type: "refresh_token", refresh_token: refreshToken }, deps);
}

/**
 * POST /login/oauth2/token. Throws CanvasError: "token-rejected" when Canvas
 * refuses the code or refresh token (400/401: the teacher must connect again),
 * "unavailable" or "bad-response" otherwise.
 */
async function tokenRequest(app: OAuthApp, grant: Record<string, string>, deps: OAuthDeps): Promise<OAuthTokens> {
  const now = deps.now ?? Date.now;
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(`${app.baseUrl}/login/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ ...grant, client_id: app.clientId, client_secret: app.clientSecret }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 20_000),
      cache: "no-store",
    });
  } catch {
    throw new CanvasError("unavailable");
  }
  if (res.status === 400 || res.status === 401) throw new CanvasError("token-rejected", res.status);
  if (!res.ok) throw new CanvasError(res.status >= 500 ? "unavailable" : "bad-response", res.status);

  const body = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    user?: { id?: unknown; name?: unknown };
  } | null;
  if (!body || typeof body.access_token !== "string" || !body.access_token) {
    throw new CanvasError("bad-response", res.status);
  }
  const expiresIn = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : null;
  const user = body.user;
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : null,
    expiresAt: expiresIn === null ? null : new Date(now() + expiresIn * 1000),
    user:
      user && typeof user.id === "number" && typeof user.name === "string" ? { id: user.id, name: user.name } : null,
  };
}
