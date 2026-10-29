import { generateKeyPairSync } from "node:crypto";
import { compactVerify, CompactSign, importJWK } from "jose";
import { describe, expect, it } from "vitest";
import { LtiKeyError, loadToolKey } from "./keys";

const pem = (type: "rsa" | "ec") =>
  (type === "rsa"
    ? generateKeyPairSync("rsa", { modulusLength: 2048 })
    : generateKeyPairSync("ec", { namedCurve: "P-256" })
  ).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("loadToolKey", () => {
  const rsa = b64(pem("rsa"));

  it("derives a public JWK with no private parts", async () => {
    const { publicJwk } = await loadToolKey(rsa);
    expect(Object.keys(publicJwk).sort()).toEqual(["alg", "e", "kid", "kty", "n", "use"]);
    expect(publicJwk).toMatchObject({ kty: "RSA", alg: "RS256", use: "sig" });
  });

  it("gives the same kid every time for the same key, a different one for another key", async () => {
    const a = await loadToolKey(rsa);
    const b = await loadToolKey(rsa);
    const other = await loadToolKey(b64(pem("rsa")));
    expect(a.kid).toBe(b.kid);
    expect(a.kid).toBe(a.publicJwk.kid);
    expect(other.kid).not.toBe(a.kid);
  });

  it("signs with the private key so the public JWK verifies it", async () => {
    const { privateKey, publicJwk } = await loadToolKey(rsa);
    const jws = await new CompactSign(new TextEncoder().encode("hi"))
      .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
      .sign(privateKey);
    const { payload } = await compactVerify(jws, await importJWK(publicJwk, "RS256"));
    expect(new TextDecoder().decode(payload)).toBe("hi");
  });

  it("refuses a missing, malformed or non-RSA key", async () => {
    await expect(loadToolKey(undefined)).rejects.toBeInstanceOf(LtiKeyError);
    await expect(loadToolKey(b64("not a key"))).rejects.toBeInstanceOf(LtiKeyError);
    await expect(loadToolKey(b64("-----BEGIN PRIVATE KEY-----\ngarbage\n-----END PRIVATE KEY-----"))).rejects.toBeInstanceOf(LtiKeyError);
    await expect(loadToolKey(b64(pem("ec")))).rejects.toThrow("must be an RSA key");
  });
});
