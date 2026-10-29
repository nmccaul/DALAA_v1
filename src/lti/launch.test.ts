import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWTVerifyGetKey } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadActor } from "@/auth/admit";
import { SESSION_COOKIE, verifySession } from "@/auth/session";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { courseRole, launchLoginId, signInFromLaunch } from "./launch";
import { beginLogin } from "./login";
import { CANVAS_CLOUD_ISSUER, envRegistration, type Registration } from "./registration";
import type { LaunchClaims } from "./validate";

// The route runs against the test database, a local platform key and a cookie jar.
const h = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  keys: undefined as JWTVerifyGetKey | undefined,
  jar: new Map<string, { value: string; options: unknown }>(),
}));
vi.mock("@/db/client", () => ({ db: () => h.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => h.jar.get(name),
    set: (name: string, value: string, options: unknown) => h.jar.set(name, { value, options }),
  }),
}));
vi.mock("./validate", async (original) => ({
  ...(await original<typeof import("./validate")>()),
  remoteKeys: () => h.keys,
}));

const SECRET = "s".repeat(40);
const reg = envRegistration({
  LTI_PLATFORM_URL: "https://canvas.example.edu",
  LTI_CLIENT_ID: "10000000000013",
  LTI_DEPLOYMENT_ID: "17:abc",
}) as Registration;
const launchUrl = "https://dalaa.example.com/api/lti/launch";
const LTI = "https://purl.imsglobal.org/spec/lti/claim/";
const ROLE = "http://purl.imsglobal.org/vocab/lis/v2/membership#";
const TEACHER = [`${ROLE}Instructor`, "http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor"];
const LEARNER = [`${ROLE}Learner`];

describe("courseRole", () => {
  it("reads only course roles", () => {
    expect(courseRole(TEACHER)).toBe("instructor");
    expect(courseRole(["http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant"])).toBe("instructor");
    expect(courseRole([...LEARNER, `${ROLE}Instructor`])).toBe("instructor");
    expect(courseRole(LEARNER)).toBe("student");
    expect(courseRole(["http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor"])).toBeNull();
    expect(courseRole([])).toBeNull();
  });
});

describe("launchLoginId", () => {
  const base = { custom: {} } as LaunchClaims;
  it("prefers login_id, then email, lowercased", () => {
    expect(launchLoginId({ ...base, custom: { login_id: "JDoe" }, email: "x@byu.edu" })).toBe("jdoe");
    expect(launchLoginId({ ...base, email: "Sam@Example.edu" })).toBe("sam@example.edu");
    expect(launchLoginId({ ...base, custom: { login_id: "bad id!" } })).toBeNull();
    expect(launchLoginId(base)).toBeNull();
  });
});

