import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { recordFix, resolveFixed } from "./fixes";
import { listEveryonesReports, listMyReports, REPORTER_FIXED, sayFixed, standing } from "./mine";
import { getReport, listReports, resolveReport } from "./store";
import { saveReport } from "./store";

let db: Db;
let lucy: Actor;
let scott: Actor;
let admin: Actor;
let n = 0;

const send = async (who: Actor, note: string) => {
  n += 1;
  const saved = await saveReport(
    db,
    who,
    {
      clientKey: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      kind: "idea",
      note,
      url: "http://localhost:3000/courses",
      context: { title: "Courses", userAgent: "test", viewport: { w: 1280, h: 800, dpr: 1 }, colorScheme: "light", console: [], errors: [] },
      screenshot: null,
    },
    null,
  );
  if (!saved.ok || !("id" in saved)) throw new Error("setup");
  return saved.id;
};

beforeEach(async () => {
  db = await testDb();
  const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
  const actorFor = async (netId: string, isAdmin: boolean): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin };
  };
  lucy = await actorFor("lucy", false);
  scott = await actorFor("scott", false);
  admin = await actorFor("boss", true);
});

describe("listMyReports", () => {
  it("lists only the reports the person sent, newest first, with where each stands", async () => {
    const first = await send(lucy, "A second markup color");
    const second = await send(lucy, "Show me what I sent");
    await send(scott, "Scott's own idea");
    await db.query("update feedback_reports set created_at = now() - interval '1 day' where id = $1", [first]);
    await recordFix(db, second, { status: "in_progress" });

    const mine = await listMyReports(db, lucy);
    expect(mine.map((r) => r.note)).toEqual(["Show me what I sent", "A second markup color"]);
    expect(mine[0]).toMatchObject({ id: second, kind: "idea", status: "open", fixStatus: "in_progress" });
    expect(mine[1]).toMatchObject({ id: first, status: "open", fixStatus: null, resolvedAt: null });

    expect(await resolveFixed(db, first, "abc1234")).toEqual({ ok: true });
    expect((await listMyReports(db, lucy))[1]).toMatchObject({ status: "resolved", resolvedAt: expect.any(Date) });
  });

  it("doesn't widen for an admin: their own list is theirs", async () => {
    await send(lucy, "Lucy's");
    expect(await listMyReports(db, admin)).toEqual([]);
  });
});

describe("listEveryonesReports", () => {
  it("lists every report with who sent it for an admin, and nothing for anyone else", async () => {
    await send(lucy, "Lucy's");
    await send(scott, "Scott's");
    const all = await listEveryonesReports(db, admin);
    expect(all.map((r) => [r.reporter, r.note]).sort()).toEqual([
      ["lucy", "Lucy's"],
      ["scott", "Scott's"],
    ]);
    expect(await listEveryonesReports(db, lucy)).toEqual([]);
  });
});

describe("standing", () => {
  const at = new Date("2026-11-20T12:00:00Z");
  const open = { status: "open" as const, resolvedAt: null, fixStatus: null, fixAt: null };

  it("crosses off a resolved report, from when it was resolved", () => {
    expect(standing({ ...open, status: "resolved", resolvedAt: at, fixStatus: "fixed", fixAt: at })).toEqual({ label: "Fixed", done: "fixed", at });
  });

  it("keeps a report open until it's resolved, saying what's happening", () => {
    expect(standing(open)).toEqual({ label: "Received", done: false, at: null });
    expect(standing({ ...open, fixStatus: "in_progress", fixAt: at }).label).toBe("Being worked on");
    expect(standing({ ...open, fixStatus: "fixed", fixAt: at })).toMatchObject({ done: false });
    expect(standing({ ...open, fixStatus: "needs_nathan", fixAt: at }).label).toBe("Waiting on a decision");
  });

  it("says the sender thinks it's fixed until an admin resolves or closes it", () => {
    expect(standing({ ...open, reporterFixedAt: at })).toEqual({ label: REPORTER_FIXED, done: false, at: null });
    expect(standing({ ...open, fixStatus: "in_progress", fixAt: at, reporterFixedAt: at }).label).toBe(REPORTER_FIXED);
    expect(standing({ ...open, status: "resolved", resolvedAt: at, reporterFixedAt: at }).done).toBe("fixed");
    expect(standing({ ...open, fixStatus: "wont_fix", fixAt: at, reporterFixedAt: at }).done).toBe("closed");
  });

  it("closes one that won't change, without crossing it off", () => {
    expect(standing({ ...open, fixStatus: "wont_fix", fixAt: at })).toEqual({ label: "Closed without a change", done: "closed", at });
    expect(standing({ ...open, fixStatus: "cant_reproduce", fixAt: at })).toMatchObject({ done: "closed" });
  });
});

describe("sayFixed", () => {
  it("flags the sender's own open report for an admin, and keeps it open", async () => {
    const id = await send(lucy, "The Next button skips a student");
    expect(await sayFixed(db, lucy, id)).toBe(true);
    const [mine] = await listMyReports(db, lucy);
    expect(mine.status).toBe("open");
    expect(mine.reporterFixedAt).toBeInstanceOf(Date);
    expect(standing(mine).label).toBe(REPORTER_FIXED);

    const [everyone] = await listEveryonesReports(db, admin);
    expect(standing(everyone).label).toBe(REPORTER_FIXED);
    expect((await listReports(db, admin))[0].reporterFixedAt).toEqual(mine.reporterFixedAt);
    expect((await getReport(db, admin, id))?.reporterFixedAt).toEqual(mine.reporterFixedAt);

    // Saying it again keeps the first time; the admin still resolves it as before.
    expect(await sayFixed(db, lucy, id)).toBe(true);
    expect((await listMyReports(db, lucy))[0].reporterFixedAt).toEqual(mine.reporterFixedAt);
    expect(await resolveReport(db, admin, id, null)).toBe(true);
    expect(standing((await listMyReports(db, lucy))[0]).done).toBe("fixed");
  });

  it("changes nothing on someone else's report, a resolved one, or a made-up id", async () => {
    const theirs = await send(scott, "Scott's bug");
    expect(await sayFixed(db, lucy, theirs)).toBe(false);
    expect(await sayFixed(db, admin, theirs)).toBe(false);
    const done = await send(lucy, "Already fixed");
    await resolveReport(db, admin, done, null);
    expect(await sayFixed(db, lucy, done)).toBe(false);
    expect(await sayFixed(db, lucy, "not-an-id")).toBe(false);
    const rows = await db.query<{ n: number }>("select count(*)::int as n from feedback_reports where reporter_fixed_at is not null");
    expect(rows[0].n).toBe(0);
  });
});
