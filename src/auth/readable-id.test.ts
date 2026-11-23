import { describe, expect, it } from "vitest";
import { readableLoginId } from "./readable-id";

describe("readableLoginId", () => {
  it("keeps NetIDs and emails, drops Canvas's opaque hashes", () => {
    expect(readableLoginId("ralph.t04")).toBe("ralph.t04");
    expect(readableLoginId("jane@byu.edu")).toBe("jane@byu.edu");
    expect(readableLoginId("2d70bfd84183db91ee0521b15491a964fca98415")).toBeNull();
    expect(readableLoginId(" ")).toBeNull();
  });
});
