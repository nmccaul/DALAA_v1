import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { beginLogin } from "./login";
import { CANVAS_CLOUD_ISSUER, envRegistration, type Registration } from "./registration";
import { DEEP_LINKING, readLaunchInput, validateLaunch, type KeySource } from "./validate";

const reg = envRegistration({
  LTI_PLATFORM_URL: "https://canvas.example.edu",
  LTI_CLIENT_ID: "10000000000013",
  LTI_DEPLOYMENT_ID: "17:abc",
}) as Registration;

const launchUrl = "https://dalaa.example.com/api/lti/launch";
const LTI = "https://purl.imsglobal.org/spec/lti/claim/";

describe("validateLaunch", () => {
  let db: Db;
  let inst: string;
  let platformKey: CryptoKey;
  let otherKey: CryptoKey;
  let keys: KeySource;
  let requestedUrl: string | undefined;

  beforeAll(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const pair = await generateKeyPair("RS256");
    platformKey = pair.privateKey;
    otherKey = (await generateKeyPair("RS256")).privateKey;
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "canvas-1", alg: "RS256" };
    const set = createLocalJWKSet({ keys: [jwk] });
    keys = (url) => {
      requestedUrl = url;
      return set;
    };
  });

  /** A login, as Canvas would start it; returns the stored state and nonce. */
  async function login(iss = CANVAS_CLOUD_ISSUER) {
    const result = await beginLogin(
      db,
      inst,
      reg,
      { iss, login_hint: "h", target_link_uri: launchUrl, client_id: reg.clientId },
      launchUrl,
    );
    if (!result.ok) throw new Error(result.error);
    const q = new URL(result.redirect).searchParams;
    return { state: q.get("state")!, nonce: q.get("nonce")! };
  }

  function claims(nonce: string, extra: Record<string, unknown> = {}) {
    return {
      nonce,
      email: "Student@Example.edu",
      name: "Sam Student",
      [`${LTI}deployment_id`]: "17:abc",
      [`${LTI}version`]: "1.3.0",
      [`${LTI}message_type`]: "LtiResourceLinkRequest",
      [`${LTI}target_link_uri`]: launchUrl,
      [`${LTI}resource_link`]: { id: "rl-1", title: "Harbor Bikes" },
      [`${LTI}roles`]: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"],
      [`${LTI}context`]: { id: "ctx-42", title: "DALAA Test", label: "DT" },
      [`${LTI}custom`]: { login_id: "student@example.edu", canvas_course_id: 42, empty: "" },
      "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice": {
        context_memberships_url: "https://canvas.example.edu/api/lti/courses/42/names_and_roles",
      },
      ...extra,
    };
  }

  async function sign(
    payload: Record<string, unknown>,
    opts: { key?: CryptoKey; iss?: string; aud?: string | string[]; exp?: string | number } = {},
  ) {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", kid: "canvas-1" })
      .setIssuer(opts.iss ?? CANVAS_CLOUD_ISSUER)
      .setAudience(opts.aud ?? reg.clientId)
      .setSubject("canvas-user-uuid")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(opts.key ?? platformKey);
  }

  it("accepts a good launch and returns its claims", async () => {
    const { state, nonce } = await login();
    const result = await validateLaunch(db, { id_token: await sign(claims(nonce)), state }, keys);
    if (!result.ok) throw new Error(result.error);
    expect(requestedUrl).toBe(reg.jwksUrl);
    expect(result.claims).toMatchObject({
      deploymentId: "17:abc",
      messageType: "LtiResourceLinkRequest",
      sub: "canvas-user-uuid",
      email: "Student@Example.edu",
      roles: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"],
      context: { id: "ctx-42", title: "DALAA Test", label: "DT" },
      resourceLink: { id: "rl-1", title: "Harbor Bikes" },
      custom: { login_id: "student@example.edu", canvas_course_id: "42" },
      targetLinkUri: launchUrl,
      nrps: { membershipsUrl: "https://canvas.example.edu/api/lti/courses/42/names_and_roles" },
    });
    expect(result.claims.platform).toMatchObject({ issuer: CANVAS_CLOUD_ISSUER, clientId: reg.clientId });
    expect(result.claims.custom).not.toHaveProperty("empty");
  });

  it("accepts a deep linking request with its return address", async () => {
    const { state, nonce } = await login();
    const token = await sign(
      claims(nonce, {
        [`${LTI}message_type`]: DEEP_LINKING,
        [`${LTI}resource_link`]: undefined,
        "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings": {
          deep_link_return_url: "https://canvas.example.edu/courses/42/deep_linking_response",
          accept_types: ["ltiResourceLink"],
          data: "opaque",
        },
      }),
    );
    const result = await validateLaunch(db, { id_token: token, state }, keys);
    if (!result.ok) throw new Error(result.error);
    expect(result.claims.deepLinking).toEqual({
      returnUrl: "https://canvas.example.edu/courses/42/deep_linking_response",
      data: "opaque",
      acceptTypes: ["ltiResourceLink"],
    });
  });

  it("refuses a token signed by another key", async () => {
    const { state, nonce } = await login();
    const result = await validateLaunch(db, { id_token: await sign(claims(nonce), { key: otherKey }), state }, keys);
    expect(result).toEqual({ ok: false, status: 401, error: "The launch couldn't be verified" });
  });

  it("refuses the wrong audience", async () => {
    const { state, nonce } = await login();
    const result = await validateLaunch(db, { id_token: await sign(claims(nonce), { aud: "999" }), state }, keys);
    expect(result).toMatchObject({ ok: false, status: 401, error: "The launch wasn't meant for DALAA" });
  });

  it("requires azp when there are several audiences", async () => {
    const aud = [reg.clientId, "other"];
    const a = await login();
    expect(await validateLaunch(db, { id_token: await sign(claims(a.nonce), { aud }), state: a.state }, keys))
      .toMatchObject({ ok: false, status: 401 });
    const b = await login();
    const ok = await validateLaunch(
      db,
      { id_token: await sign(claims(b.nonce, { azp: reg.clientId }), { aud }), state: b.state },
      keys,
    );
    expect(ok.ok).toBe(true);
  });

  it("refuses an issuer other than the one the login named", async () => {
    const { state, nonce } = await login();
    const result = await validateLaunch(
      db,
      { id_token: await sign(claims(nonce), { iss: "https://canvas.example.edu" }), state },
      keys,
    );
    expect(result).toMatchObject({ ok: false, status: 401, error: "The launch came from a Canvas DALAA doesn't know" });
  });

  it("refuses a replay of the same state, and a token whose nonce belongs to another login", async () => {
    const first = await login();
    const token = await sign(claims(first.nonce));
    expect((await validateLaunch(db, { id_token: token, state: first.state }, keys)).ok).toBe(true);
    expect(await validateLaunch(db, { id_token: token, state: first.state }, keys)).toMatchObject({
      ok: false,
      status: 401,
    });
    const second = await login();
    expect(await validateLaunch(db, { id_token: token, state: second.state }, keys)).toEqual({
      ok: false,
      status: 401,
      error: "The launch doesn't match its sign-in request",
    });
  });

  it("burns the state even when the token is bad", async () => {
    const { state, nonce } = await login();
    await validateLaunch(db, { id_token: await sign(claims(nonce), { key: otherKey }), state }, keys);
    const good = await validateLaunch(db, { id_token: await sign(claims(nonce)), state }, keys);
    expect(good).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses an unknown deployment", async () => {
    const { state, nonce } = await login();
    const token = await sign(claims(nonce, { [`${LTI}deployment_id`]: "18:xyz" }));
    expect(await validateLaunch(db, { id_token: token, state }, keys)).toEqual({
      ok: false,
      status: 403,
      error: "This DALAA install isn't registered",
    });
  });

  it("refuses an expired token", async () => {
    const { state, nonce } = await login();
    const token = await sign(claims(nonce), { exp: Math.floor(Date.now() / 1000) - 120 });
    expect(await validateLaunch(db, { id_token: token, state }, keys)).toMatchObject({
      ok: false,
      status: 401,
      error: "This launch has expired. Open DALAA from Canvas again.",
    });
  });

  it("refuses an expired state", async () => {
    const { state, nonce } = await login();
    const later = new Date(Date.now() + 11 * 60 * 1000);
    const token = await sign(claims(nonce));
    expect(await validateLaunch(db, { id_token: token, state }, keys, later)).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses the wrong LTI version, message type and missing link claims", async () => {
    const cases: [Record<string, unknown>, number][] = [
      [{ [`${LTI}version`]: "1.1" }, 400],
      [{ [`${LTI}message_type`]: "LtiSubmissionReviewRequest" }, 400],
      [{ [`${LTI}resource_link`]: undefined }, 400],
      [{ [`${LTI}message_type`]: DEEP_LINKING }, 400],
      [{ [`${LTI}target_link_uri`]: undefined }, 400],
    ];
    for (const [extra, status] of cases) {
      const { state, nonce } = await login();
      expect(await validateLaunch(db, { id_token: await sign(claims(nonce, extra)), state }, keys)).toMatchObject({
        ok: false,
        status,
      });
    }
  });

  it("refuses missing input and an unknown state", async () => {
    expect(await validateLaunch(db, { state: "x" }, keys)).toMatchObject({ ok: false, status: 400 });
    expect(await validateLaunch(db, { id_token: "a.b.c", state: "x".repeat(43) }, keys)).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});

describe("readLaunchInput", () => {
  it("reads the POST form and tolerates a missing body", async () => {
    const body = new URLSearchParams({ id_token: "t", state: " s " });
    expect(await readLaunchInput(new Request(launchUrl, { method: "POST", body }))).toEqual({ id_token: "t", state: "s" });
    expect(await readLaunchInput(new Request(launchUrl, { method: "POST" }))).toEqual({
      id_token: undefined,
      state: undefined,
    });
  });
});
