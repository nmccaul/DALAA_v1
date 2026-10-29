import { describe, expect, it } from "vitest";
import { usesNetIds } from "@/canvas/institution";
import { loginIdLabel } from "./login-id";

describe("loginIdLabel", () => {
  it("says NetID only on BYU's Canvas", () => {
    expect(usesNetIds("https://byu.instructure.com")).toBe(true);
    expect(usesNetIds("https://byu.instructure.com/")).toBe(true);
    expect(usesNetIds("https://canvas.gitgrade.example")).toBe(false);
    expect(usesNetIds("https://byu.instructure.com.evil.example")).toBe(false);
  });

  it("gives every form of the word", () => {
    expect(loginIdLabel(true)).toEqual({ title: "NetID", noun: "NetID", plural: "NetIDs" });
    expect(loginIdLabel(false)).toEqual({ title: "Login ID", noun: "login ID", plural: "login IDs" });
  });
});
