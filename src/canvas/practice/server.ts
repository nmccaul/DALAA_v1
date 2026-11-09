/**
 * Practice Canvas: answers a subset of the Canvas REST API from practice data,
 * the way Canvas does (Bearer token, per_page + Link pagination, error shapes,
 * 403 throttling). Served at /practice-canvas so the real client code runs
 * unchanged against it. Fake data only; never real students.
 *
 * Assignments are the one thing it writes: kept in this process's memory,
 * so they last until the server restarts.
 *
 * Any token starting "practice-" is accepted. "practice-throttled" answers
 * like a throttled Canvas, for testing.
 */

import type { CanvasAssignment } from "../client";
import {
  PRACTICE_ASSIGNMENT_GROUPS,
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

/** Assignments made through practice Canvas, keyed by course id. In memory only. */
const assignments = new Map<number, CanvasAssignment[]>();
let nextAssignmentId = 30_000;

export async function practiceCanvas(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token.startsWith("practice-")) return canvasError(401, "Invalid access token.");
  if (token === "practice-throttled") {
    return canvasError(403, "403 Forbidden (Rate Limit Exceeded)", { "X-Rate-Limit-Remaining": "0" });
  }
  const path = url.pathname.replace(PRACTICE_PREFIX, "").replace(/\/+$/, "");
  let match: RegExpMatchArray | null;

  if ((match = path.match(/^\/api\/v1\/courses\/(\d+)\/assignments(?:\/(\d+))?$/))) {
    const courseId = Number(match[1]);
    const id = match[2] ? Number(match[2]) : null;
    if (request.method === "POST" && id === null) return createAssignment(courseId, await request.json().catch(() => null));
    if (request.method === "PUT" && id !== null) return updateAssignment(courseId, id, await request.json().catch(() => null));
    if (request.method === "GET") {
      const list = assignments.get(courseId) ?? [];
      if (id === null) return PRACTICE_ASSIGNMENT_GROUPS.has(courseId) ? paginate(url, list) : notFound();
      const found = list.find((a) => a.id === id);
      return found ? json(found) : notFound();
    }
  }
  if (request.method !== "GET") return canvasError(405, "Practice Canvas only writes assignments.");

  if ((match = path.match(/^\/api\/v1\/courses\/(\d+)\/assignment_groups$/))) {
    const groups = PRACTICE_ASSIGNMENT_GROUPS.get(Number(match[1]));
    return groups ? paginate(url, groups) : notFound();
  }
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

type AssignmentFields = Record<string, unknown>;

function fieldsOf(body: unknown): AssignmentFields | null {
  const a = (body as { assignment?: unknown } | null)?.assignment;
  return a && typeof a === "object" ? (a as AssignmentFields) : null;
}

/** Checks fields the way Canvas does for the ones DALAA sends; returns an error reply or null. */
function invalid(courseId: number, a: AssignmentFields): Response | null {
  if ("name" in a && (typeof a.name !== "string" || !a.name.trim())) return canvasError(400, "name is invalid");
  if ("points_possible" in a && (typeof a.points_possible !== "number" || a.points_possible < 0))
    return canvasError(400, "points_possible is invalid");
  for (const key of ["due_at", "lock_at"]) {
    const v = a[key];
    if (key in a && v !== null && (typeof v !== "string" || Number.isNaN(Date.parse(v)))) return canvasError(400, `${key} is invalid`);
  }
  if ("assignment_group_id" in a && !PRACTICE_ASSIGNMENT_GROUPS.get(courseId)?.some((g) => g.id === a.assignment_group_id))
    return canvasError(400, "assignment_group_id is invalid");
  return null;
}

function applyFields(target: CanvasAssignment, a: AssignmentFields): CanvasAssignment {
  const next = { ...target };
  if (typeof a.name === "string") next.name = a.name;
  if (typeof a.points_possible === "number") next.points_possible = a.points_possible;
  if ("due_at" in a) next.due_at = (a.due_at as string | null) && new Date(a.due_at as string).toISOString();
  if ("lock_at" in a) next.lock_at = (a.lock_at as string | null) && new Date(a.lock_at as string).toISOString();
  if (typeof a.assignment_group_id === "number") next.assignment_group_id = a.assignment_group_id;
  if (typeof a.published === "boolean") next.published = a.published;
  if (Array.isArray(a.submission_types)) next.submission_types = a.submission_types as string[];
  const tag = a.external_tool_tag_attributes as { url?: unknown; new_tab?: unknown } | undefined;
  if (tag && typeof tag.url === "string") next.external_tool_tag_attributes = { url: tag.url, new_tab: tag.new_tab === true };
  return next;
}

function createAssignment(courseId: number, body: unknown): Response {
  const groups = PRACTICE_ASSIGNMENT_GROUPS.get(courseId);
  if (!groups) return notFound();
  const a = fieldsOf(body);
  if (!a || typeof a.name !== "string") return canvasError(400, "name is required");
  const error = invalid(courseId, a);
  if (error) return error;
  const id = nextAssignmentId++;
  const made = applyFields(
    {
      id,
      name: "",
      points_possible: 0,
      due_at: null,
      lock_at: null,
      assignment_group_id: groups[0].id,
      published: false,
      submission_types: ["none"],
      html_url: `${PRACTICE_PREFIX}/courses/${courseId}/assignments/${id}`,
      external_tool_tag_attributes: null,
    },
    a,
  );
  assignments.set(courseId, [...(assignments.get(courseId) ?? []), made]);
  return json(made, 201);
}

function updateAssignment(courseId: number, id: number, body: unknown): Response {
  const list = assignments.get(courseId) ?? [];
  const at = list.findIndex((x) => x.id === id);
  if (at < 0) return notFound();
  const a = fieldsOf(body);
  if (!a) return canvasError(400, "assignment is required");
  const error = invalid(courseId, a);
  if (error) return error;
  list[at] = applyFields(list[at], a);
  return json(list[at]);
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
