/**
 * Step one of an LTI 1.3 launch: OIDC login initiation (D-020). Canvas sends
 * iss, login_hint, target_link_uri and usually client_id and lti_message_hint;
 * DALAA checks the issuer and client against the registration, stores a fresh
 * state and nonce in Postgres (not a cookie: the Canvas iframe drops it), and
 * sends the browser to the platform's authorize endpoint. The launch
 * (src/lti/launch) consumes the state once and checks the nonce.
 *
 * Written from the IMS Security Framework 1.0 §5.1.1, not copied.
 */

import { randomBytes } from "node:crypto";
import type { Db } from "@/db/types";
import { ensurePlatform, type Registration } from "./registration";

/** How long a login may take to come back as a launch. */
export const LAUNCH_STATE_TTL_SECONDS = 10 * 60;

export type LoginParams = {
  iss?: string;
  login_hint?: string;
  target_link_uri?: string;
  client_id?: string;
  lti_message_hint?: string;
  lti_deployment_id?: string;
};

export type LoginResult = { ok: true; redirect: string } | { ok: false; status: number; error: string };

/** The login parameters from a GET query or a POST form. */
export async function readLoginParams(request: Request): Promise<LoginParams> {
  const source =
    request.method === "POST" ? await request.formData() : new URL(request.url).searchParams;
  const get = (k: string) => {
    const v = source.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return {
    iss: get("iss"),
    login_hint: get("login_hint"),
    target_link_uri: get("target_link_uri"),
    client_id: get("client_id"),
    lti_message_hint: get("lti_message_hint"),
    lti_deployment_id: get("lti_deployment_id"),
  };
}

const token = () => randomBytes(32).toString("base64url");

/**
 * Where to send the browser for this login, or why not. `launchUrl` is
 * DALAA's own redirect URI; it is never taken from the request.
 */
export async function beginLogin(
  db: Db,
  institutionId: string,
  reg: Registration | null,
  params: LoginParams,
  launchUrl: string,
): Promise<LoginResult> {
  if (!reg) return { ok: false, status: 503, error: "LTI is not configured" };
  if (!params.iss || !params.login_hint || !params.target_link_uri) {
    return { ok: false, status: 400, error: "Missing iss, login_hint or target_link_uri" };
  }
  // client_id is optional in the spec when the issuer has one registration.
  const clientId = params.client_id ?? reg.clientId;
  const platform = await ensurePlatform(db, institutionId, reg, params.iss, clientId);
  if (!platform) return { ok: false, status: 403, error: "This Canvas isn't registered with DALAA" };

  const state = token();
  const nonce = token();
  await db.query("delete from lti_launch_states where expires_at < now() - interval '1 day'");
  await db.query(
    `insert into lti_launch_states (state, nonce, platform_id, expires_at)
     values ($1, $2, $3, now() + make_interval(secs => $4))`,
    [state, nonce, platform.id, LAUNCH_STATE_TTL_SECONDS],
  );

  const url = new URL(platform.authUrl);
  const q = url.searchParams;
  q.set("scope", "openid");
  q.set("response_type", "id_token");
  q.set("response_mode", "form_post");
  q.set("prompt", "none");
  q.set("client_id", platform.clientId);
  q.set("redirect_uri", launchUrl);
  q.set("login_hint", params.login_hint);
  q.set("state", state);
  q.set("nonce", nonce);
  if (params.lti_message_hint) q.set("lti_message_hint", params.lti_message_hint);
  return { ok: true, redirect: url.toString() };
}
