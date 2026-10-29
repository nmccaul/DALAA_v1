/**
 * Adding a DALAA assignment to Canvas: LTI Deep Linking 2.0 (D-020). Canvas
 * sends an LtiDeepLinkingRequest from its assignment_selection placement; the
 * launch keeps it as a row in `lti_deep_link_requests` and the teacher picks
 * one of the course's published assignments; DALAA answers with a signed
 * LtiDeepLinkingResponse holding one `ltiResourceLink` (custom `activity_id`,
 * a line item worth the assignment's points), auto-posted to Canvas's
 * `deep_link_return_url`.
 *
 * Written from the LTI Deep Linking 2.0 spec §4.2–4.4, not copied. A request
 * is used once, only by the teacher who launched it, and its return URL must
 * be on the platform's own host. Never log the response JWT.
 */

import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { getTaughtActivity } from "@/activities/store";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { LTI_SIGNING_ALG, type ToolKey } from "./keys";
import { pickerRequest } from "./picker";
import type { Platform } from "./registration";
import type { LaunchClaims } from "./validate";

const LTI = "https://purl.imsglobal.org/spec/lti/claim/";
const DL = "https://purl.imsglobal.org/spec/lti-dl/claim/";

export const DEEP_LINKING_RESPONSE = "LtiDeepLinkingResponse";

/** Long enough to set up a new assignment before adding it. */
export const DEEP_LINK_TTL_SECONDS = 60 * 60;

/** The response JWT's life: Canvas reads it as soon as the form posts. */
const RESPONSE_SECONDS = 5 * 60;

/** The custom field naming the assignment a Canvas link opens (src/lti/launch.ts). */
export const ACTIVITY_ID_FIELD = "activity_id";

/** Canvas sends teachers back to its own host; any other return URL is refused. */
export function returnUrlAllowed(platform: Platform, returnUrl: string): boolean {
  try {
    const url = new URL(returnUrl);
    return url.protocol === "https:" && url.origin === new URL(platform.authUrl).origin;
  } catch {
    return false;
  }
}

/** Keeps a verified deep-linking request for the teacher's pick; returns its id. */
export async function startDeepLink(
  db: Db,
  claims: LaunchClaims,
  userId: string,
  courseId: string,
): Promise<string> {
  const dl = claims.deepLinking;
  if (!dl || !returnUrlAllowed(claims.platform, dl.returnUrl)) throw new Error("Deep-linking return URL not allowed");
  await db.query("delete from lti_deep_link_requests where expires_at < now() - interval '1 day'");
  const [row] = await db.query<{ id: string }>(
    `insert into lti_deep_link_requests (platform_id, deployment_id, course_id, user_id, return_url, data, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7))
     returning id`,
    [claims.platform.id, claims.deploymentId, courseId, userId, dl.returnUrl, dl.data ?? null, DEEP_LINK_TTL_SECONDS],
  );
  return row.id;
}

/** An open request for this teacher, or null (spent, expired, someone else's, made up). */
export async function pendingDeepLink(db: Db, actor: Actor, requestId: string): Promise<{ id: string; courseId: string } | null> {
  if (!pickerRequest(requestId)) return null;
  const [row] = await db.query<{ id: string; course_id: string }>(
    `select id, course_id from lti_deep_link_requests
      where id = $1 and user_id = $2 and used_at is null and expires_at > now()`,
    [requestId, actor.userId],
  );
  return row ? { id: row.id, courseId: row.course_id } : null;
}

export type ContentItem = {
  type: "ltiResourceLink";
  title: string;
  url: string;
  custom: Record<string, string>;
  lineItem: { scoreMaximum: number; label: string; resourceId: string };
};

/** The Canvas link for one assignment: opens it through the launch URL and makes a gradebook column worth its points. */
export function resourceLinkItem(activity: { id: string; title: string; points: number }, launchUrl: string): ContentItem {
  return {
    type: "ltiResourceLink",
    title: activity.title,
    url: launchUrl,
    custom: { [ACTIVITY_ID_FIELD]: activity.id },
    lineItem: { scoreMaximum: activity.points, label: activity.title, resourceId: activity.id },
  };
}

export type ResponseFor = {
  issuer: string;
  clientId: string;
  deploymentId: string;
  data: string | null;
  items: ContentItem[];
};

/** The signed LtiDeepLinkingResponse: from DALAA (iss = our client id) to the platform (aud = its issuer). */
export async function signDeepLinkResponse(key: ToolKey, r: ResponseFor, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  return new SignJWT({
    nonce: randomUUID(),
    [`${LTI}message_type`]: DEEP_LINKING_RESPONSE,
    [`${LTI}version`]: "1.3.0",
    [`${LTI}deployment_id`]: r.deploymentId,
    [`${DL}content_items`]: r.items,
    ...(r.data !== null && { [`${DL}data`]: r.data }),
  })
    .setProtectedHeader({ alg: LTI_SIGNING_ALG, kid: key.kid, typ: "JWT" })
    .setIssuer(r.clientId)
    .setAudience(r.issuer)
    .setIssuedAt(iat)
    .setExpirationTime(iat + RESPONSE_SECONDS)
    .sign(key.privateKey);
}

export type Answer = { ok: true; returnUrl: string; jwt: string } | { ok: false; reason: string };

/**
 * The teacher's pick: spends the request (once, even when two clicks race) and
 * signs the answer. Only a published assignment of the request's course can be
 * added; nothing is spent when it can't.
 */
export async function answerDeepLink(
  db: Db,
  actor: Actor,
  requestId: string,
  activityId: string,
  deps: { key: ToolKey; launchUrl: string; nowMs?: number },
): Promise<Answer> {
  const pending = await pendingDeepLink(db, actor, requestId);
  if (!pending) return { ok: false, reason: "This has expired. Choose DALAA again in Canvas." };
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity || activity.courseId !== pending.courseId) return { ok: false, reason: "That assignment isn't in this course." };
  if (activity.status !== "published" || activity.points === null) {
    return { ok: false, reason: "Publish the assignment first, then add it to Canvas." };
  }

  const [row] = await db.query<{ return_url: string; data: string | null; deployment_id: string; issuer: string; client_id: string }>(
    `update lti_deep_link_requests r set used_at = now()
       from lti_platforms p
      where r.id = $1 and r.user_id = $2 and r.used_at is null and r.expires_at > now() and p.id = r.platform_id
      returning r.return_url, r.data, r.deployment_id, p.issuer, p.client_id`,
    [pending.id, actor.userId],
  );
  if (!row) return { ok: false, reason: "This has expired. Choose DALAA again in Canvas." };

  const jwt = await signDeepLinkResponse(
    deps.key,
    {
      issuer: row.issuer,
      clientId: row.client_id,
      deploymentId: row.deployment_id,
      data: row.data,
      items: [resourceLinkItem({ id: activity.id, title: activity.title, points: activity.points }, deps.launchUrl)],
    },
    deps.nowMs ?? Date.now(),
  );
  return { ok: true, returnUrl: row.return_url, jwt };
}
