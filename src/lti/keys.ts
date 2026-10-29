/**
 * DALAA's own signing key for LTI (D-020): it signs deep-linking responses and
 * service-token assertions, and Canvas fetches the public half from
 * /api/lti/jwks. The key is LTI_PRIVATE_KEY (base64 of a PKCS8 PEM RSA key) in
 * the environment, never in the database or the repo.
 *
 * The `kid` is the RFC 7638 thumbprint of the public key, so it is stable across
 * deploys and changes only when the key does.
 */

import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { calculateJwkThumbprint, type JWK } from "jose";

export const LTI_SIGNING_ALG = "RS256";

export class LtiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LtiKeyError";
  }
}

export type ToolKey = {
  kid: string;
  privateKey: KeyObject;
  /** Public parts only: kty, n, e, plus kid/alg/use. */
  publicJwk: JWK;
};

/** Parses the key; throws LtiKeyError (never echoing the value) when it isn't an RSA private key. */
export async function loadToolKey(base64Pem: string | undefined): Promise<ToolKey> {
  const pem = base64Pem ? Buffer.from(base64Pem.trim(), "base64").toString("utf8") : "";
  if (!pem.includes("PRIVATE KEY")) {
    throw new LtiKeyError("LTI_PRIVATE_KEY must be a base64-encoded PKCS8 PEM RSA private key");
  }
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(pem);
  } catch {
    throw new LtiKeyError("LTI_PRIVATE_KEY could not be read as a private key");
  }
  if (privateKey.asymmetricKeyType !== "rsa") {
    throw new LtiKeyError("LTI_PRIVATE_KEY must be an RSA key");
  }
  const { kty, n, e } = createPublicKey(privateKey).export({ format: "jwk" });
  const kid = await calculateJwkThumbprint({ kty, n, e });
  return { kid, privateKey, publicJwk: { kty, n, e, kid, alg: LTI_SIGNING_ALG, use: "sig" } };
}

let cached: Promise<ToolKey> | null = null;

/** The key from the environment, parsed once per process. */
export function toolKey(): Promise<ToolKey> {
  if (!cached) {
    cached = loadToolKey(process.env.LTI_PRIVATE_KEY);
    cached.catch(() => (cached = null));
  }
  return cached;
}
