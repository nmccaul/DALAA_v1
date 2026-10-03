/**
 * The only code that speaks HTTP to Canvas (CLAUDE.md, docs/CANVAS.md).
 *
 * The same client talks to real Canvas (byu.instructure.com) and to practice
 * Canvas (this app's /practice-canvas, fake data): only `baseUrl` and `token`
 * differ. Pages and decision logic never call fetch themselves.
 *
 * Never log headers, tokens, or bodies. Errors carry a kind and a status only.
 */

export type CanvasErrorKind =
  | "token-rejected" // 401: show "Reconnect Canvas"
  | "forbidden"
  | "not-found"
  | "rate-limited" // Canvas throttles with 403 as well as 429
  | "unavailable" // network, timeout, 5xx
  | "too-many-pages" // raise rather than return a truncated list
  | "bad-response";

export class CanvasError extends Error {
  constructor(
    readonly kind: CanvasErrorKind,
    readonly status?: number,
  ) {
    super(`Canvas request failed: ${kind}${status ? ` (${status})` : ""}`);
    this.name = "CanvasError";
  }
}

export type CanvasUser = { id: number; name: string };

export type CanvasCourse = {
  id: number;
  name: string;
  course_code: string;
  term?: { name: string; start_at: string | null; end_at: string | null } | null;
  total_students?: number;
};

export type CanvasSection = {
  id: number;
  name: string;
  course_id: number;
  /** Set when the section is cross-listed into this course from another. */
  nonxlist_course_id: number | null;
};

export type CanvasEnrollment = {
  id: number;
  user_id: number;
  course_section_id: number;
  /** "completed" is what Canvas returns for concluded enrollments. */
  enrollment_state: "active" | "invited" | "inactive" | "completed";
  user: {
    id: number;
    name: string;
    sortable_name?: string;
    /** BYU NetID; may be missing if the token can't see it. */
    login_id?: string | null;
    sis_user_id?: string | null;
  };
};

export type CanvasConfig = {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxPages?: number;
};

export type CanvasClient = ReturnType<typeof canvasClient>;

export function canvasClient(config: CanvasConfig) {
  const doFetch = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 20_000;
  const maxPages = config.maxPages ?? 50;
  const base = config.baseUrl.replace(/\/+$/, "");

  async function request(url: string): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch {
      throw new CanvasError("unavailable");
    }
    if (res.ok) return res;
    if (res.status === 401) throw new CanvasError("token-rejected", 401);
    if (res.status === 429) throw new CanvasError("rate-limited", 429);
    if (res.status === 403) {
      const throttled =
        res.headers.get("x-rate-limit-remaining") === "0" ||
        /rate limit/i.test(await res.text().catch(() => ""));
      throw new CanvasError(throttled ? "rate-limited" : "forbidden", 403);
    }
    if (res.status === 404) throw new CanvasError("not-found", 404);
    throw new CanvasError(res.status >= 500 ? "unavailable" : "bad-response", res.status);
  }

  async function getOne<T>(path: string): Promise<T> {
    const res = await request(`${base}${path}`);
    try {
      return (await res.json()) as T;
    } catch {
      throw new CanvasError("bad-response", res.status);
    }
  }

  /** Every page, following Link: rel="next". Raises past maxPages. */
  async function getAll<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let url: string | null = `${base}${path}${path.includes("?") ? "&" : "?"}per_page=100`;
    for (let page = 0; url; page++) {
      if (page >= maxPages) throw new CanvasError("too-many-pages");
      const res: Response = await request(url);
      const body: unknown = await res.json().catch(() => null);
      if (!Array.isArray(body)) throw new CanvasError("bad-response", res.status);
      items.push(...(body as T[]));
      url = nextLink(res.headers.get("link"));
    }
    return items;
  }

  return {
    /** Who the token belongs to. Used to verify a token before storing it. */
    self: () => getOne<CanvasUser>("/api/v1/users/self"),

    /** Courses the token's owner teaches, current and upcoming. */
    coursesTaught: () =>
      getAll<CanvasCourse>(
        "/api/v1/courses?enrollment_type=teacher&state[]=available&state[]=unpublished" +
          "&include[]=term&include[]=total_students",
      ),

    sections: (courseId: number) => getAll<CanvasSection>(`/api/v1/courses/${courseId}/sections`),

    /** Student enrollments, including concluded ones (Canvas says "completed"). */
    studentEnrollments: (courseId: number) =>
      getAll<CanvasEnrollment>(
        `/api/v1/courses/${courseId}/enrollments?type[]=StudentEnrollment` +
          "&state[]=active&state[]=invited&state[]=completed&state[]=inactive",
      ),
  };
}

/** The rel="next" URL from a Link header, or null. */
export function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (match) return match[1];
  }
  return null;
}
