/**
 * Step two of an LTI 1.3 launch: Canvas posts `id_token` and `state` to
 * /api/lti/launch (D-020). This file only decides whether the launch is
 * genuine and returns its claims; signing the user in is src/lti/launch.
 *
 * Checks, in order: the state exists, hasn't expired and is consumed here
 * (one use, atomically, so a replay fails even when it races); the token is
 * RS256-signed by a key from the platform's JWKS; iss is the issuer the login
 * named; aud holds our client id (and azp names us when there are several
 * audiences); exp/iat are present and current; the nonce is the one stored
 * with that state; the deployment is one we know; the LTI version is 1.3.0;
 * the message is a Resource Link or Deep Linking request with its required
 * claims.
 *
 * Written from the IMS Security Framework 1.0 §5.1.3 and LTI Core 1.3 §5.3,
 * not copied. Never log the token or its claims.
 */

import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { Db } from "@/db/types";
import { isKnownDeployment, type Platform } from "./registration";

const LTI = "https://purl.imsglobal.org/spec/lti/claim/";
const DL = "https://purl.imsglobal.org/spec/lti-dl/claim/";
const AGS = "https://purl.imsglobal.org/spec/lti-ags/claim/";
const NRPS = "https://purl.imsglobal.org/spec/lti-nrps/claim/";

export const RESOURCE_LINK = "LtiResourceLinkRequest";
export const DEEP_LINKING = "LtiDeepLinkingRequest";

/** Clock skew allowed between Canvas and DALAA. */
const CLOCK_TOLERANCE_SECONDS = 60;

export type LaunchInput = { id_token?: string; state?: string };

export type LaunchClaims = {
  platform: Platform;
  deploymentId: string;
  messageType: typeof RESOURCE_LINK | typeof DEEP_LINKING;
  /** The platform's id for the user: stable per platform, not the login ID. */
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
  context?: { id: string; title?: string; label?: string };
  resourceLink?: { id: string; title?: string };
  /** Custom fields from the developer key (login_id, canvas_course_id, canvas_user_id). */
  custom: Record<string, string>;
  targetLinkUri: string;
  deepLinking?: { returnUrl: string; data?: string; acceptTypes: string[] };
  ags?: { scope: string[]; lineItems?: string; lineItem?: string };
  nrps?: { membershipsUrl: string };
};

export type LaunchResult = { ok: true; claims: LaunchClaims } | { ok: false; status: number; error: string };

/** Turns a platform's JWKS URL into a key lookup. Tests pass a local set. */
export type KeySource = (jwksUrl: string) => JWTVerifyGetKey;

const remoteSets = new Map<string, JWTVerifyGetKey>();

/** The platform's remote JWKS, cached per URL for the life of the process (jose refetches on unknown kid). */
export const remoteKeys: KeySource = (jwksUrl) => {
  let set = remoteSets.get(jwksUrl);
  if (!set) {
    set = createRemoteJWKSet(new URL(jwksUrl));
    remoteSets.set(jwksUrl, set);
  }
  return set;
};

/** The launch form from Canvas's POST. */
export async function readLaunchInput(request: Request): Promise<LaunchInput> {
  const form = await request.formData().catch(() => null);
  const get = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return { id_token: get("id_token"), state: get("state") };
}

const refuse = (status: number, error: string): LaunchResult => ({ ok: false, status, error });

type StateRow = {
  nonce: string;
  id: string;
  institution_id: string;
  issuer: string;
  client_id: string;
  auth_url: string;
  token_url: string;
  jwks_url: string;
};

