import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { claimReport, findReport, getFix, listLine, openReports, readOnly, recordFix, resolveFixed } from "./fixes";
import { getReport } from "./store";

let db: Db;
let userId: string;
let admin: Actor;
let n = 0;

async function report(kind = "bug", ageMinutes = 0, note = "The Send button did nothing."): Promise<string> {
  n += 1;
  const [{ id }] = await db.query<{ id: string }>(
    `insert into feedback_reports (user_id, client_key, kind, note, url, created_at)
     values ($1, $2, $3, $4, 'http://localhost:3000/courses/abc/students?x=1', now() - make_interval(mins => $5))
     returning id`,
    [userId, `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, kind, note, ageMinutes],
  );
  return id;
}

beforeEach(async () => {
  db = await testDb();
  const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
  [{ id: userId }] = await db.query<{ id: string }>(
    "insert into users (institution_id, external_id, display_name) values ($1, 'boss', 'Boss') returning id",
    [inst],
  );
  admin = { userId, institutionId: inst, netId: "boss", displayName: "Boss", isStaff: true, isAdmin: true };
});

describe("openReports", () => {
  it("lists open reports the loop hasn't closed, bugs and confusing before ideas, oldest first", async () => {
    const idea = await report("idea", 90);
    const newBug = await report("bug", 5);
    const oldConfusing = await report("confusing", 60);
    const claimed = await report("bug", 30);
    const closed = await report("bug", 120);
    const resolved = await report("bug", 200);
    await claimReport(db, claimed);
    await recordFix(db, closed, { status: "cant_reproduce", note: "Send works on every page I tried." });
    await db.query("update feedback_reports set status = 'resolved', resolved_at = now() where id = $1", [resolved]);

    const rows = await openReports(db);
    expect(rows.map((r) => r.id)).toEqual([oldConfusing, claimed, newBug, idea]);
    expect(rows.find((r) => r.id === claimed)?.fixStatus).toBe("in_progress");
  });

  it("prints short id, kind, age, path and the start of the note on one line", async () => {
    await report("bug", 150, `Line one\nline two ${"x".repeat(100)}`);
    const [row] = await openReports(db);
    const line = listLine(row);
    const [shortId, kind, age, path, note] = line.split("\t");
    expect(shortId).toBe(row.id.slice(0, 8));
    expect([kind, age, path]).toEqual(["bug", "2h", "/courses/abc/students"]);
    expect(note).toHaveLength(80);
    expect(note.startsWith("Line one line two")).toBe(true);
  });
});

describe("findReport", () => {
  it("finds a report by its first 8 characters and refuses what isn't an id", async () => {
    const id = await report();
    expect(await findReport(db, id.slice(0, 8).toUpperCase())).toEqual({ id });
    expect(await findReport(db, "abc")).toHaveProperty("problem");
    expect(await findReport(db, "'; drop table users; --")).toHaveProperty("problem");
    expect(await findReport(db, "ffffffff")).toEqual({ problem: "No report starts with ffffffff." });
  });
});

describe("claim, record and resolve", () => {
  it("lets one pass claim a report, and not a second one or a closed report", async () => {
    const id = await report();
    expect(await claimReport(db, id, "fix/feedback-abc")).toBe(true);
    expect(await claimReport(db, id)).toBe(false);
    expect(await getFix(db, id)).toMatchObject({ status: "in_progress", branch: "fix/feedback-abc" });

    const done = await report();
    await db.query("update feedback_reports set status = 'resolved', resolved_at = now() where id = $1", [done]);
    expect(await claimReport(db, done)).toBe(false);
  });

  it("records an outcome and keeps earlier fields a later record leaves out", async () => {
    const id = await report();
    await recordFix(db, id, { status: "in_progress", prUrl: "https://github.com/nmccaul/DALAA_v1/pull/200", branch: "fix/feedback-x" });
    expect(await recordFix(db, id, { status: "fixed", commit: "ABC1234" })).toEqual({ ok: true });
    expect(await getFix(db, id)).toEqual({
      status: "fixed",
      branch: "fix/feedback-x",
      prUrl: "https://github.com/nmccaul/DALAA_v1/pull/200",
      note: null,
      commit: "abc1234",
    });
  });

  it("refuses a bad status, commit or link, and a report that isn't there", async () => {
    const id = await report();
    expect(await recordFix(db, id, { status: "done" as never })).toMatchObject({ ok: false });
    expect(await recordFix(db, id, { status: "fixed", commit: "not-a-sha" })).toMatchObject({ ok: false });
    expect(await recordFix(db, id, { status: "fixed", prUrl: "javascript:alert(1)" })).toMatchObject({ ok: false });
    expect(await recordFix(db, "00000000-0000-4000-8000-000000000000", { status: "fixed" })).toEqual({ ok: false, problem: "No such report." });
    expect(await getFix(db, id)).toBeNull();
  });

  it("resolves the report with the merge SHA and marks the fix fixed, once", async () => {
    const id = await report();
    await claimReport(db, id);
    expect(await resolveFixed(db, id, "deadbee")).toEqual({ ok: true });
    expect(await resolveFixed(db, id, "cafef00")).toMatchObject({ ok: false });
    const detail = await getReport(db, admin, id);
    expect(detail).toMatchObject({ status: "resolved", fixedCommit: "deadbee", fix: { status: "fixed", commit: "deadbee" } });
    expect(await openReports(db)).toEqual([]);
  });

  it("refuses to resolve without a real SHA and changes nothing", async () => {
    const id = await report();
    expect(await resolveFixed(db, id, "main")).toMatchObject({ ok: false });
    expect((await getReport(db, admin, id))?.status).toBe("open");
    expect(await getFix(db, id)).toBeNull();
  });

  it("shows no fix on a report the loop hasn't touched", async () => {
    const id = await report();
    expect((await getReport(db, admin, id))?.fix).toBeNull();
  });
});

describe("readOnly", () => {
  it("lets reads through and refuses any write", async () => {
    const id = await report();
    expect(await readOnly(db, openReports)).toHaveLength(1);
    await expect(readOnly(db, (tx) => claimReport(tx, id))).rejects.toThrow(/read-only/);
    expect(await getFix(db, id)).toBeNull();
  });
});
