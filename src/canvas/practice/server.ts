/**
 * Practice Canvas: answers a subset of the Canvas REST API from practice data,
 * the way Canvas does (Bearer token, per_page + Link pagination, error shapes,
 * 403 throttling). Served at /practice-canvas so the real client code runs
 * unchanged against it. Fake data only; never real students.
 *
 * Any token starting "practice-" is accepted. "practice-throttled" answers
 * like a throttled Canvas, for testing.
 */

import {
  PRACTICE_COURSES,
  PRACTICE_ENROLLMENTS,
  PRACTICE_FILES,
  PRACTICE_PAGES,
  PRACTICE_SECTIONS,
  PRACTICE_TEACHER,
} from "./data";

export const PRACTICE_PREFIX = "/practice-canvas";
export const PRACTICE_TOKEN = "practice-canvas-token";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });

const canvasError = (status: number, message: string, headers: Record<string, string> = {}) =>
  json({ errors: [{ message }] }, status, headers);

export function practiceCanvas(request: Request): Response {
  const url = new URL(request.url);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token.startsWith("practice-")) return canvasError(401, "Invalid access token.");
  if (token === "practice-throttled") {
    return canvasError(403, "403 Forbidden (Rate Limit Exceeded)", { "X-Rate-Limit-Remaining": "0" });
  }
  if (request.method !== "GET") return canvasError(405, "Practice Canvas is read-only.");

  const path = url.pathname.replace(PRACTICE_PREFIX, "").replace(/\/+$/, "");
  let match: RegExpMatchArray | null;

  if (path === "/api/v1/users/self") return json(PRACTICE_TEACHER);
  if (path === "/api/v1/courses") return paginate(url, PRACTICE_COURSES);
  if ((match = path.match(/^\/api\/v1\/courses\/(\d+)\/sections$/))) {
    const courseId = Number(match[1]);
    if (!PRACTICE_COURSES.some((c) => c.id === courseId)) return notFound();
    return paginate(url, PRACTICE_SECTIONS.filter((s) => s.course_id === courseId));
  }
  if ((match = path.match(/^\/api\/v1\/courses\/(\d+)\/enrollments$/))) {
    const enrollments = PRACTICE_ENROLLMENTS.get(Number(match[1]));
    if (!enrollments) return notFound();
    const states = url.searchParams.getAll("state[]");
    const wanted = states.length ? states : ["active", "invited"]; // Canvas's default
    return paginate(url, enrollments.filter((e) => wanted.includes(e.enrollment_state)));
  }
  if ((match = path.match(/^\/api\/v1\/courses\/(\d+)\/pages$/))) {
    const pages = PRACTICE_PAGES.get(Number(match[1]));
    if (!pages) return notFound();
    // Canvas's page list has no bodies.
    return paginate(
      url,
      pages.map(({ page_id, url: slug, title, updated_at, published }) => ({ page_id, url: slug, title, updated_at, published })),
    );
  }
  if ((match = path.match(/^\/api\/v1\/courses\/(\d+)\/pages\/([^/]+)$/))) {
    const page = PRACTICE_PAGES.get(Number(match[1]))?.find((p) => p.url === decodeURIComponent(match![2]));
    return page ? json(page) : notFound();
  }
  if ((match = path.match(/^\/api\/v1\/courses\/(\d+)\/files$/))) {
    const files = PRACTICE_FILES.get(Number(match[1]));
    if (!files) return notFound();
    return paginate(url, files.map((f) => withUrl(url, f.file)));
  }
  if ((match = path.match(/^\/api\/v1\/courses\/(\d+)\/files\/(\d+)$/))) {
    const found = PRACTICE_FILES.get(Number(match[1]))?.find((f) => f.file.id === Number(match![2]));
    return found ? json(withUrl(url, found.file)) : notFound();
  }
  if ((match = path.match(/^\/files\/(\d+)\/download$/))) {
    const id = Number(match[1]);
    const found = [...PRACTICE_FILES.values()].flat().find((f) => f.file.id === id);
    if (!found || url.searchParams.get("verifier") !== `practice-${id}`) return notFound();
    return new Response(found.bytes.slice(), { headers: { "Content-Type": found.file["content-type"] } });
  }
  return notFound();
}

/** A file as the API lists it: with a verifier download link, like Canvas. */
function withUrl<T extends { id: number }>(request: URL, file: T): T & { url: string } {
  return { ...file, url: `${request.origin}${PRACTICE_PREFIX}/files/${file.id}/download?verifier=practice-${file.id}` };
}

function notFound() {
  return canvasError(404, "The specified resource does not exist.");
}

/** Canvas-style paging: per_page (default 10, max 100), page, and a Link header. */
function paginate<T>(url: URL, items: T[]): Response {
  const perPage = Math.min(Math.max(Number(url.searchParams.get("per_page")) || 10, 1), 100);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const last = Math.max(Math.ceil(items.length / perPage), 1);
  const link = (p: number, rel: string) => {
    const u = new URL(url);
    u.searchParams.set("page", String(p));
    u.searchParams.set("per_page", String(perPage));
    return `<${u.toString()}>; rel="${rel}"`;
  };
  const links = [link(page, "current"), link(1, "first"), link(last, "last")];
  if (page < last) links.push(link(page + 1, "next"));
  if (page > 1) links.push(link(page - 1, "prev"));
  return json(items.slice((page - 1) * perPage, page * perPage), 200, { Link: links.join(",") });
}
