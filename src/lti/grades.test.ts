import { generateKeyPairSync, randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgsLineItem } from "@/canvas/client";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { previewGrades, sendGrades } from "./grades";
import { loadToolKey, type ToolKey } from "./keys";
import { ensurePlatform, envRegistration, type Platform } from "./registration";
import { forgetServiceTokens } from "./services";
import { rememberLtiUser } from "./users";

const CANVAS = "https://canvas.example.edu";
const LINEITEMS = `${CANVAS}/api/lti/courses/42/line_items`;
const COLUMN = `${LINEITEMS}/7`;

describe("previewGrades / sendGrades", () => {
  let db: Db;
  let prof: Actor;
  let platform: Platform;
  let key: ToolKey;
  let course: string;
  let activity: string;
  // The fake Canvas: its columns, the scores it holds (column → sub → score), and what was posted.
  let columns: Map<string, AgsLineItem>;
  let held: Map<string, Map<string, number>>;
  let posted: { column: string; userId: string; scoreGiven: number }[];
  let failPostsFor: Set<string>;

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.toString() === platform.tokenUrl) return Response.json({ access_token: "ags-token", expires_in: 3600 });
    if (new Headers(init?.headers).get("authorization") !== "Bearer ags-token") return new Response("", { status: 401 });
    const path = `${url.origin}${url.pathname}`;
    if (path === LINEITEMS && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Omit<AgsLineItem, "id">;
      const item = { ...body, id: `${LINEITEMS}/${columns.size + 100}` };
      columns.set(item.id, item);
      return Response.json(item);
    }
    if (path === LINEITEMS) {
      const rid = url.searchParams.get("resource_id");
      return Response.json([...columns.values()].filter((c) => c.resourceId === rid));
    }
    if (columns.has(path)) return Response.json(columns.get(path));
    const [, column, service] = /^(.*)\/(results|scores)$/.exec(path) ?? [];
    if (service === "results") {
      return Response.json([...(held.get(column) ?? new Map())].map(([userId, resultScore]) => ({ userId, resultScore, resultMaximum: 10 })));
    }
    if (service === "scores" && init?.method === "POST") {
      const score = JSON.parse(String(init.body)) as { userId: string; scoreGiven: number };
      if (failPostsFor.has(score.userId)) return new Response("", { status: 500 });
      posted.push({ column, userId: score.userId, scoreGiven: score.scoreGiven });
      if (!held.has(column)) held.set(column, new Map());
      held.get(column)!.set(score.userId, score.scoreGiven);
      return Response.json({});
    }
    return new Response("", { status: 404 });
  }) as typeof globalThis.fetch;
  const deps = () => ({ fetch, key });

  beforeAll(async () => {
    const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
    key = await loadToolKey(Buffer.from(pem as string).toString("base64"));
  });

  beforeEach(async () => {
    forgetServiceTokens();
    columns = new Map([[COLUMN, { id: COLUMN, scoreMaximum: 10, label: "Case 1" }]]);
    held = new Map();
    posted = [];
    failPostsFor = new Set();
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'prof', 'Prof') returning id",
      [inst],
    );
    prof = { userId: id, institutionId: inst, netId: "prof", displayName: "Prof", isStaff: true, isAdmin: false };
    const reg = envRegistration({ LTI_PLATFORM_URL: CANVAS, LTI_CLIENT_ID: "c1", LTI_DEPLOYMENT_ID: "d1" })!;
    platform = (await ensurePlatform(db, inst, reg, "https://canvas.instructure.com", "c1"))!;
    [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'From Canvas', $2) returning id",
      [inst, prof.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [course, prof.userId]);
    await db.query("insert into lti_contexts (platform_id, context_id, course_id, lineitems_url) values ($1, 'ctx', $2, $3)", [
      platform.id,
      course,
      LINEITEMS,
    ]);
    [{ id: activity }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, status, points, lti_line_item_url, created_by)
       values ($1, 'study-chat', 'Case 1', '{}', 'published', 10, $2, $3) returning id`,
      [course, COLUMN, prof.userId],
    );
  });

  /** A student on the class list; `score` grades them, `sub` is their Canvas id. */
  async function student(netId: string, opts: { score?: number; maxScore?: number; sub?: string | null } = {}) {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [prof.institutionId, netId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'student')", [course, id]);
    if (opts.sub !== null) await rememberLtiUser(db, platform.id, id, opts.sub ?? `sub-${netId}`);
    if (opts.score !== undefined) {
      const [{ id: attempt }] = await db.query<{ id: string }>(
        "insert into attempts (activity_id, user_id, status, ended_by, completed_at) values ($1, $2, 'completed', 'student', now()) returning id",
        [activity, id],
      );
      await db.query(
        `insert into results (attempt_id, status, score, max_score, criteria, touchpoints, feedback, graded_at)
         values ($1, 'graded', $2, $3, '[]', '[]', 'Ok.', now())`,
        [attempt, opts.score, opts.maxScore ?? 10],
      );
    }
    return id;
  }
  const send = (opts = { includeLowered: false }, clientKey = randomUUID()) => sendGrades(db, prof, activity, clientKey, opts, deps());
  const categories = async () => {
    const p = await previewGrades(db, prof, activity, deps());
    if (!p.ok || !p.plan.ok) throw new Error(JSON.stringify(p));
    return Object.fromEntries(p.plan.lines.map((l) => [l.name, l.category]));
  };

  it("keeps the ledger behind row level security", async () => {
    const rows = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname in ('grade_pushes', 'grade_push_lines')",
    );
    expect(rows.map((r) => r.relrowsecurity)).toEqual([true, true]);
  });

  it("previews without writing to Canvas, then sends new scores in one click", async () => {
    await student("ana", { score: 8 });
    await student("ben");
    await student("cy", { score: 6, sub: null });
    expect(await categories()).toEqual({ ana: "send", ben: "not_graded", cy: "not_in_canvas" });
    const preview = await previewGrades(db, prof, activity, deps());
    expect(preview).toMatchObject({ ok: true, needsPreview: true, title: "Case 1", points: 10 });
    expect(posted).toEqual([]);

    expect(await send()).toEqual({ ok: true, summary: { sent: 1, failed: 0, skipped: { not_graded: 1, not_in_canvas: 1 } } });
    expect(posted).toEqual([{ column: COLUMN, userId: "sub-ana", scoreGiven: 8 }]);
    // Sent again: nothing new to send.
    expect(await categories()).toMatchObject({ ana: "unchanged" });
    expect(await send()).toEqual({ ok: true, summary: { sent: 0, failed: 0, skipped: { unchanged: 1, not_graded: 1, not_in_canvas: 1 } } });
    expect(posted).toHaveLength(1);
  });

  it("a replayed click returns the first push's summary and sends nothing", async () => {
    await student("ana", { score: 8 });
    const clientKey = randomUUID();
    const first = await send(undefined, clientKey);
    held.clear();
    expect(await send(undefined, clientKey)).toEqual(first);
    expect(posted).toHaveLength(1);
    expect(await sendGrades(db, prof, activity, "not-a-uuid", { includeLowered: false }, deps())).toEqual({ ok: false, reason: "bad_key" });
  });

  it("reports a score changed in Canvas and never overwrites it", async () => {
    const ana = await student("ana", { score: 8 });
    await send();
    held.get(COLUMN)!.set("sub-ana", 9.5);
    await db.query("update results set teacher_score = 9, teacher_scored_by = $2, teacher_scored_at = now() from attempts t where t.id = results.attempt_id and t.user_id = $1", [ana, prof.userId]);
    expect(await categories()).toEqual({ ana: "changed_in_canvas" });
    expect(await send({ includeLowered: true })).toMatchObject({ ok: true, summary: { sent: 0, skipped: { changed_in_canvas: 1 } } });
    expect(posted).toHaveLength(1);
  });

  it("holds back a lowered score unless the teacher includes it", async () => {
    await student("ana", { score: 8 });
    await send();
    await db.query("update results set teacher_score = 4, teacher_scored_by = $1, teacher_scored_at = now()", [prof.userId]);
    expect(await categories()).toEqual({ ana: "lowered" });
    expect(await send()).toMatchObject({ ok: true, summary: { sent: 0, skipped: { lowered: 1 } } });
    expect(await send({ includeLowered: true })).toMatchObject({ ok: true, summary: { sent: 1 } });
    expect(posted.map((p) => p.scoreGiven)).toEqual([8, 4]);
  });

  it("refuses a column out of other points, and a graded score out of other points", async () => {
    await student("ana", { score: 8 });
    await student("ben", { score: 16, maxScore: 20 });
    expect(await categories()).toEqual({ ana: "send", ben: "points_mismatch" });
    columns.get(COLUMN)!.scoreMaximum = 20;
    const preview = await previewGrades(db, prof, activity, deps());
    expect(preview).toMatchObject({ ok: true, needsPreview: true, plan: { ok: false, reason: "points_mismatch", points: 10, canvasPoints: 20 } });
    expect(await send()).toEqual({ ok: false, reason: "points_mismatch" });
    expect(posted).toEqual([]);
  });

  it("records a score Canvas didn't confirm as failed, and sends it next time", async () => {
    await student("ana", { score: 8 });
    await student("ben", { score: 7 });
    failPostsFor.add("sub-ben");
    expect(await send()).toEqual({ ok: true, summary: { sent: 1, failed: 1, skipped: {} } });
    failPostsFor.clear();
    expect(await categories()).toEqual({ ana: "unchanged", ben: "send" });
    expect(await send()).toMatchObject({ ok: true, summary: { sent: 1, failed: 0 } });
    const lines = await db.query<{ status: string }>("select status from grade_push_lines order by sent_at");
    expect(lines.map((l) => l.status)).toEqual(["sent", "failed", "sent"]);
  });

  it("finds the activity's column by resource id when the launch didn't name one", async () => {
    await db.query("update activities set lti_line_item_url = null");
    columns.set(`${LINEITEMS}/8`, { id: `${LINEITEMS}/8`, scoreMaximum: 10, label: "Case 1", resourceId: activity });
    await student("ana", { score: 8 });
    expect(await send()).toMatchObject({ ok: true, summary: { sent: 1 } });
    expect(posted).toEqual([{ column: `${LINEITEMS}/8`, userId: "sub-ana", scoreGiven: 8 }]);
  });

  it("makes a column only when sending, and keeps its URL once Canvas confirms it", async () => {
    await db.query("update activities set lti_line_item_url = null");
    columns.clear();
    await student("ana", { score: 8 });
    expect(await categories()).toEqual({ ana: "send" });
    expect(columns.size).toBe(0);
    expect(await send()).toMatchObject({ ok: true, summary: { sent: 1 } });
    const [made] = columns.values();
    expect(made).toMatchObject({ scoreMaximum: 10, label: "Case 1", resourceId: activity });
    const [row] = await db.query<{ lti_line_item_url: string }>("select lti_line_item_url from activities");
    expect(row.lti_line_item_url).toBe(made.id);
    expect(await send()).toMatchObject({ ok: true, summary: { sent: 0, skipped: { unchanged: 1 } } });
    expect(columns.size).toBe(1);
  });

  it("refuses another teacher's assignment, a course not from Canvas, and a refused token", async () => {
    const [{ id: otherId }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'other', 'Other') returning id",
      [prof.institutionId],
    );
    const other = { ...prof, userId: otherId, netId: "other" };
    expect(await previewGrades(db, other, activity, deps())).toEqual({ ok: false, reason: "not_found" });
    expect(await sendGrades(db, other, activity, randomUUID(), { includeLowered: false }, deps())).toEqual({ ok: false, reason: "not_found" });

    const badFetch = (async (input: RequestInfo | URL) =>
      String(input) === platform.tokenUrl ? new Response("", { status: 401 }) : new Response("", { status: 404 })) as typeof globalThis.fetch;
    expect(await previewGrades(db, prof, activity, { fetch: badFetch, key })).toEqual({ ok: false, reason: "refused" });

    await db.query("delete from lti_contexts");
    expect(await previewGrades(db, prof, activity, deps())).toEqual({ ok: false, reason: "not_linked" });
  });
});
