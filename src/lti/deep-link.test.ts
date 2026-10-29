import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadActor } from "@/auth/admit";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { answerDeepLink, DEEP_LINKING_RESPONSE, pendingDeepLink, resourceLinkItem, returnUrlAllowed } from "./deep-link";
import { loadToolKey, type ToolKey } from "./keys";
import { signInFromLaunch } from "./launch";
import { CANVAS_CLOUD_ISSUER, ensurePlatform, envRegistration, type Platform, type Registration } from "./registration";
import { DEEP_LINKING, RESOURCE_LINK, type LaunchClaims } from "./validate";

const LTI = "https://purl.imsglobal.org/spec/lti/claim/";
const DL = "https://purl.imsglobal.org/spec/lti-dl/claim/";
const ROLE = "http://purl.imsglobal.org/vocab/lis/v2/membership#";
const LAUNCH_URL = "https://dalaa.example.com/api/lti/launch";
const RETURN_URL = "https://canvas.example.edu/courses/42/deep_linking_response?modal=true";
const LINE_ITEM = "https://canvas.example.edu/api/lti/courses/42/line_items/7";

const reg = envRegistration({
  LTI_PLATFORM_URL: "https://canvas.example.edu",
  LTI_CLIENT_ID: "10000000000013",
  LTI_DEPLOYMENT_ID: "17:abc",
}) as Registration;

