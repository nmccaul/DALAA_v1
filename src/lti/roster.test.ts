import { generateKeyPairSync, randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NrpsMember } from "@/canvas/client";
import { createCourse } from "@/courses/create";
import { getTaughtCourse, listRoster } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { loadToolKey, type ToolKey } from "./keys";
import { ensurePlatform, envRegistration, type Platform } from "./registration";
import { isLtiCourse, planFromMembers, syncLtiRoster } from "./roster";
import { forgetServiceTokens } from "./services";
import { ltiSubs } from "./users";

const ROLE = "http://purl.imsglobal.org/vocab/lis/v2/membership#";
const CUSTOM = "https://purl.imsglobal.org/spec/lti/claim/custom";
const MEMBERS = "https://canvas.example.edu/api/lti/courses/42/names_and_roles";

const learner = (email: string, extra: Partial<NrpsMember> = {}): NrpsMember => ({
  user_id: `sub-${email}`,
  name: email.split("@")[0].toUpperCase(),
  email,
  roles: [`${ROLE}Learner`],
  ...extra,
});

describe("planFromMembers", () => {
  it("adds active learners by login_id, else email; skips the rest and counts why", () => {
    const plan = planFromMembers([
      learner("Amy@School.edu"),
      learner("bo@school.edu", { message: [{ [CUSTOM]: { login_id: "BoNetId" } }] }),
      learner("cy@school.edu", { status: "Inactive" }),
      learner("dee@school.edu", { status: "Deleted" }),
      { user_id: "x", name: "No Email", roles: [`${ROLE}Learner`] },
      learner("amy@school.edu"),
      { ...learner("prof@school.edu"), roles: [`${ROLE}Instructor`] },
      { ...learner("ta@school.edu"), roles: [`${ROLE}Learner`, `${ROLE}TeachingAssistant`] },
    ]);
    expect(plan.sections).toEqual([]);
    expect(plan.students).toEqual([
      { netId: "amy@school.edu", name: "AMY", canvasSectionId: null, email: "amy@school.edu", studentView: false },
      { netId: "bonetid", name: "BO", canvasSectionId: null, email: "bo@school.edu", studentView: false },
    ]);
    expect(plan.skipped).toEqual({ notEnrolled: 2, noNetId: 2, inTwoSections: 0 });
    expect([...plan.subs]).toEqual([
      ["amy@school.edu", "sub-Amy@School.edu"],
      ["bonetid", "sub-bo@school.edu"],
    ]);
  });
});

const TEST_USER = "http://purl.imsglobal.org/vocab/lti/system/person#TestUser";
/** Canvas's Student View user as NRPS lists it: no email, an opaque login ID, the TestUser role. */
const studentView = (id: string): NrpsMember => ({
  user_id: `sub-${id}`,
  name: "Test Student",
  roles: [`${ROLE}Learner`, TEST_USER],
  message: [{ [CUSTOM]: { login_id: id } }],
});

describe("planFromMembers and Canvas Student View", () => {
  it("marks the TestUser role, not the name", () => {
    const plan = planFromMembers([studentView("a1b2c3"), learner("test@school.edu", { name: "Test Student" })]);
    expect(plan.students.map((s) => [s.netId, s.studentView])).toEqual([
      ["a1b2c3", true],
      ["test@school.edu", false],
    ]);
  });
});

