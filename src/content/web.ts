/**
 * Materials → Add a web page: fetch a public page and keep a copy of its text
 * (D-032 mockup). The server fetches an address a teacher typed, so it only
 * goes to public http(s) hosts: every address a name resolves to, and every
 * redirect, is checked before we connect. Every refusal is a sentence the
 * teacher can act on.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { MAX_UPLOAD_BYTES, type ContentInput } from "./read";

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export type WebFetch = { ok: true; input: ContentInput & { kind: "web" } } | { ok: false; reason: string };

/** Whether an IP address is private, loopback, link-local or otherwise not the public internet. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::" || v6 === "::1" ||
    v6.startsWith("fc") || v6.startsWith("fd") || // unique local
    /^fe[89ab]/.test(v6) || // link-local
    v6.startsWith("ff") || // multicast
    v6.startsWith("64:ff9b:") // NAT64 can reach private IPv4
  );
}

/** The parsed address if it's one we may fetch, else a reason. */
async function checkAddress(raw: string): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That isn't a web address. Copy it from your browser's address bar." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Use a web address that starts with https://." };
  }
  if (url.username || url.password) return { ok: false, reason: "Use the page's address without a username or password." };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "DALAA can only fetch ordinary web pages." };

  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
  } catch {
    return { ok: false, reason: `We couldn't find ${url.hostname}. Check the address.` };
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    return { ok: false, reason: "DALAA can only fetch public web pages." };
  }
  return { ok: true, url };
}

/** The body as text, refusing more than the upload limit. */
async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/**
 * The part of a page worth reading: its <article> or <main> if it has one,
 * else <body>, without navigation, headers, footers, sidebars, forms or scripts.
 * Exported for tests.
 */
export function mainContent(html: string): string {
  const pick = (tag: string) => new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*)</${tag}>`, "i").exec(html)?.[1];
  const main = pick("article") ?? pick("main") ?? pick("body") ?? html;
  return ["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "template"].reduce(
    (h, tag) => h.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "gi"), ""),
    main,
  );
}

function titleOf(html: string, url: URL): string {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title = m?.[1].replace(/\s+/g, " ").trim();
  return title || url.hostname + url.pathname.replace(/\/$/, "");
}

/** Fetches a public web page as content to save, following up to three checked redirects. */
export async function fetchWebPage(address: string, fetcher: typeof fetch = fetch): Promise<WebFetch> {
  let next = address;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = await checkAddress(next);
    if (!checked.ok) return checked;
    const url = checked.url;

    let res: Response;
    try {
      res = await fetcher(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "DALAA material fetcher" },
      });
    } catch {
      return { ok: false, reason: `${url.hostname} didn't answer. Try again, or paste the page's text instead.` };
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      next = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    if (!res.ok) {
      return {
        ok: false,
        reason:
          res.status === 401 || res.status === 403
            ? "That page needs a sign-in, so DALAA can't read it. Paste its text instead."
            : `${url.hostname} said the page isn't available (${res.status}). Check the address.`,
      };
    }
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!type.includes("text/html") && !type.includes("text/plain")) {
      return { ok: false, reason: "That address isn't a web page. For a PDF or Word file, download it and use Upload a file." };
    }
    const body = await readCapped(res);
    if (body === null) return { ok: false, reason: "That page is over 4 MB. Paste the part students need instead." };

    const html = type.includes("text/html") ? mainContent(body) : `<pre>${body.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</pre>`;
    return { ok: true, input: { kind: "web", name: titleOf(body, url), html, url: url.toString() } };
  }
  return { ok: false, reason: "That address redirects too many times. Use the page's final address." };
}
