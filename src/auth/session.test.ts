import { describe, expect, it } from "vitest";
import { SESSION_SECONDS, signSession, verifySession } from "./session";

const secret = "s".repeat(32);
const now = 1_800_000_000;

describe("session cookie", () => {
  it("round-trips the user id until it expires", () => {
    const token = signSession("user-1", secret, now);
    expect(verifySession(token, secret, now + 60)).toBe("user-1");
    expect(verifySession(token, secret, now + SESSION_SECONDS)).toBeNull();
  });

  it("rejects a tampered user id, expiry, or signature", () => {
    const [, expires, sig] = signSession("user-1", secret, now).split(".");
    expect(verifySession(`user-2.${expires}.${sig}`, secret, now)).toBeNull();
    expect(verifySession(`user-1.${Number(expires) + 9999}.${sig}`, secret, now)).toBeNull();
    expect(verifySession(`user-1.${expires}.x${sig.slice(1)}`, secret, now)).toBeNull();
  });

  it("rejects a cookie signed with another secret, or garbage", () => {
    expect(verifySession(signSession("user-1", "t".repeat(32), now), secret, now)).toBeNull();
    for (const bad of [undefined, "", "a.b", "a.b.c.d", "user-1.NaN.sig"]) {
      expect(verifySession(bad, secret, now)).toBeNull();
    }
  });
});
