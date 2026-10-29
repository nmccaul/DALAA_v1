import { describe, expect, it } from "vitest";
import { CanvasError } from "./client";
import { authorizeUrl, exchangeCode, oauthRedirectUri, refreshAccessToken, type OAuthApp } from "./oauth";

const app: OAuthApp = { baseUrl: "https://canvas.test", clientId: "10000000000014", clientSecret: "shh" };
const NOW = Date.UTC(2026, 9, 29, 12);

/** A fake token endpoint that records what it was sent. */
function tokenEndpoint(status: number, body: unknown) {
  const sent: { url: string; form: URLSearchParams }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    sent.push({ url: String(url), form: new URLSearchParams(String(init?.body)) });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { fetch, sent, now: () => NOW };
}

describe("canvas oauth", () => {
  it("builds the authorize URL with DALAA's own redirect URI", () => {
    const url = new URL(authorizeUrl(app, "s".repeat(43), oauthRedirectUri("https://dalaa.test/")));
    expect(url.origin + url.pathname).toBe("https://canvas.test/login/oauth2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "10000000000014",
      response_type: "code",
      state: "s".repeat(43),
      redirect_uri: "https://dalaa.test/api/canvas/oauth/callback",
    });
  });

  it("trades a code for tokens, with the expiry and the Canvas user", async () => {
    const endpoint = tokenEndpoint(200, {
      access_token: "access-1234",
      refresh_token: "refresh-5678",
      expires_in: 3600,
      user: { id: 140, name: "Nathan" },
    });
    const tokens = await exchangeCode(app, "the-code", "https://dalaa.test/api/canvas/oauth/callback", endpoint);
    expect(tokens).toEqual({
      accessToken: "access-1234",
      refreshToken: "refresh-5678",
      expiresAt: new Date(NOW + 3_600_000),
      user: { id: 140, name: "Nathan" },
    });
    expect(endpoint.sent[0].url).toBe("https://canvas.test/login/oauth2/token");
    expect(Object.fromEntries(endpoint.sent[0].form)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: "https://dalaa.test/api/canvas/oauth/callback",
      client_id: "10000000000014",
      client_secret: "shh",
    });
  });

  it("refreshes without a new refresh token, and NULL expiry when Canvas gives none", async () => {
    const endpoint = tokenEndpoint(200, { access_token: "access-2" });
    expect(await refreshAccessToken(app, "refresh-5678", endpoint)).toEqual({
      accessToken: "access-2",
      refreshToken: null,
      expiresAt: null,
      user: null,
    });
    expect(endpoint.sent[0].form.get("grant_type")).toBe("refresh_token");
    expect(endpoint.sent[0].form.get("refresh_token")).toBe("refresh-5678");
  });

  it("a refused code or refresh token is token-rejected; outages and junk are not", async () => {
    const cases: [number, unknown, string][] = [
      [400, { error: "invalid_grant" }, "token-rejected"],
      [401, { error: "invalid_client" }, "token-rejected"],
      [503, {}, "unavailable"],
      [200, { nope: true }, "bad-response"],
    ];
    for (const [status, body, kind] of cases) {
      await expect(refreshAccessToken(app, "r", tokenEndpoint(status, body))).rejects.toMatchObject({ kind });
    }
    const offline = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    await expect(exchangeCode(app, "c", "https://x/cb", { fetch: offline })).rejects.toBeInstanceOf(CanvasError);
  });
});
