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
  | "too-large" // a download past the caller's byte limit
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

/** A wiki page as listed; the list has no body. `url` is the page's slug, used to fetch it. */
export type CanvasPage = {
  page_id: number;
  url: string;
  title: string;
  updated_at: string;
  published: boolean;
};

export type CanvasPageWithBody = CanvasPage & { body: string | null };

export type CanvasFile = {
  id: number;
  display_name: string;
  filename: string;
  "content-type": string;
  size: number;
  /** A download link with a verifier; on real Canvas it redirects to file storage. */
  url: string;
  updated_at: string;
};

/** A member of a course from LTI Names and Role Provisioning (NRPS v2). */
export type NrpsMember = {
  user_id: string;
  /** Missing means Active (NRPS v2). */
  status?: "Active" | "Inactive" | "Deleted";
  name?: string;
  email?: string;
  roles: string[];
  /** Present when asked for a resource link: carries custom fields such as login_id. */
  message?: Record<string, unknown>[];
};

const AGS_LINE_ITEM = "application/vnd.ims.lis.v2.lineitem+json";
const AGS_LINE_ITEMS = "application/vnd.ims.lis.v2.lineitemcontainer+json";

/** A gradebook column from LTI Assignment and Grade Services (AGS v2). `id` is its absolute URL. */
export type AgsLineItem = { id: string; scoreMaximum: number; label: string; resourceId?: string };

/** A score Canvas holds. `userId` is the platform's id (the launch `sub`). */
export type AgsResult = { userId: string; resultScore?: number | null; resultMaximum?: number };