export async function validateLaunch(
  db: Db,
  input: LaunchInput,
  keys: KeySource = remoteKeys,
  now: Date = new Date(),
): Promise<LaunchResult> {
  if (!input.id_token || !input.state) return refuse(400, "Missing id_token or state");

  // Consume the state first: whatever happens next, it can't be used again.
  const [row] = await db.query<StateRow>(
    `update lti_launch_states s set used_at = $2
     from lti_platforms p
     where s.state = $1 and s.used_at is null and s.expires_at > $2 and p.id = s.platform_id
     returning s.nonce, p.id, p.institution_id, p.issuer, p.client_id, p.auth_url, p.token_url, p.jwks_url`,
    [input.state, now],
  );
  if (!row) return refuse(401, "This launch has expired or was already used. Open DALAA from Canvas again.");
  const platform: Platform = {
    id: row.id,
    institutionId: row.institution_id,
    issuer: row.issuer,
    clientId: row.client_id,
    authUrl: row.auth_url,
    tokenUrl: row.token_url,
    jwksUrl: row.jwks_url,
  };

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(input.id_token, keys(platform.jwksUrl), {
      algorithms: ["RS256"],
      issuer: platform.issuer,
      audience: platform.clientId,
      requiredClaims: ["exp", "iat", "nonce", "sub"],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      currentDate: now,
    }));
  } catch (e) {
    return refuse(401, verifyError(e));
  }

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if ((aud.length > 1 || payload.azp !== undefined) && payload.azp !== platform.clientId) {
    return refuse(401, "The launch wasn't meant for DALAA");
  }
  if (payload.nonce !== row.nonce) return refuse(401, "The launch doesn't match its sign-in request");

  const c = payload as Record<string, unknown>;
  const deploymentId = str(c[`${LTI}deployment_id`]);
  if (!deploymentId || !(await isKnownDeployment(db, platform.id, deploymentId))) {
    return refuse(403, "This DALAA install isn't registered");
  }
  if (c[`${LTI}version`] !== "1.3.0") return refuse(400, "Only LTI 1.3 launches are supported");

  const messageType = c[`${LTI}message_type`];
  if (messageType !== RESOURCE_LINK && messageType !== DEEP_LINKING) {
    return refuse(400, "DALAA can't open this kind of launch");
  }
  const targetLinkUri = str(c[`${LTI}target_link_uri`]);
  if (!targetLinkUri) return refuse(400, "The launch is missing its target link");

  const link = obj(c[`${LTI}resource_link`]);
  const resourceLink = str(link?.id) ? { id: str(link?.id)!, title: str(link?.title) } : undefined;
  if (messageType === RESOURCE_LINK && !resourceLink) return refuse(400, "The launch is missing its resource link");

  const dl = obj(c[`${DL}deep_linking_settings`]);
  const returnUrl = str(dl?.deep_link_return_url);
  if (messageType === DEEP_LINKING && !returnUrl) return refuse(400, "The launch is missing its return address");

  const ctx = obj(c[`${LTI}context`]);
  const ags = obj(c[`${AGS}endpoint`]);
  const nrps = obj(c[`${NRPS}namesroleservice`]);
  const membershipsUrl = str(nrps?.context_memberships_url);

  return {
    ok: true,
    claims: {
      platform,
      deploymentId,
      messageType,
      sub: payload.sub!,
      email: str(c.email),
      name: str(c.name),
      roles: strings(c[`${LTI}roles`]),
      context: str(ctx?.id) ? { id: str(ctx?.id)!, title: str(ctx?.title), label: str(ctx?.label) } : undefined,
      resourceLink,
      custom: Object.fromEntries(
        Object.entries(obj(c[`${LTI}custom`]) ?? {}).flatMap(([k, v]) => (str(v) ? [[k, str(v)!]] : [])),
      ),
      targetLinkUri,
      deepLinking: returnUrl
        ? { returnUrl, data: str(dl?.data), acceptTypes: strings(dl?.accept_types) }
        : undefined,
      ags: ags
        ? { scope: strings(ags.scope), lineItems: str(ags.lineitems), lineItem: str(ags.lineitem) }
        : undefined,
      nrps: membershipsUrl ? { membershipsUrl } : undefined,
    },
  };
}

function verifyError(e: unknown): string {
  if (e instanceof errors.JWTExpired) return "This launch has expired. Open DALAA from Canvas again.";
  if (e instanceof errors.JWTClaimValidationFailed) {
    if (e.claim === "iss") return "The launch came from a Canvas DALAA doesn't know";
    if (e.claim === "aud") return "The launch wasn't meant for DALAA";
    return "The launch is missing required information";
  }
  return "The launch couldn't be verified";
}

function str(v: unknown): string | undefined {
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