describe("LTI launch sign-in", () => {
  let db: Db;
  let inst: string;
  let platformKey: CryptoKey;
  let POST: (r: Request) => Promise<Response>;

  beforeAll(async () => {
    db = h.db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const pair = await generateKeyPair("RS256");
    platformKey = pair.privateKey;
    h.keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k", alg: "RS256" }] });
    process.env.SESSION_SECRET = SECRET;
    process.env.APP_URL = "https://dalaa.example.com";
    ({ POST } = await import("@/app/api/lti/launch/route"));
  });

  beforeEach(() => h.jar.clear());

  /** A full launch through the route: login, signed id_token, form POST. */
  async function launch(opts: {
    context?: string;
    roles?: string[];
    loginId?: string;
    email?: string;
    name?: string;
    membershipsUrl?: string;
    lineItemsUrl?: string;
    sub?: string;
  }) {
    const login = await beginLogin(
      db,
      inst,
      reg,
      { iss: CANVAS_CLOUD_ISSUER, login_hint: "h", target_link_uri: launchUrl, client_id: reg.clientId },
      launchUrl,
    );
    if (!login.ok) throw new Error(login.error);
    const q = new URL(login.redirect).searchParams;
    const token = await new SignJWT({
      nonce: q.get("nonce"),
      email: opts.email,
      name: opts.name,
      [`${LTI}deployment_id`]: "17:abc",
      [`${LTI}version`]: "1.3.0",
      [`${LTI}message_type`]: "LtiResourceLinkRequest",
      [`${LTI}target_link_uri`]: launchUrl,
      [`${LTI}resource_link`]: { id: "rl-1" },
      [`${LTI}roles`]: opts.roles ?? LEARNER,
      [`${LTI}context`]: { id: opts.context ?? "ctx-42", title: "DALAA Test", label: "DT 101" },
      [`${LTI}custom`]: { login_id: opts.loginId, canvas_course_id: 42 },
      ...(opts.membershipsUrl && {
        "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice": {
          context_memberships_url: opts.membershipsUrl,
          service_versions: ["2.0"],
        },
      }),
      ...(opts.lineItemsUrl && {
        "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint": { scope: [], lineitems: opts.lineItemsUrl },
      }),
    })
      .setProtectedHeader({ alg: "RS256", kid: "k" })
      .setIssuer(CANVAS_CLOUD_ISSUER)
      .setAudience(reg.clientId)
      .setSubject(opts.sub ?? "opaque-sub")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(platformKey);
    const form = new FormData();
    form.set("id_token", token);
    form.set("state", q.get("state")!);
    return POST(new Request(launchUrl, { method: "POST", body: form }));
  }

  /** Every launch goes through /api/lti/landed with a login code for the right path. */
  async function landsOn(res: Response) {
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://dalaa.example.com/api/lti/landed");
    const [row] = await db.query<{ path: string }>("select path from lti_login_codes where code = $1", [
      location.searchParams.get("code"),
    ]);
    return row.path;
  }

  const signedInAs = () => verifySession(h.jar.get(SESSION_COOKIE)?.value, SECRET, Math.floor(Date.now() / 1000));

  it("a teacher's first launch creates the user, course and membership and sets the cookie", async () => {
    const res = await launch({ roles: TEACHER, loginId: "Teacher@Example.edu", email: "teacher@example.edu", name: "Pat Teacher" });
    expect(res.status).toBe(303);

    const [user] = await db.query<{ id: string; external_id: string; display_name: string }>(
      "select id, external_id, display_name from users where external_id = 'teacher@example.edu'",
    );
    expect(user).toMatchObject({ display_name: "Pat Teacher" });
    const [course] = await db.query<{ id: string; title: string; code: string; canvas_course_id: string; created_by: string }>(
      "select c.id, c.title, c.code, c.canvas_course_id, c.created_by from courses c join lti_contexts lc on lc.course_id = c.id where lc.context_id = 'ctx-42'",
    );
    expect(course).toMatchObject({ title: "DALAA Test", code: "DT 101", canvas_course_id: "42", created_by: user.id });
    const members = await db.query("select role, status from course_members where course_id = $1", [course.id]);
    expect(members).toEqual([{ role: "instructor", status: "active" }]);

    expect(await landsOn(res)).toBe(`/courses/${course.id}`);
    expect(signedInAs()).toBe(user.id);
    // Staff for that course without the allowlist (D-020), but not admin.
    expect(await loadActor(db, user.id)).toMatchObject({ isStaff: true, isAdmin: false });
  });

  it("a relaunch finds the same course and account", async () => {
    await launch({ roles: TEACHER, loginId: "teacher@example.edu" });
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from courses");
    const [{ u }] = await db.query<{ u: number }>("select count(*)::int as u from users");
    expect(n).toBe(1);
    expect(u).toBe(1);
  });

  it("a student joins the course and lands on its assignments, without becoming staff", async () => {
    const res = await launch({ loginId: "sam@example.edu", email: "sam@example.edu", name: "Sam" });
    expect(res.status).toBe(303);
    const [user] = await db.query<{ id: string }>("select id from users where external_id = 'sam@example.edu'");
    const [{ course_id }] = await db.query<{ course_id: string }>("select course_id from course_members where user_id = $1", [user.id]);
    expect(await landsOn(res)).toBe(`/?course=${course_id}`);
    expect(signedInAs()).toBe(user.id);
    const [m] = await db.query("select role from course_members where user_id = $1", [user.id]);
    expect(m).toEqual({ role: "student" });
    expect(await loadActor(db, user.id)).toMatchObject({ isStaff: false });
  });

  it("marks Canvas's Student View user (TestUser role) on the membership, and only it", async () => {
    await launch({ roles: TEACHER, loginId: "teacher@example.edu", context: "ctx-sv" });
    await launch({ roles: [...LEARNER, "http://purl.imsglobal.org/vocab/lti/system/person#TestUser"], loginId: "a1b2c3", name: "Test Student", context: "ctx-sv" });
    await launch({ loginId: "real@example.edu", name: "Test Student", context: "ctx-sv" });
    const rows = await db.query(
      `select u.external_id, m.role, m.student_view from course_members m join users u on u.id = m.user_id
         join lti_contexts x on x.course_id = m.course_id where x.context_id = 'ctx-sv' order by u.external_id`,
    );
    expect(rows).toEqual([
      { external_id: "a1b2c3", role: "student", student_view: true },
      { external_id: "real@example.edu", role: "student", student_view: false },
      { external_id: "teacher@example.edu", role: "instructor", student_view: false },
    ]);
  });

  it("links to an existing account by email instead of making a second (D-024)", async () => {
    const [{ id }] = await db.query<{ id: string }>(
      `insert into users (institution_id, external_id, display_name, email)
       values ($1, 'roster.kim', 'Kim Roster', 'Kim@Example.edu') returning id`,
      [inst],
    );
    await launch({ loginId: "kim.canvas@example.edu", email: "kim@example.edu", name: "Kimberly" });
    expect(signedInAs()).toBe(id);
    const [user] = await db.query("select external_id, display_name from users where id = $1", [id]);
    expect(user).toEqual({ external_id: "roster.kim", display_name: "Kim Roster" });
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from users where external_id = 'kim.canvas@example.edu'");
    expect(n).toBe(0);
  });

  it("a student can't open a course no instructor has launched", async () => {
    const res = await launch({ context: "ctx-new", loginId: "lee@example.edu" });
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await res.text()).toContain("Your instructor hasn&#39;t opened DALAA in this course yet. Try again later.");
    expect(h.jar.has(SESSION_COOKIE)).toBe(false);
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from users where external_id = 'lee@example.edu'");
    expect(n).toBe(0);
  });

  it("refuses a launch with no course role or no usable login ID", async () => {
    const noRole = await launch({ roles: ["http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator"], loginId: "a@example.edu" });
    expect(noRole.status).toBe(403);
    const noId = await launch({ loginId: undefined, email: undefined });
    expect(noId.status).toBe(403);
    expect(h.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("a failed verification signs no one in", async () => {
    const form = new FormData();
    form.set("id_token", "not.a.jwt");
    form.set("state", "x".repeat(40));
    const res = await POST(new Request(launchUrl, { method: "POST", body: form }));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(h.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("signInFromLaunch refuses a launch outside a course", async () => {
    const claims = { context: undefined, roles: TEACHER, custom: {}, email: "t@example.edu" } as unknown as LaunchClaims;
    expect(await signInFromLaunch(db, claims)).toEqual({ ok: false, status: 400, error: "Open DALAA from a course in Canvas." });
  });

  it("remembers the latest memberships URL for roster sync", async () => {
    const url = (n: number) => `https://canvas.example.edu/api/lti/courses/${n}/names_and_roles`;
    const stored = async () =>
      (await db.query<{ memberships_url: string | null }>("select memberships_url from lti_contexts where context_id = 'ctx-nrps'"))[0]
        .memberships_url;
    await launch({ context: "ctx-nrps", roles: TEACHER, loginId: "nrps.teacher", membershipsUrl: url(1) });
    expect(await stored()).toBe(url(1));
    await launch({ context: "ctx-nrps", roles: LEARNER, loginId: "nrps.student" });
    expect(await stored()).toBe(url(1));
    await launch({ context: "ctx-nrps", roles: LEARNER, loginId: "nrps.student", membershipsUrl: url(2) });
    expect(await stored()).toBe(url(2));
  });

  it("remembers the gradebook URL and each user's platform id for sending grades", async () => {
    const url = (n: number) => `https://canvas.example.edu/api/lti/courses/${n}/line_items`;
    const ctx = async () =>
      (await db.query<{ memberships_url: string | null; lineitems_url: string | null }>(
        "select memberships_url, lineitems_url from lti_contexts where context_id = 'ctx-ags'",
      ))[0];
    const subOf = async (loginId: string) =>
      (await db.query<{ sub: string }>(
        "select l.sub from lti_users l join users u on u.id = l.user_id where u.external_id = $1",
        [loginId],
      )).map((r) => r.sub);
    await launch({ context: "ctx-ags", roles: TEACHER, loginId: "ags.teacher", sub: "t-1", lineItemsUrl: url(1), membershipsUrl: "https://canvas.example.edu/nrps" });
    expect(await ctx()).toEqual({ memberships_url: "https://canvas.example.edu/nrps", lineitems_url: url(1) });
    await launch({ context: "ctx-ags", roles: LEARNER, loginId: "ags.student", sub: "s-1" });
    expect(await ctx()).toEqual({ memberships_url: "https://canvas.example.edu/nrps", lineitems_url: url(1) });
    await launch({ context: "ctx-ags", roles: LEARNER, loginId: "ags.student", sub: "s-2", lineItemsUrl: url(2) });
    expect((await ctx()).lineitems_url).toBe(url(2));
    expect(await subOf("ags.teacher")).toEqual(["t-1"]);
    expect(await subOf("ags.student")).toEqual(["s-2"]);
    // The sub moves to whichever account Canvas last launched with it.
    await launch({ context: "ctx-ags", roles: LEARNER, loginId: "ags.renamed", sub: "s-2" });
    expect(await subOf("ags.student")).toEqual([]);
    expect(await subOf("ags.renamed")).toEqual(["s-2"]);
  });
});
