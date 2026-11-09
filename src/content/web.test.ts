import { describe, expect, it } from "vitest";
import { fetchWebPage, isPrivateAddress, mainContent } from "./web";

const html = (body: string, headers: Record<string, string> = {}, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });

describe("isPrivateAddress", () => {
  it("refuses loopback, private, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "128.187.16.242", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("fetchWebPage", () => {
  it("refuses addresses it must not fetch, without fetching", async () => {
    const never = () => Promise.reject(new Error("fetched"));
    for (const [url, says] of [
      ["not a url", "isn't a web address"],
      ["file:///etc/passwd", "https://"],
      ["http://127.0.0.1/admin", "public web pages"],
      ["http://[::1]/", "public web pages"],
      ["http://169.254.169.254/latest/meta-data", "public web pages"],
      ["https://user:pw@8.8.8.8/", "without a username"],
      ["http://8.8.8.8:8080/", "ordinary web pages"],
    ] as const) {
      const r = await fetchWebPage(url, never);
      expect(r.ok || r.reason, url).toContain(says);
    }
  });

  it("saves the title and HTML of a public page", async () => {
    const r = await fetchWebPage("https://8.8.8.8/ruling", async () => html("<title> Refund  ruling </title><p>Ruled.</p>"));
    expect(r).toMatchObject({ ok: true, input: { kind: "web", name: "Refund ruling", url: "https://8.8.8.8/ruling" } });
  });

  it("checks every redirect, refusing one to a private address", async () => {
    const r = await fetchWebPage("https://8.8.8.8/", async () => html("", { location: "http://10.0.0.1/" }, 302));
    expect(r.ok || r.reason).toContain("public web pages");
  });

  it("explains sign-in pages, non-pages and oversize pages", async () => {
    const say = async (res: Response) => {
      const r = await fetchWebPage("https://8.8.8.8/", async () => res);
      return r.ok ? "ok" : r.reason;
    };
    expect(await say(html("", {}, 403))).toContain("needs a sign-in");
    expect(await say(new Response("%PDF", { headers: { "content-type": "application/pdf" } }))).toContain("isn't a web page");
    expect(await say(html("x".repeat(4 * 1024 * 1024 + 1)))).toContain("over 4 MB");
  });
});

describe("mainContent", () => {
  it("keeps the article or main and drops navigation, headers, footers and scripts", () => {
    const page = `<body><nav>Menu</nav><header>Site</header><main><h1>Case method</h1><nav>Contents</nav><p>Students discuss.</p><script>x()</script></main><footer>About</footer></body>`;
    expect(mainContent(page)).toBe("<h1>Case method</h1><p>Students discuss.</p>");
    expect(mainContent("<body><article><p>Only this.</p></article><aside>Ads</aside></body>")).toBe("<p>Only this.</p>");
  });
});
