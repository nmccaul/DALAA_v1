import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { beginLogin, LAUNCH_STATE_TTL_SECONDS, readLoginParams, type LoginParams } from "./login";
import { CANVAS_CLOUD_ISSUER, envRegistration, type Registration } from "./registration";

const reg = envRegistration({
  LTI_PLATFORM_URL: "https://canvas.example.edu",
  LTI_CLIENT_ID: "10000000000013",
  LTI_DEPLOYMENT_ID: "17:abc",
}) as Registration;

const launchUrl = "https://dalaa.example.com/api/lti/launch";

const good: LoginParams = {
  iss: CANVAS_CLOUD_ISSUER,
  login_hint: "hint-123",
  target_link_uri: launchUrl,
  client_id: "10000000000013",
  lti_message_hint: "msg-456",
};

describe("beginLogin", () => {
  let db: Db;
  let inst: string;

  beforeAll(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
  });

  it("stores a state and nonce and redirects to the platform's authorize endpoint", async () => {
    const result = await beginLogin(db, inst, reg, good, launchUrl);
    if (!result.ok) throw new Error(result.error);
    const url = new URL(result.redirect);
    expect(`${url.origin}${url.pathname}`).toBe(reg.authUrl);
    const q = Object.fromEntries(url.searchParams);
    expect(q).toMatchObject({
      scope: "openid",
      response_type: "id_token",
      response_mode: "form_post",
      prompt: "none",
      client_id: "10000000000013",
      redirect_uri: launchUrl,
      login_hint: "hint-123",
      lti_message_hint: "msg-456",
    });

    const rows = await db.query<{ nonce: string; ttl: number; used_at: string | null }>(
      `select nonce, extract(epoch from expires_at - created_at)::int as ttl, used_at
       from lti_launch_states where state = $1`,
      [q.state],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nonce).toBe(q.nonce);
    expect(rows[0].nonce).not.toBe(q.state);
    expect(rows[0].ttl).toBe(LAUNCH_STATE_TTL_SECONDS);
    expect(rows[0].used_at).toBeNull();
  });

  it("gives every login its own state", async () => {
    const a = await beginLogin(db, inst, reg, good, launchUrl);
    const b = await beginLogin(db, inst, reg, good, launchUrl);
    if (!a.ok || !b.ok) throw new Error("login refused");
    expect(new URL(a.redirect).searchParams.get("state")).not.toBe(new URL(b.redirect).searchParams.get("state"));
  });

  it("accepts the platform URL as issuer and a missing client_id", async () => {
    const result = await beginLogin(
      db,
      inst,
      reg,
      { ...good, iss: "https://canvas.example.edu", client_id: undefined, lti_message_hint: undefined },
      launchUrl,
    );
    if (!result.ok) throw new Error(result.error);
    const q = new URL(result.redirect).searchParams;
    expect(q.get("client_id")).toBe("10000000000013");
    expect(q.has("lti_message_hint")).toBe(false);
  });

  it("refuses an unknown issuer without storing anything", async () => {
    const before = await count(db);
    expect(await beginLogin(db, inst, reg, { ...good, iss: "https://evil.example.com" }, launchUrl)).toEqual({
      ok: false,
      status: 403,
      error: "This Canvas isn't registered with DALAA",
    });
    expect(await count(db)).toBe(before);
  });

  it("refuses an unknown client", async () => {
    const before = await count(db);
    const result = await beginLogin(db, inst, reg, { ...good, client_id: "999" }, launchUrl);
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(await count(db)).toBe(before);
  });

  it("refuses missing parameters and an unconfigured tool", async () => {
    expect(await beginLogin(db, inst, reg, { ...good, login_hint: undefined }, launchUrl)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await beginLogin(db, inst, null, good, launchUrl)).toMatchObject({ ok: false, status: 503 });
  });
});

describe("readLoginParams", () => {
  it("reads a GET query", async () => {
    const q = new URLSearchParams({ iss: CANVAS_CLOUD_ISSUER, login_hint: "h", target_link_uri: launchUrl });
    const params = await readLoginParams(new Request(`https://dalaa.example.com/api/lti/login?${q}`));
    expect(params).toMatchObject({ iss: CANVAS_CLOUD_ISSUER, login_hint: "h", target_link_uri: launchUrl });
    expect(params.client_id).toBeUndefined();
  });

  it("reads a POST form", async () => {
    const body = new URLSearchParams({ iss: CANVAS_CLOUD_ISSUER, login_hint: "h", client_id: " 1 ", lti_message_hint: "" });
    const params = await readLoginParams(
      new Request("https://dalaa.example.com/api/lti/login", { method: "POST", body }),
    );
    expect(params).toMatchObject({ iss: CANVAS_CLOUD_ISSUER, login_hint: "h", client_id: "1" });
    expect(params.lti_message_hint).toBeUndefined();
  });
});

async function count(db: Db): Promise<number> {
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from lti_launch_states");
  return n;
}
