import { describe, expect, it } from "vitest";
import { CanvasError, canvasClient, nextLink, servicePath, type AgsScore } from "./client";
import { PRACTICE_TOKEN, practiceCanvas } from "./practice/server";

const BASE = "https://dalaa.test/practice-canvas";

/** The real client, talking to practice Canvas through a fetch that counts calls. */
function practice(token = PRACTICE_TOKEN, opts: { maxPages?: number } = {}) {
  const calls: string[] = [];
  const client = canvasClient({
    baseUrl: BASE,
    token,
    maxPages: opts.maxPages,
    fetch: async (input, init) => {
      calls.push(String(input));
      return practiceCanvas(new Request(input, init));
    },
  });
  return { client, calls };
}

const kindOf = (p: Promise<unknown>) =>
  p.then(
    () => "no error",
    (e: unknown) => (e instanceof CanvasError ? e.kind : String(e)),
  );

describe("canvas client against practice Canvas", () => {
  it("identifies the token's owner", async () => {
    expect(await practice().client.self()).toEqual({ id: 9001, name: "Practice Professor" });
  });

  it("lists the courses the teacher teaches, with terms", async () => {
    const courses = await practice().client.coursesTaught();
    expect(courses.map((c) => [c.course_code, c.term?.name])).toEqual([
      ["BUS M 361", "Winter 2027"],
      ["BUS M 499", "Winter 2027"],
      ["MKTG 201", "Fall 2026"],
    ]);
  });

  it("includes a cross-listed section", async () => {
    const sections = await practice().client.sections(1101);
    expect(sections.filter((s) => s.nonxlist_course_id !== null)).toHaveLength(1);
  });

  it("follows Link pagination to the end (230 students, 3 pages)", async () => {
    const { client, calls } = practice();
    const enrollments = await client.studentEnrollments(1103);
    expect(enrollments).toHaveLength(230);
    expect(calls).toHaveLength(3);
  });

  it("raises instead of truncating past the page cap", async () => {
    expect(await kindOf(practice(PRACTICE_TOKEN, { maxPages: 2 }).client.studentEnrollments(1103))).toBe(
      "too-many-pages",
    );
  });

  it("asks for concluded enrollments too (Canvas calls them completed)", async () => {
    const states = new Set((await practice().client.studentEnrollments(1101)).map((e) => e.enrollment_state));
    expect([...states].sort()).toEqual(["active", "completed", "inactive", "invited"]);
  });

  it("maps Canvas failures to kinds the UI can act on", async () => {
    expect(await kindOf(practice("not-a-practice-token").client.self())).toBe("token-rejected");
    expect(await kindOf(practice("practice-throttled").client.self())).toBe("rate-limited");
    expect(await kindOf(practice().client.sections(4242))).toBe("not-found");
  });

  it("treats network failures, 5xx, and non-list bodies as errors, never as empty lists", async () => {
    const respond = (make: () => Response | Promise<Response>) =>
      canvasClient({ baseUrl: BASE, token: "t", fetch: async () => make() });
    expect(await kindOf(respond(() => Promise.reject(new Error("offline"))).sections(1))).toBe("unavailable");
    expect(await kindOf(respond(() => new Response("oops", { status: 502 })).sections(1))).toBe("unavailable");
    expect(await kindOf(respond(() => Response.json({ not: "a list" })).sections(1))).toBe("bad-response");
  });

  it("never puts the token in an error message", async () => {
    const secret = "7~supersecrettoken";
    const error = await canvasClient({ baseUrl: BASE, token: secret, fetch: async (i, init) => practiceCanvas(new Request(i, init)) })
      .self()
      .catch((e: Error) => e);
    expect(String((error as Error).message)).not.toContain(secret);
  });
});

describe("nextLink", () => {
  it("finds rel=next among Canvas's links", () => {
    const header =
      '<https://x/api?page=2>; rel="current",<https://x/api?page=3>; rel="next",<https://x/api?page=1>; rel="first"';
    expect(nextLink(header)).toBe("https://x/api?page=3");
    expect(nextLink('<https://x/api?page=1>; rel="first"')).toBeNull();
    expect(nextLink(null)).toBeNull();
  });
});

