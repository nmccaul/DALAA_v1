import { describe, expect, it } from "vitest";
import { CanvasError, canvasClient, nextLink } from "./client";
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
