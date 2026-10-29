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

/** `appUrl` is the public origin DALAA is served from, e.g. https://dalaa-v1.vercel.app. */
export function canvasConfig(appUrl: string) {
  const base = appUrl.replace(/\/+$/, "");
  const launch = `${base}/api/lti/launch`;
  return {
    title: "DALAA",
    description: "AI-assisted learning activities: students study, chat and get feedback; grades go to the Canvas gradebook.",
    oidc_initiation_url: `${base}/api/lti/login`,
    target_link_uri: launch,
    public_jwk_url: `${base}/api/lti/jwks`,
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
