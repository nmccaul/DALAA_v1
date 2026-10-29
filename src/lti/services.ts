/**
 * Tokens for Canvas's LTI services (NRPS now, AGS later), D-020. DALAA signs a
 * short-lived JWT assertion with its own key and trades it at the platform's
 * token URL for an access token (OAuth 2 client credentials, RFC 7523, as LTI
 * Security Framework 1.0 requires). Tokens are cached per platform and scope
 * set until a minute before they expire.
 *
 * Never log the assertion, the access token, or the response body.
 */

import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { CanvasError } from "@/canvas/client";
import { LTI_SIGNING_ALG, toolKey, type ToolKey } from "./keys";
import type { Platform } from "./registration";

export const NRPS_SCOPE = "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly";

const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const ASSERTION_SECONDS = 300;
const EARLY_MS = 60_000;

export type ServiceDeps = {
  fetch?: typeof fetch;
  key?: ToolKey;
  now?: () => number;
  timeoutMs?: number;
};

const cache = new Map<string, { token: string; expiresAt: number }>();

/** Drops cached tokens (tests, or after Canvas rejects one). */
export function forgetServiceTokens(): void {
  cache.clear();
}

/** The signed client assertion DALAA presents at the token URL. */
export async function clientAssertion(platform: Platform, key: ToolKey, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: LTI_SIGNING_ALG, kid: key.kid, typ: "JWT" })
    .setIssuer(platform.clientId)
    .setSubject(platform.clientId)
    .setAudience(platform.tokenUrl)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ASSERTION_SECONDS)
    .setJti(randomUUID())
    .sign(key.privateKey);
}

/**
 * An access token for these scopes. Throws CanvasError: "forbidden" when the
 * platform refuses (e.g. the developer key lacks the scope), "unavailable" or
 * "bad-response" otherwise.
 */
export async function serviceToken(platform: Platform, scopes: string[], deps: ServiceDeps = {}): Promise<string> {
  const now = deps.now ?? Date.now;
  const scope = [...new Set(scopes)].sort().join(" ");
  const cacheKey = `${platform.id} ${scope}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt - EARLY_MS > now()) return hit.token;

  const key = deps.key ?? (await toolKey());
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_assertion_type: ASSERTION_TYPE,
    client_assertion: await clientAssertion(platform, key, now()),
    scope,
  });
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(platform.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(deps.timeoutMs ?? 20_000),
      cache: "no-store",
    });
  } catch {
    throw new CanvasError("unavailable");
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new CanvasError("forbidden", res.status);
  if (!res.ok) throw new CanvasError(res.status >= 500 ? "unavailable" : "bad-response", res.status);

  const json = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  if (typeof json?.access_token !== "string" || !json.access_token) throw new CanvasError("bad-response", res.status);
  const seconds = typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 3600;
  cache.set(cacheKey, { token: json.access_token, expiresAt: now() + seconds * 1000 });
  return json.access_token;
}
