import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import type { ReportInput } from "./report";
import { decodeScreenshot, getReport, getScreenshot, listReports, resolveReport, saveReport } from "./store";

// A 1×1 PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let db: Db;
let student: Actor;
let admin: Actor;
let n = 0;

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  n += 1;
  return {
    clientKey: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    kind: "bug",
    note: "The Send button did nothing.",
    url: "http://localhost:3000/activities/abc",
    context: {
      title: "Case 1",
      userAgent: "test",
      viewport: { w: 390, h: 844, dpr: 3 },
      colorScheme: "dark",
      console: [],
      errors: [],
    },
    screenshot: PNG,
    ...overrides,
  };
}

beforeEach(async () => {
  db = await testDb();
  const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
  const actorFor = async (netId: string, isAdmin: boolean): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: isAdmin, isAdmin };
  };
  student = await actorFor("stu1", false);
  admin = await actorFor("boss", true);
});

describe("saveReport", () => {
  it("keeps whether the reporter marked up the picture", async () => {
    const marked = await saveReport(db, student, input({ context: { ...input().context, annotated: true } }), null);
    const plain = await saveReport(db, student, input(), null);
    expect((await getReport(db, admin, (marked as { id: string }).id))?.context.annotated).toBe(true);
    expect((await getReport(db, admin, (plain as { id: string }).id))?.context.annotated).toBeUndefined();
  });

  it("saves a report with its screenshot and the deployed commit, and an admin can read it back", async () => {
    const outcome = await saveReport(db, student, input(), "abc123def456");
    expect(outcome).toMatchObject({ ok: true, id: expect.any(String) });
    const id = (outcome as { id: string }).id;

    const [summary] = await listReports(db, admin);
    expect(summary).toMatchObject({ id, kind: "bug", note: "The Send button did nothing.", status: "open", reporter: "stu1", hasScreenshot: true });
    const detail = await getReport(db, admin, id);
    expect(detail).toMatchObject({ appCommit: "abc123def456", context: { viewport: { w: 390, h: 844, dpr: 3 }, colorScheme: "dark" } });
    const shot = await getScreenshot(db, admin, id);
    expect(shot?.type).toBe("image/png");
    expect(Buffer.from(shot!.bytes).subarray(1, 4).toString()).toBe("PNG");
  });

  it("returns the first report when the same send arrives twice", async () => {
    const once = input();
    const first = await saveReport(db, student, once, null);
    const again = await saveReport(db, student, once, null);
    expect(again).toEqual(first);
    expect(await listReports(db, admin)).toHaveLength(1);
  });

  it("keeps the report when the screenshot is missing, unreadable or not an image we take", async () => {
    for (const screenshot of [null, "data:image/png;base64,", "data:image/svg+xml;base64,PHN2Zz4=", "not a data url"]) {
      const outcome = await saveReport(db, student, input({ screenshot }), null);
      expect(outcome).toMatchObject({ ok: true, id: expect.any(String) });
    }
    const rows = await listReports(db, admin);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => !r.hasScreenshot)).toBe(true);
  });

  it("scrubs secrets from what the browser captured", async () => {
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlc2lnbmF0dXJl";
    const outcome = await saveReport(
      db,
      student,
      input({
        url: "http://localhost:3000/api/lti/launch?state=s3cr3t&page=2",
        context: {
          ...input().context,
          console: [{ t: 1, level: "error", text: `token=${jwt} failed` }],
          errors: [{ t: 2, message: "Authorization: Bearer abc.def", stack: null }],
        },
      }),
      null,
    );
    const detail = await getReport(db, admin, (outcome as { id: string }).id);
    expect(detail?.url).toBe("http://localhost:3000/api/lti/launch?state=[redacted]&page=2");
    expect(detail?.context.console[0].text).not.toContain(jwt);
    expect(detail?.context.errors[0].message).not.toContain("abc.def");
  });

  it("keeps only the last 25 console lines", async () => {
    const console = Array.from({ length: 40 }, (_, i) => ({ t: i, level: "warn" as const, text: `line ${i}` }));
    const outcome = await saveReport(db, student, input({ context: { ...input().context, console } }), null);
    const detail = await getReport(db, admin, (outcome as { id: string }).id);
    expect(detail?.context.console).toHaveLength(25);
    expect(detail?.context.console[0].text).toBe("line 15");
  });

  it("refuses a report with no note or a bad key", async () => {
    expect(await saveReport(db, student, input({ note: "   " }), null)).toMatchObject({ ok: false });
    expect(await saveReport(db, student, input({ clientKey: "nope" }), null)).toMatchObject({ ok: false });
    expect(await saveReport(db, student, null, null)).toMatchObject({ ok: false });
  });

  it("quietly drops reports past six in two minutes", async () => {
    for (let i = 0; i < 6; i += 1) expect(await saveReport(db, student, input(), null)).toMatchObject({ id: expect.any(String) });
    expect(await saveReport(db, student, input(), null)).toEqual({ ok: true, throttled: true });
    expect(await listReports(db, admin)).toHaveLength(6);
  });
});

describe("reading reports", () => {
  it("shows nothing to anyone but an admin", async () => {
    const { id } = (await saveReport(db, student, input(), null)) as { id: string };
    expect(await listReports(db, student)).toEqual([]);
    expect(await getReport(db, student, id)).toBeNull();
    expect(await getScreenshot(db, student, id)).toBeNull();
  });
});

describe("resolveReport", () => {
  it("marks a report resolved with the fix's commit, once", async () => {
    const { id } = (await saveReport(db, student, input(), null)) as { id: string };
    expect(await resolveReport(db, admin, id, "ABC1234")).toBe(true);
    expect(await getReport(db, admin, id)).toMatchObject({ status: "resolved", fixedCommit: "abc1234" });
    expect(await resolveReport(db, admin, id, "def5678")).toBe(false);
    expect(await getReport(db, admin, id)).toMatchObject({ fixedCommit: "abc1234" });
  });

  it("resolves without a commit, and refuses one that isn't a SHA", async () => {
    const { id } = (await saveReport(db, student, input(), null)) as { id: string };
    expect(await resolveReport(db, admin, id, "main; drop")).toBe(false);
    expect(await resolveReport(db, admin, id, "  ")).toBe(true);
    expect(await getReport(db, admin, id)).toMatchObject({ status: "resolved", fixedCommit: null });
  });

  it("lets nobody but an admin resolve", async () => {
    const { id } = (await saveReport(db, student, input(), null)) as { id: string };
    expect(await resolveReport(db, student, id, null)).toBe(false);
    expect(await getReport(db, admin, id)).toMatchObject({ status: "open" });
  });
});

describe("decodeScreenshot", () => {
  it("refuses one bigger than 3 MB", () => {
    const big = `data:image/jpeg;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64")}`;
    expect(decodeScreenshot(big)).toBeNull();
  });
});

it("enables row level security on feedback_reports", async () => {
  const [row] = await db.query<{ on: boolean }>("select relrowsecurity as on from pg_class where relname = 'feedback_reports'");
  expect(row.on).toBe(true);
});
