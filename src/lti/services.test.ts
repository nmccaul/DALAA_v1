import { generateKeyPairSync } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CanvasError } from "@/canvas/client";
import { loadToolKey, type ToolKey } from "./keys";
import type { Platform } from "./registration";
import { forgetServiceTokens, NRPS_SCOPE, serviceToken } from "./services";

const platform: Platform = {
  id: "p1",
  institutionId: "i1",
  issuer: "https://canvas.instructure.com",
  clientId: "10000000000013",
  authUrl: "https://canvas.example.edu/api/lti/authorize_redirect",
  tokenUrl: "https://canvas.example.edu/login/oauth2/token",
  jwksUrl: "https://canvas.example.edu/api/lti/security/jwks",
};

let key: ToolKey;
beforeAll(async () => {
  const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
  key = await loadToolKey(Buffer.from(pem as string).toString("base64"));
});
beforeEach(() => forgetServiceTokens());

/** A token endpoint that records each request and answers with `reply`. */
function tokenEndpoint(reply: () => Response) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: new URLSearchParams(String(init?.body)) });
    return reply();
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}
const granted = (expires_in = 3600) => () => Response.json({ access_token: "tok-1", token_type: "Bearer", expires_in });

describe("serviceToken", () => {
  it("presents a signed client assertion and the scopes", async () => {
    const t = tokenEndpoint(granted());
    expect(await serviceToken(platform, [NRPS_SCOPE], { fetch: t.fetch, key })).toBe("tok-1");
    const [{ url, body }] = t.calls;
    expect(url).toBe(platform.tokenUrl);
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_assertion_type")).toBe("urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    expect(body.get("scope")).toBe(NRPS_SCOPE);

    const { payload, protectedHeader } = await jwtVerify(body.get("client_assertion")!, createLocalJWKSet({ keys: [key.publicJwk] }), {
      issuer: platform.clientId,
      subject: platform.clientId,
      audience: platform.tokenUrl,
    });
    expect(protectedHeader).toMatchObject({ alg: "RS256", kid: key.kid });
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(300);
    expect(payload.jti).toBeTruthy();
  });

  it("reuses a token until a minute before it expires", async () => {
    let now = 1_000_000;
    const t = tokenEndpoint(granted(120));
    const deps = { fetch: t.fetch, key, now: () => now };
    await serviceToken(platform, [NRPS_SCOPE], deps);
    now += 59_000;
    await serviceToken(platform, [NRPS_SCOPE], deps);
    expect(t.calls).toHaveLength(1);
    now += 2_000;
    await serviceToken(platform, [NRPS_SCOPE], deps);
    expect(t.calls).toHaveLength(2);
  });

  it("keeps separate tokens per scope set", async () => {
    const t = tokenEndpoint(granted());
    await serviceToken(platform, [NRPS_SCOPE], { fetch: t.fetch, key });
    await serviceToken(platform, [NRPS_SCOPE, "https://purl.imsglobal.org/spec/lti-ags/scope/score"], { fetch: t.fetch, key });
    expect(t.calls).toHaveLength(2);
  });

  it("says forbidden when Canvas refuses, and caches nothing", async () => {
    const t = tokenEndpoint(() => Response.json({ error: "invalid_scope" }, { status: 400 }));
    const err = await serviceToken(platform, [NRPS_SCOPE], { fetch: t.fetch, key }).catch((e) => e);
    expect(err).toBeInstanceOf(CanvasError);
    expect((err as CanvasError).kind).toBe("forbidden");
    await serviceToken(platform, [NRPS_SCOPE], { fetch: t.fetch, key }).catch(() => {});
    expect(t.calls).toHaveLength(2);
  });

  it("says unavailable on a network failure or 5xx, bad-response on a body without a token", async () => {
    const kind = (fetch: typeof globalThis.fetch) =>
      serviceToken(platform, [NRPS_SCOPE], { fetch, key }).catch((e: CanvasError) => e.kind);
    expect(await kind((async () => { throw new Error("down"); }) as typeof fetch)).toBe("unavailable");
    expect(await kind(tokenEndpoint(() => new Response("", { status: 502 })).fetch)).toBe("unavailable");
    expect(await kind(tokenEndpoint(() => Response.json({ token_type: "Bearer" })).fetch)).toBe("bad-response");
  });
});