describe("deep linking", () => {
  let key: ToolKey;
  let db: Db;
  let platform: Platform;

  beforeAll(async () => {
    const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
    key = await loadToolKey(Buffer.from(pem).toString("base64"));
  });

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    platform = (await ensurePlatform(db, inst, reg, CANVAS_CLOUD_ISSUER, reg.clientId))!;
  });

  const claims = (over: Partial<LaunchClaims> = {}): LaunchClaims => ({
    platform,
    deploymentId: "17:abc",
    messageType: DEEP_LINKING,
    sub: "opaque",
    email: "teacher@example.edu",
    name: "Pat Teacher",
    roles: [`${ROLE}Instructor`],
    context: { id: "ctx-42", title: "DALAA Test", label: "DT 101" },
    custom: { login_id: "teacher@example.edu" },
    targetLinkUri: LAUNCH_URL,
    deepLinking: { returnUrl: RETURN_URL, data: "canvas-opaque", acceptTypes: ["ltiResourceLink"] },
    ...over,
  });

  /** A teacher's deep-linking launch: the request id from the path it lands on, and the teacher. */
  async function teacherLaunch() {
    const signedIn = await signInFromLaunch(db, claims());
    if (!signedIn.ok) throw new Error(signedIn.error);
    const match = signedIn.path.match(/^\/courses\/([^/]+)\/add-to-canvas\/([^/]+)$/);
    expect(match?.[1]).toBe(signedIn.courseId);
    const actor = (await loadActor(db, signedIn.userId)) as Actor;
    return { courseId: signedIn.courseId, requestId: match![2], actor };
  }

  async function addActivity(courseId: string, actor: Actor, status: "draft" | "published", points: number | null = 10) {
    const [{ id }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, status, points, created_by)
       values ($1, 'study-chat', 'Harbor Bikes', '{}', $2, $3, $4) returning id`,
      [courseId, status, points, actor.userId],
    );
    return id;
  }

  const verify = (jwt: string) =>
    jwtVerify(jwt, createLocalJWKSet({ keys: [key.publicJwk] }), {
      issuer: reg.clientId,
      audience: CANVAS_CLOUD_ISSUER,
      algorithms: ["RS256"],
    });

  it("a teacher's launch lands on the picker; the pick is a signed response Canvas can verify", async () => {
    const { courseId, requestId, actor } = await teacherLaunch();
    expect(await pendingDeepLink(db, actor, requestId)).toEqual({ id: requestId, courseId });
    const activityId = await addActivity(courseId, actor, "published", 12.5);

    const answer = await answerDeepLink(db, actor, requestId, activityId, { key, launchUrl: LAUNCH_URL });
    if (!answer.ok) throw new Error(answer.reason);
    expect(answer.returnUrl).toBe(RETURN_URL);

    expect(decodeProtectedHeader(answer.jwt)).toMatchObject({ alg: "RS256", kid: key.kid, typ: "JWT" });
    const { payload } = await verify(answer.jwt);
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(300);
    expect(typeof payload.nonce).toBe("string");
    expect(payload[`${LTI}message_type`]).toBe(DEEP_LINKING_RESPONSE);
    expect(payload[`${LTI}version`]).toBe("1.3.0");
    expect(payload[`${LTI}deployment_id`]).toBe("17:abc");
    expect(payload[`${DL}data`]).toBe("canvas-opaque");
    expect(payload[`${DL}content_items`]).toEqual([
      {
        type: "ltiResourceLink",
        title: "Harbor Bikes",
        url: LAUNCH_URL,
        custom: { activity_id: activityId },
        lineItem: { scoreMaximum: 12.5, label: "Harbor Bikes", resourceId: activityId },
      },
    ]);
  });

  it("is used once, and only by the teacher who launched it", async () => {
    const { courseId, requestId, actor } = await teacherLaunch();
    const activityId = await addActivity(courseId, actor, "published");
    const other = { ...actor, userId: randomUUID() };
    expect(await pendingDeepLink(db, other, requestId)).toBeNull();
    expect(await answerDeepLink(db, other, requestId, activityId, { key, launchUrl: LAUNCH_URL })).toMatchObject({ ok: false });

    expect((await answerDeepLink(db, actor, requestId, activityId, { key, launchUrl: LAUNCH_URL })).ok).toBe(true);
    expect(await answerDeepLink(db, actor, requestId, activityId, { key, launchUrl: LAUNCH_URL })).toEqual({
      ok: false,
      reason: "This has expired. Choose DALAA again in Canvas.",
    });
  });

  it("expires", async () => {
    const { courseId, requestId, actor } = await teacherLaunch();
    const activityId = await addActivity(courseId, actor, "published");
    await db.query("update lti_deep_link_requests set created_at = now() - interval '2 hours', expires_at = now() - interval '1 second'");
    expect(await pendingDeepLink(db, actor, requestId)).toBeNull();
    expect((await answerDeepLink(db, actor, requestId, activityId, { key, launchUrl: LAUNCH_URL })).ok).toBe(false);
  });

  it("refuses a draft or another course's assignment without spending the request", async () => {
    const { courseId, requestId, actor } = await teacherLaunch();
    const draft = await addActivity(courseId, actor, "draft", null);
    expect(await answerDeepLink(db, actor, requestId, draft, { key, launchUrl: LAUNCH_URL })).toEqual({
      ok: false,
      reason: "Publish the assignment first, then add it to Canvas.",
    });
    const [{ id: elsewhere }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'X', 'X', 'W27', $2) returning id",
      [actor.institutionId, actor.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [elsewhere, actor.userId]);
    const theirs = await addActivity(elsewhere, actor, "published");
    expect(await answerDeepLink(db, actor, requestId, theirs, { key, launchUrl: LAUNCH_URL })).toEqual({
      ok: false,
      reason: "That assignment isn't in this course.",
    });
    expect(await pendingDeepLink(db, actor, requestId)).not.toBeNull();
  });

  it("only a teacher may add, and only back to the platform's own host", async () => {
    await teacherLaunch();
    expect(await signInFromLaunch(db, claims({ roles: [`${ROLE}Learner`], custom: { login_id: "sam" } }))).toEqual({
      ok: false,
      status: 403,
      error: "Only the course's teachers can add DALAA assignments.",
    });
    const evil = claims({ deepLinking: { returnUrl: "https://evil.example.com/steal", acceptTypes: [] } });
    expect(await signInFromLaunch(db, evil)).toMatchObject({ ok: false, status: 400 });
    expect(returnUrlAllowed(platform, "http://canvas.example.edu/x")).toBe(false);
    expect(returnUrlAllowed(platform, "not a url")).toBe(false);
    expect(returnUrlAllowed(platform, RETURN_URL)).toBe(true);
  });

  it("a launch of the added link opens that assignment and records its link and line item", async () => {
    const { courseId, actor } = await teacherLaunch();
    const activityId = await addActivity(courseId, actor, "published");
    const link = (id: string, extra: Partial<LaunchClaims> = {}) =>
      claims({
        messageType: RESOURCE_LINK,
        deepLinking: undefined,
        resourceLink: { id },
        custom: { login_id: "teacher@example.edu", activity_id: activityId },
        ags: { scope: [], lineItem: LINE_ITEM },
        ...extra,
      });
    const stored = async (id: string) =>
      (await db.query("select lti_resource_link_id, lti_line_item_url from activities where id = $1", [id]))[0];

    expect(await signInFromLaunch(db, link("rl-1"))).toMatchObject({ ok: true, path: `/courses/${courseId}/activities/${activityId}` });
    expect(await stored(activityId)).toEqual({ lti_resource_link_id: "rl-1", lti_line_item_url: LINE_ITEM });

    // A second Canvas link to the same assignment opens it but doesn't take over its gradebook column.
    await signInFromLaunch(db, link("rl-2", { ags: { scope: [], lineItem: `${LINE_ITEM}9` } }));
    expect(await stored(activityId)).toEqual({ lti_resource_link_id: "rl-1", lti_line_item_url: LINE_ITEM });

    // Canvas pointing rl-1 at another assignment moves the link there.
    const other = await addActivity(courseId, actor, "published");
    await signInFromLaunch(db, link("rl-1", { custom: { login_id: "teacher@example.edu", activity_id: other } }));
    expect(await stored(other)).toEqual({ lti_resource_link_id: "rl-1", lti_line_item_url: LINE_ITEM });
    expect(await stored(activityId)).toEqual({ lti_resource_link_id: null, lti_line_item_url: null });

    // A student who follows the link lands on the assignment itself.
    const student = link("rl-1", { email: "sam@example.edu", roles: [`${ROLE}Learner`], custom: { login_id: "sam@example.edu", activity_id: other } });
    expect(await signInFromLaunch(db, student)).toMatchObject({ ok: true, path: `/activities/${other}` });

    // An unknown or copied activity id opens the course.
    const copied = link("rl-3", { custom: { login_id: "teacher@example.edu", activity_id: randomUUID() } });
    expect(await signInFromLaunch(db, copied)).toMatchObject({ ok: true, path: `/courses/${courseId}` });
  });

  it("resourceLinkItem carries the assignment id and points", () => {
    expect(resourceLinkItem({ id: "a", title: "T", points: 3 }, LAUNCH_URL)).toMatchObject({
      custom: { activity_id: "a" },
      lineItem: { scoreMaximum: 3 },
    });
  });
});
