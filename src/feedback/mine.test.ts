import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { recordFix, resolveFixed } from "./fixes";
import { listMyReports, standing } from "./mine";
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

  it("doesn't widen for an admin: the inbox is elsewhere", async () => {
    await send(lucy, "Lucy's");
    expect(await listMyReports(db, admin)).toEqual([]);
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

  it("closes one that won't change, without crossing it off", () => {
    expect(standing({ ...open, fixStatus: "wont_fix", fixAt: at })).toEqual({ label: "Closed without a change", done: "closed", at });
    expect(standing({ ...open, fixStatus: "cant_reproduce", fixAt: at })).toMatchObject({ done: "closed" });
  });
});
