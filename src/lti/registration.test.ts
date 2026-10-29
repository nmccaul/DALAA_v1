import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { CANVAS_CLOUD_ISSUER, ensurePlatform, envRegistration, isKnownDeployment, type Registration } from "./registration";

const env = {
  LTI_PLATFORM_URL: "https://canvas.example.edu/",
  LTI_CLIENT_ID: "10000000000013",
  LTI_DEPLOYMENT_ID: "17:abc",
};

describe("envRegistration", () => {
  it("builds endpoints from the platform URL and allows both issuers", () => {
    expect(envRegistration(env)).toEqual({
      issuers: [CANVAS_CLOUD_ISSUER, "https://canvas.example.edu"],
      clientId: "10000000000013",
      deploymentIds: ["17:abc"],
      authUrl: "https://canvas.example.edu/api/lti/authorize_redirect",
      tokenUrl: "https://canvas.example.edu/login/oauth2/token",
      jwksUrl: "https://canvas.example.edu/api/lti/security/jwks",
    });
  });

  it("is null when anything is missing", () => {
    expect(envRegistration({ ...env, LTI_CLIENT_ID: "" })).toBeNull();
    expect(envRegistration({ ...env, LTI_PLATFORM_URL: undefined })).toBeNull();
    expect(envRegistration({ ...env, LTI_DEPLOYMENT_ID: " , " })).toBeNull();
  });
});

describe("ensurePlatform", () => {
  let db: Db;
  let inst: string;
  let reg: Registration;

  beforeAll(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    reg = envRegistration(env)!;
  });

  it("upserts the platform and its deployments once", async () => {
    const a = await ensurePlatform(db, inst, reg, CANVAS_CLOUD_ISSUER, reg.clientId);
    const b = await ensurePlatform(db, inst, reg, CANVAS_CLOUD_ISSUER, reg.clientId);
    expect(a?.id).toBeDefined();
    expect(b?.id).toBe(a?.id);
    expect(a?.authUrl).toBe(reg.authUrl);
    expect(await isKnownDeployment(db, a!.id, "17:abc")).toBe(true);
    expect(await isKnownDeployment(db, a!.id, "18:other")).toBe(false);
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from lti_deployments");
    expect(n).toBe(1);
  });

  it("refuses an issuer that isn't allowed or a client that isn't ours", async () => {
    expect(await ensurePlatform(db, inst, reg, "https://evil.example.com", reg.clientId)).toBeNull();
    expect(await ensurePlatform(db, inst, reg, CANVAS_CLOUD_ISSUER, "999")).toBeNull();
  });
});

// The rules the LTI migration makes impossible to break.
describe("lti schema", () => {
  let db: Db;
  let platform: string;
  let prof: string;
  let inst: string;

  beforeAll(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    platform = (await ensurePlatform(db, inst, envRegistration(env)!, CANVAS_CLOUD_ISSUER, env.LTI_CLIENT_ID))!.id;
    [{ id: prof }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'prof', 'Prof') returning id",
      [inst],
    );
  });

  const course = async (code: string) =>
    (
      await db.query<{ id: string }>(
        "insert into courses (institution_id, code, title, term, created_by) values ($1, $2, $2, 'W27', $3) returning id",
        [inst, code, prof],
      )
    )[0].id;

  it("uses a state and a nonce once, and refuses short ones", async () => {
    const add = (state: string, nonce: string) =>
      db.query(
        "insert into lti_launch_states (state, nonce, platform_id, expires_at) values ($1, $2, $3, now() + interval '10 minutes')",
        [state, nonce, platform],
      );
    const s = "s".repeat(32);
    const n = "n".repeat(32);
    await add(s, n);
    await expect(add(s, "m".repeat(32))).rejects.toThrow(/duplicate key/);
    await expect(add("t".repeat(32), n)).rejects.toThrow(/duplicate key/);
    await expect(add("short", "o".repeat(32))).rejects.toThrow(/check constraint/);
  });

  it("maps one Canvas course to one DALAA course, both ways", async () => {
    const a = await course("A");
    const b = await course("B");
    const map = (context: string, courseId: string) =>
      db.query("insert into lti_contexts (platform_id, context_id, course_id) values ($1, $2, $3)", [
        platform,
        context,
        courseId,
      ]);
    await map("ctx-1", a);
    await expect(map("ctx-1", b)).rejects.toThrow(/duplicate key/);
    await expect(map("ctx-2", a)).rejects.toThrow(/duplicate key/);
  });

  it("enables row level security on every LTI table", async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname like 'lti\\_%' and relkind = 'r' order by relname",
    );
    expect(rows.map((r) => r.relname)).toEqual(["lti_contexts", "lti_deep_link_requests", "lti_deployments", "lti_launch_states", "lti_login_codes", "lti_platforms"]);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});
