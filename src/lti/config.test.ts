import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrlFromHeaders, canvasConfig, COURSE_MENU_LABEL, LTI_SCOPES } from "./config";

describe("canvasConfig", () => {
  const config = canvasConfig("https://dalaa-v1.vercel.app/");

  it("points Canvas at DALAA's login, launch and JWKS endpoints", () => {
    expect(config.oidc_initiation_url).toBe("https://dalaa-v1.vercel.app/api/lti/login");
    expect(config.target_link_uri).toBe("https://dalaa-v1.vercel.app/api/lti/launch");
    expect(config.public_jwk_url).toBe("https://dalaa-v1.vercel.app/api/lti/jwks");
    expect(config.extensions[0].domain).toBe("dalaa-v1.vercel.app");
  });

  it("asks for AGS and NRPS and the custom fields the launch reads", () => {
    expect(config.scopes).toEqual(LTI_SCOPES);
    expect(config.scopes).toHaveLength(5);
    expect(config.custom_fields).toEqual({
      login_id: "$Canvas.user.loginId",
      canvas_course_id: "$Canvas.course.id",
      canvas_user_id: "$Canvas.user.id",
    });
  });

  it("is public, with course navigation and assignment selection placements", () => {
    const ext = config.extensions[0];
    expect(ext.privacy_level).toBe("public");
    expect(ext.settings.placements.map((p) => [p.placement, p.message_type])).toEqual([
      ["course_navigation", "LtiResourceLinkRequest"],
      ["assignment_selection", "LtiDeepLinkingRequest"],
    ]);
  });

  it('names the course menu entry "AI Activities"', () => {
    expect(COURSE_MENU_LABEL).toBe("AI Activities");
    expect(config.title).toBe(COURSE_MENU_LABEL);
    const nav = config.extensions[0].settings.placements.find((p) => p.placement === "course_navigation");
    expect(nav?.text).toBe(COURSE_MENU_LABEL);
  });
});

describe("appUrlFromHeaders", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers APP_URL, else the forwarded or local host", () => {
    vi.stubEnv("APP_URL", "");
    expect(appUrlFromHeaders(new Headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(appUrlFromHeaders(new Headers({ host: "x.vercel.app", "x-forwarded-proto": "https" }))).toBe("https://x.vercel.app");
    expect(appUrlFromHeaders(new Headers({ host: "dalaa.example" }))).toBe("https://dalaa.example");
    vi.stubEnv("APP_URL", "https://dalaa-v1.vercel.app");
    expect(appUrlFromHeaders(new Headers({ host: "localhost:3000" }))).toBe("https://dalaa-v1.vercel.app");
  });
});