describe("syncLtiRoster", () => {
  let db: Db;
  let prof: Actor;
  let platform: Platform;
  let key: ToolKey;
  let pages: Record<string, { members: NrpsMember[]; next?: string }>;
  let calls: string[];

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === platform.tokenUrl) return Response.json({ access_token: "nrps-token", expires_in: 3600 });
    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== "Bearer nrps-token") return new Response("", { status: 401 });
    const page = pages[url];
    if (!page) return new Response("", { status: 404 });
    const headers: Record<string, string> = {};
    if (page.next) headers.link = `<${page.next}>; rel="next"`;
    return Response.json({ id: url, members: page.members }, { headers });
  }) as typeof globalThis.fetch;

  beforeAll(async () => {
    const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
    key = await loadToolKey(Buffer.from(pem as string).toString("base64"));
  });

  beforeEach(async () => {
    forgetServiceTokens();
    calls = [];
    pages = {};
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name, email) values ($1, 'prof@school.edu', 'Prof', 'prof@school.edu') returning id",
      [inst],
    );
    prof = { userId: id, institutionId: inst, netId: "prof@school.edu", displayName: "Prof", isStaff: true, isAdmin: false };
    const reg = envRegistration({ LTI_PLATFORM_URL: "https://canvas.example.edu", LTI_CLIENT_ID: "c1", LTI_DEPLOYMENT_ID: "d1" })!;
    platform = (await ensurePlatform(db, inst, reg, "https://canvas.instructure.com", "c1"))!;
  });

  async function ltiCourse(membershipsUrl: string | null = MEMBERS) {
    const { courseId } = await createCourse(db, prof, { creationKey: randomUUID(), code: "C", title: "C", term: "From Canvas", students: [] });
    await db.query("insert into lti_contexts (platform_id, context_id, course_id, memberships_url) values ($1, 'ctx', $2, $3)", [
      platform.id,
      courseId,
      membershipsUrl,
    ]);
    return courseId;
  }
  const roster = async (courseId: string) =>
    (await listRoster(db, prof, courseId)).map((r) => `${r.netId}:${r.status}`).sort();

  it("adds learners from every page, flags ones who left, never deletes", async () => {
    const id = await ltiCourse();
    expect(await isLtiCourse(db, id)).toBe(true);
    pages[MEMBERS] = { members: [learner("amy@school.edu"), { ...learner("prof@school.edu"), roles: [`${ROLE}Instructor`] }], next: `${MEMBERS}?page=2` };
    pages[`${MEMBERS}?page=2`] = { members: [learner("bo@school.edu")] };
    expect(await syncLtiRoster(db, prof, id, { fetch, key })).toMatchObject({ ok: true, added: 2, flagged: 0 });
    expect(await roster(id)).toEqual(["amy@school.edu:active", "bo@school.edu:active"]);

    pages[MEMBERS] = { members: [learner("amy@school.edu"), learner("bo@school.edu", { status: "Inactive" })] };
    expect(await syncLtiRoster(db, prof, id, { fetch, key })).toMatchObject({ ok: true, added: 0, flagged: 1 });
    expect(await roster(id)).toEqual(["amy@school.edu:active", "bo@school.edu:flagged"]);
    // One token for both syncs.
    expect(calls.filter((c) => c === platform.tokenUrl)).toHaveLength(1);
  });

  it("links a student to the account that already has their email", async () => {
    const id = await ltiCourse();
    const [{ id: existing }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name, email) values ($1, 'amy', 'Amy', 'amy@school.edu') returning id",
      [prof.institutionId],
    );
    pages[MEMBERS] = { members: [learner("Amy@School.edu", { message: [{ [CUSTOM]: { login_id: "amy2" } }] })] };
    expect(await syncLtiRoster(db, prof, id, { fetch, key })).toMatchObject({ ok: true, added: 1 });
    const users = await db.query<{ id: string }>("select id from users where lower(email) = 'amy@school.edu'");
    expect(users.map((u) => u.id)).toEqual([existing]);
    expect(await roster(id)).toEqual(["amy:active"]);
    expect(await syncLtiRoster(db, prof, id, { fetch, key })).toMatchObject({ ok: true, added: 0, flagged: 0 });
    // Grades for Amy go to the platform id Canvas gave her (src/lti/users.ts).
    expect(await ltiSubs(db, platform.id, [existing])).toEqual(new Map([[existing, "sub-Amy@School.edu"]]));
  });

  it("keeps Canvas Student View users, marked, and leaves them out of the student count", async () => {
    const id = await ltiCourse();
    pages[MEMBERS] = { members: [learner("amy@school.edu"), studentView("a1b2c3")] };
    expect(await syncLtiRoster(db, prof, id, { fetch, key })).toMatchObject({ ok: true, added: 2 });
    expect((await listRoster(db, prof, id)).map((r) => [r.netId, r.studentView])).toEqual([
      ["amy@school.edu", false],
      ["a1b2c3", true],
    ]);
    expect(await getTaughtCourse(db, prof, id)).toMatchObject({ students: 1 });
    // A sync that no longer lists it flags it like anyone else; nothing is deleted.
    pages[MEMBERS] = { members: [learner("amy@school.edu")] };
    expect(await syncLtiRoster(db, prof, id, { fetch, key })).toMatchObject({ ok: true, flagged: 1 });
    expect(await roster(id)).toEqual(["a1b2c3:flagged", "amy@school.edu:active"]);
  });

  it("raises instead of truncating a class list with too many pages", async () => {
    const id = await ltiCourse();
    for (let i = 0; i < 60; i++) pages[i ? `${MEMBERS}?page=${i}` : MEMBERS] = { members: [], next: `${MEMBERS}?page=${i + 1}` };
    expect(await syncLtiRoster(db, prof, id, { fetch, key })).toEqual({ ok: false, reason: "unavailable" });
    expect(await roster(id)).toEqual([]);
  });

  it("refuses a course with no LTI context or no memberships URL yet", async () => {
    const plain = await createCourse(db, prof, { creationKey: randomUUID(), code: "P", title: "P", term: "W", students: [] });
    expect(await syncLtiRoster(db, prof, plain.courseId, { fetch, key })).toEqual({ ok: false, reason: "not-linked" });

    expect(await syncLtiRoster(db, prof, await ltiCourse(null), { fetch, key })).toEqual({ ok: false, reason: "no-class-list" });
  });

  it("never sends the token to a host other than the Canvas that issued it", async () => {
    const id = await ltiCourse("https://evil.example.com/names_and_roles");
    expect(await syncLtiRoster(db, prof, id, { fetch, key })).toEqual({ ok: false, reason: "refused" });
    expect(calls).toEqual([]);
  });

  it("reports refused when Canvas won't grant the scope", async () => {
    const id = await ltiCourse();
    const denied = (async () => Response.json({ error: "invalid_scope" }, { status: 400 })) as typeof globalThis.fetch;
    expect(await syncLtiRoster(db, prof, id, { fetch: denied, key })).toEqual({ ok: false, reason: "refused" });
  });

  it("only lets the course's instructor sync", async () => {
    const id = await ltiCourse();
    const [{ id: other }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'other', 'Other') returning id",
      [prof.institutionId],
    );
    const stranger = { ...prof, userId: other, netId: "other" };
    expect(await syncLtiRoster(db, stranger, id, { fetch, key })).toEqual({ ok: false, reason: "not-yours" });
    await expect(syncLtiRoster(db, { ...prof, isStaff: false }, id, { fetch, key })).rejects.toThrow();
  });
});
