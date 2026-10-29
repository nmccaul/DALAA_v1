/**
 * The Canvas LTI 1.3 JSON configuration for DALAA (served at /api/lti/config).
 * It matches the developer key already installed on gitgrade (ralph/PLAN.md),
 * so an admin can paste this URL to set up another Canvas the same way.
 */

export const LTI_SCOPES = [
  "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
  "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly",
  "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
  "https://purl.imsglobal.org/spec/lti-ags/scope/score",
  "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly",
];

/** DALAA's LTI endpoints under `appUrl`, the public origin, e.g. https://dalaa-v1.vercel.app. */
export function ltiUrls(appUrl: string) {
  const base = appUrl.replace(/\/+$/, "");
  return {
    base,
    login: `${base}/api/lti/login`,
    launch: `${base}/api/lti/launch`,
    jwks: `${base}/api/lti/jwks`,
  };
}

/** The public origin for a request: APP_URL when set, else the request's own. */
export function appUrl(request: Request): string {
  return process.env.APP_URL?.trim() || new URL(request.url).origin;
}

export function canvasConfig(appUrl: string) {
  const { base, login, launch, jwks } = ltiUrls(appUrl);
  return {
    title: "DALAA",
    description: "AI-assisted learning activities: students study, chat and get feedback; grades go to the Canvas gradebook.",
    oidc_initiation_url: login,
    target_link_uri: launch,
    public_jwk_url: jwks,
    scopes: LTI_SCOPES,
    custom_fields: {
      login_id: "$Canvas.user.loginId",
      canvas_course_id: "$Canvas.course.id",
      canvas_user_id: "$Canvas.user.id",
    },
    extensions: [
      {
        domain: new URL(base).host,
        platform: "canvas.instructure.com",
        privacy_level: "public",
        settings: {
          text: "DALAA",
          placements: [
            {
              placement: "course_navigation",
              message_type: "LtiResourceLinkRequest",
              target_link_uri: launch,
              text: "DALAA",
            },
            {
              placement: "assignment_selection",
              message_type: "LtiDeepLinkingRequest",
              target_link_uri: launch,
              text: "DALAA Study Chat",
            },
          ],
        },
      },
    ],
  };
}