describe("AGS (gradebook through LTI)", () => {
  const CANVAS = "https://canvas.example.edu";
  const ITEMS = `${CANVAS}/api/lti/courses/42/line_items`;
  const ITEM = `${ITEMS}/7`;

  /** A fake Canvas gradebook that records each request. */
  function gradebook(reply: (req: Request) => Response | Promise<Response>) {
    const calls: { method: string; url: string; accept: string | null; type: string | null; body: string }[] = [];
    const client = canvasClient({
      baseUrl: CANVAS,
      token: "ags-token",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        const body = await req.clone().text();
        calls.push({ method: req.method, url: req.url, accept: req.headers.get("accept"), type: req.headers.get("content-type"), body });
        return reply(req);
      },
    });
    return { client, calls };
  }

  it("reads a column and finds the ones made for an activity", async () => {
    const { client, calls } = gradebook((req) =>
      req.url === ITEM
        ? Response.json({ id: ITEM, scoreMaximum: 10, label: "Case 1" })
        : Response.json([{ id: ITEM, scoreMaximum: 10, label: "Case 1", resourceId: "act-1" }]),
    );
    expect(await client.ags.lineItem(ITEM)).toMatchObject({ id: ITEM, scoreMaximum: 10 });
    expect(await client.ags.lineItemsFor(`${ITEMS}?per_page=50`, "act-1")).toHaveLength(1);
    expect(calls.map((c) => [c.method, c.url, c.accept])).toEqual([
      ["GET", ITEM, "application/vnd.ims.lis.v2.lineitem+json"],
      ["GET", `${ITEMS}?per_page=50&resource_id=act-1`, "application/vnd.ims.lis.v2.lineitemcontainer+json"],
    ]);
  });

  it("makes a column, and only a reply carrying its URL counts as made", async () => {
    let reply = Response.json({ id: ITEM, scoreMaximum: 10, label: "Case 1", resourceId: "act-1" }, { status: 201 });
    const { client, calls } = gradebook(() => reply);
    const item = { scoreMaximum: 10, label: "Case 1", resourceId: "act-1" };
    expect((await client.ags.createLineItem(ITEMS, item)).id).toBe(ITEM);
    expect(calls[0]).toMatchObject({ method: "POST", url: ITEMS, type: "application/vnd.ims.lis.v2.lineitem+json" });
    expect(JSON.parse(calls[0].body)).toEqual(item);
    reply = Response.json({ ok: true }, { status: 201 });
    expect(await kindOf(client.ags.createLineItem(ITEMS, item))).toBe("bad-response");
  });

  it("reads every page of results, keeping the column's query string", async () => {
    const withQuery = `${ITEM}?type=x`;
    const { client, calls } = gradebook((req) =>
      req.url.includes("page=2")
        ? Response.json([{ userId: "b", resultScore: 7, resultMaximum: 10 }])
        : Response.json([{ userId: "a" }], { headers: { link: `<${ITEM}/results?type=x&page=2>; rel="next"` } }),
    );
    expect((await client.ags.results(withQuery)).map((r) => [r.userId, r.resultScore ?? null])).toEqual([
      ["a", null],
      ["b", 7],
    ]);
    expect(calls[0]).toMatchObject({ url: `${ITEM}/results?type=x`, accept: "application/vnd.ims.lis.v2.resultcontainer+json" });
  });

  it("posts a score as an LIS score and treats only 2xx as confirmed", async () => {
    let status = 200;
    const { client, calls } = gradebook(() => Response.json({}, { status }));
    const score: AgsScore = {
      userId: "sub-1",
      scoreGiven: 8,
      scoreMaximum: 10,
      timestamp: "2027-01-20T12:00:00.000Z",
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
    };
    await client.ags.postScore(ITEM, score);
    expect(calls[0]).toMatchObject({ method: "POST", url: `${ITEM}/scores`, type: "application/vnd.ims.lis.v1.score+json" });
    expect(JSON.parse(calls[0].body)).toEqual(score);
    status = 422;
    expect(await kindOf(client.ags.postScore(ITEM, score))).toBe("bad-response");
    status = 503;
    expect(await kindOf(client.ags.postScore(ITEM, score))).toBe("unavailable");
  });

  it("never sends the token to another host", async () => {
    const { client, calls } = gradebook(() => Response.json([]));
    expect(await kindOf(client.ags.results("https://evil.example.com/line_items/7"))).toBe("bad-response");
    expect(await kindOf(client.ags.lineItem("not a url"))).toBe("bad-response");
    expect(calls).toEqual([]);
  });
});

describe("servicePath", () => {
  it("adds the service before the query string", () => {
    expect(servicePath("https://x/line_items/7?a=1", "scores")).toBe("https://x/line_items/7/scores?a=1");
    expect(servicePath("https://x/line_items/7/", "results")).toBe("https://x/line_items/7/results");
  });
});
