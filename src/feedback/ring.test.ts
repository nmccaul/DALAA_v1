import { describe, expect, it } from "vitest";
import { ReportContext, RING_SIZE } from "./report";
import { installRing, type RingTarget } from "./ring";

function fakeWindow() {
  const listeners: Record<string, ((event: Event) => void)[]> = {};
  const printed: unknown[][] = [];
  const target: RingTarget = {
    console: { warn: (...a: unknown[]) => printed.push(a), error: (...a: unknown[]) => printed.push(a) },
    addEventListener: (type, listener) => (listeners[type] ??= []).push(listener),
  };
  const fire = (type: string, event: object) => listeners[type]?.forEach((l) => l(event as Event));
  return { target, fire, printed };
}

describe("installRing", () => {
  it("remembers warnings and errors and still prints them", () => {
    const { target, printed } = fakeWindow();
    const snapshot = installRing(target, () => 7);
    target.console.warn("slow", { ms: 900 });
    target.console.error(new Error("boom"));
    expect(printed).toHaveLength(2);
    expect(snapshot().console).toEqual([
      { t: 7, level: "warn", text: 'slow {"ms":900}' },
      { t: 7, level: "error", text: "Error: boom" },
    ]);
  });

  it("records thrown errors and unhandled rejections with their stacks", () => {
    const { target, fire } = fakeWindow();
    const snapshot = installRing(target);
    const error = new TypeError("x is undefined");
    fire("error", { error, message: "ignored" });
    fire("error", { error: null, message: "Script error." });
    fire("unhandledrejection", { reason: "nope" });
    const { errors } = snapshot();
    expect(errors.map((e) => e.message)).toEqual(["TypeError: x is undefined", "Script error.", "Unhandled rejection: nope"]);
    expect(errors[0].stack).toContain("x is undefined");
    expect(errors[2].stack).toBeNull();
  });

  it("keeps only the most recent entries", () => {
    const { target } = fakeWindow();
    const snapshot = installRing(target);
    for (let i = 0; i < RING_SIZE + 5; i++) target.console.warn(`w${i}`);
    const lines = snapshot().console;
    expect(lines).toHaveLength(RING_SIZE);
    expect(lines.at(-1)?.text).toBe(`w${RING_SIZE + 4}`);
  });

  it("installs once per window", () => {
    const { target, printed } = fakeWindow();
    const first = installRing(target);
    const second = installRing(target);
    target.console.warn("once");
    expect(second).toBe(first);
    expect(printed).toHaveLength(1);
    expect(first().console).toHaveLength(1);
  });

  it("produces what the report shape accepts", () => {
    const { target, fire } = fakeWindow();
    const snapshot = installRing(target);
    target.console.error("token=abcdefghijklmnopqrstuvwxyz0123456789");
    fire("error", { error: new Error("bad") });
    const parsed = ReportContext.parse({
      title: "t",
      userAgent: "ua",
      viewport: { w: 390, h: 800, dpr: 2 },
      colorScheme: "dark",
      ...snapshot(),
    });
    expect(parsed.console[0].text).not.toContain("abcdefghijklmnop");
    expect(parsed.errors).toHaveLength(1);
  });

  it("survives values that can't be turned into JSON", () => {
    const { target } = fakeWindow();
    const snapshot = installRing(target);
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(() => target.console.warn(loop, BigInt(10))).not.toThrow();
    expect(snapshot().console[0].text).toContain("[object Object]");
  });
});