/** What DALAA sends for one student (AGS score publish service). */
export type AgsScore = {
  userId: string;
  scoreGiven: number;
  scoreMaximum: number;
  timestamp: string;
  activityProgress: "Completed";
  gradingProgress: "FullyGraded";
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

  async function request(url: string, accept = "application/json", send?: { type: string; body: unknown }): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(url, {
        method: send ? "POST" : "GET",
        headers: { Authorization: `Bearer ${config.token}`, Accept: accept, ...(send && { "Content-Type": send.type }) },
        body: send ? JSON.stringify(send.body) : undefined,
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

  /**
   * A file's bytes, from the download URL Canvas gave us. Only URLs on this
   * Canvas are fetched; fetch drops the token if Canvas redirects to another
   * host (file storage). Stops reading past `maxBytes` rather than buffering it.
   */
  async function download(fileUrl: string, maxBytes: number): Promise<Uint8Array> {
    let url: URL;
    try {
      url = new URL(fileUrl);
    } catch {
      throw new CanvasError("bad-response");
    }
    if (url.origin !== new URL(base).origin) throw new CanvasError("bad-response");
    const res = await request(url.toString(), "*/*");
    const declared = Number(res.headers.get("content-length"));
    if (declared > maxBytes) {
      await res.body?.cancel();
      throw new CanvasError("too-large");
    }
    if (!res.body) return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new CanvasError("too-large");
        }
        chunks.push(value);
      }
    } catch (e) {
      throw e instanceof CanvasError ? e : new CanvasError("unavailable");
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.byteLength;
    }
    return bytes;
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

  /** An absolute URL on this Canvas; LTI service tokens go nowhere else. */
  function onThisCanvas(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new CanvasError("bad-response");
    }
    if (parsed.origin !== new URL(base).origin) throw new CanvasError("bad-response");
    return parsed.toString();
  }

  /** Every page of an LTI service list from an absolute URL, following Link: rel="next". */
  async function serviceList<T>(url: string, accept: string, items: (body: unknown) => unknown): Promise<T[]> {
    const all: T[] = [];
    let next: string | null = onThisCanvas(url);
    for (let page = 0; next; page++) {
      if (page >= maxPages) throw new CanvasError("too-many-pages");
      const res: Response = await request(onThisCanvas(next), accept);
      const list = items(await res.json().catch(() => null));
      if (!Array.isArray(list)) throw new CanvasError("bad-response", res.status);
      all.push(...(list as T[]));
      next = nextLink(res.headers.get("link"));
    }
    return all;
  }

  /** Every NRPS page from an absolute memberships URL. */
  const nrpsMembers = async (url: string) =>
    serviceList<NrpsMember>(url, "application/vnd.ims.lti-nrps.v2.membershipcontainer+json", (body) =>
      (body as { members?: unknown } | null)?.members,
    );

  async function lineItemFrom(res: Response): Promise<AgsLineItem> {
    const item = (await res.json().catch(() => null)) as Partial<AgsLineItem> | null;
    if (typeof item?.id !== "string" || typeof item.scoreMaximum !== "number") throw new CanvasError("bad-response", res.status);
    return item as AgsLineItem;
  }

  const ags = {
    /** One gradebook column, from its absolute URL. */
    lineItem: async (url: string) => lineItemFrom(await request(onThisCanvas(url), AGS_LINE_ITEM)),

    /** The course's columns made for this resource (an activity id), from the context's lineitems URL. */
    lineItemsFor: async (lineItemsUrl: string, resourceId: string) =>
      serviceList<AgsLineItem>(withParam(onThisCanvas(lineItemsUrl), "resource_id", resourceId), AGS_LINE_ITEMS, (body) => body),

    /** Makes a gradebook column. Only a 2xx with the new column's URL counts as made. */
    createLineItem: async (lineItemsUrl: string, item: Omit<AgsLineItem, "id">) =>
      lineItemFrom(await request(onThisCanvas(lineItemsUrl), AGS_LINE_ITEM, { type: AGS_LINE_ITEM, body: item })),

    /** The scores Canvas holds in a column. A result without `resultScore` has none. */
    results: async (lineItemUrl: string) =>
      serviceList<AgsResult>(servicePath(onThisCanvas(lineItemUrl), "results"), "application/vnd.ims.lis.v2.resultcontainer+json", (body) => body),

    /** Sends one student's score. Resolves only when Canvas answers 2xx: the one sign it's confirmed. */
    postScore: async (lineItemUrl: string, score: AgsScore): Promise<void> => {
      const res = await request(servicePath(onThisCanvas(lineItemUrl), "scores"), "application/json", {
        type: "application/vnd.ims.lis.v1.score+json",
        body: score,
      });
      await res.body?.cancel();
    },
  };

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

    /** Every wiki page in the course, published or not (teachers often hide a case until class). */
    pages: (courseId: number) => getAll<CanvasPage>(`/api/v1/courses/${courseId}/pages?sort=title`),

    /** One page with its HTML body. */
    page: (courseId: number, pageUrl: string) =>
      getOne<CanvasPageWithBody>(`/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`),

    /** Every file in the course. Filtered by name, not content type: Canvas types .md files inconsistently. */
    files: (courseId: number) => getAll<CanvasFile>(`/api/v1/courses/${courseId}/files?sort=name`),

    file: (courseId: number, fileId: number) => getOne<CanvasFile>(`/api/v1/courses/${courseId}/files/${fileId}`),

    download,

    /** The class list through LTI NRPS; the token is an LTI service token (src/lti/services.ts). */
    nrpsMembers,

    /** The gradebook through LTI Assignment and Grade Services; the token is an LTI service token. */
    ags,
  };
}

/** The rel="next" URL from a Link header, or null. */
/** `/results` or `/scores` under a line item URL, keeping its query string (AGS v2). */
export function servicePath(lineItemUrl: string, service: "results" | "scores"): string {
  const url = new URL(lineItemUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${service}`;
  return url.toString();
}

function withParam(url: string, name: string, value: string): string {
  const u = new URL(url);
  u.searchParams.set(name, value);
  return u.toString();
}

export function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (match) return match[1];
  }
  return null;
}
