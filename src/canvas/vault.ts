/**
 * Encrypts teachers' Canvas tokens at rest (docs/CANVAS.md "Token vault").
 * AES-256-GCM; the key is CANVAS_TOKEN_KEY (32 bytes, base64) in the
 * environment, never in the database. A database copy alone reveals nothing.
 *
 * A token that can't be decrypted (key rotated, row tampered) is a VaultError,
 * which the UI turns into "reconnect Canvas", never a crash.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultError";
  }
}

function key(): Buffer {
  const raw = process.env.CANVAS_TOKEN_KEY;
  const bytes = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (bytes.length !== 32) {
    throw new VaultError("CANVAS_TOKEN_KEY must be 32 bytes, base64 (openssl rand -base64 32)");
  }
  return bytes;
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function sealToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function openToken(sealed: string): string {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new VaultError("Unreadable token");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new VaultError("Token can't be decrypted");
  }
}
