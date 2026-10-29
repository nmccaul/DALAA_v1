/**
 * Which Canvas may launch DALAA (D-020). The registration is configuration
 * (LTI_PLATFORM_URL, LTI_CLIENT_ID, LTI_DEPLOYMENT_ID) and is upserted into
 * `lti_platforms` / `lti_deployments` on first use, so the launch code always
 * reads one place: the database.
 *
 * Self-hosted Canvas usually signs as https://canvas.instructure.com while its
 * endpoints live on its own host, so both issuers are allowed; anything else is
 * refused. The endpoints always come from LTI_PLATFORM_URL, never from the
 * request.
 */

import type { Db } from "@/db/types";

export const CANVAS_CLOUD_ISSUER = "https://canvas.instructure.com";

export type Registration = {
  /** Issuers a login request may name. */
  issuers: string[];
  clientId: string;
  deploymentIds: string[];
  authUrl: string;
  tokenUrl: string;
  jwksUrl: string;
};

export type Platform = {
  id: string;
  institutionId: string;
  issuer: string;
  clientId: string;
  authUrl: string;
  tokenUrl: string;
  jwksUrl: string;
};

/** The registration from the environment, or null when LTI isn't configured. */
export function envRegistration(env: Record<string, string | undefined> = process.env): Registration | null {
  const platformUrl = env.LTI_PLATFORM_URL?.trim().replace(/\/+$/, "");
  const clientId = env.LTI_CLIENT_ID?.trim();
  const deploymentIds = (env.LTI_DEPLOYMENT_ID ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (!platformUrl || !clientId || deploymentIds.length === 0) return null;
  return {
    issuers: [...new Set([CANVAS_CLOUD_ISSUER, platformUrl])],
    clientId,
    deploymentIds,
    authUrl: `${platformUrl}/api/lti/authorize_redirect`,
    tokenUrl: `${platformUrl}/login/oauth2/token`,
    jwksUrl: `${platformUrl}/api/lti/security/jwks`,
  };
}

export type PlatformRow = {
  id: string;
  institution_id: string;
  issuer: string;
  client_id: string;
  auth_url: string;
  token_url: string;
  jwks_url: string;
};

export const toPlatform = (r: PlatformRow): Platform => ({
  id: r.id,
  institutionId: r.institution_id,
  issuer: r.issuer,
  clientId: r.client_id,
  authUrl: r.auth_url,
  tokenUrl: r.token_url,
  jwksUrl: r.jwks_url,
});

/**
 * The platform for this issuer and client, upserted from the registration with
 * its deployments. Null when the issuer isn't allowed or the client id isn't
 * ours: the caller refuses the request.
 */
export async function ensurePlatform(
  db: Db,
  institutionId: string,
  reg: Registration,
  issuer: string,
  clientId: string,
): Promise<Platform | null> {
  if (!reg.issuers.includes(issuer) || clientId !== reg.clientId) return null;
  return db.transaction(async (tx) => {
    const [row] = await tx.query<PlatformRow>(
      `insert into lti_platforms (institution_id, issuer, client_id, auth_url, token_url, jwks_url)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (issuer, client_id) do update
         set auth_url = excluded.auth_url, token_url = excluded.token_url, jwks_url = excluded.jwks_url
       returning id, institution_id, issuer, client_id, auth_url, token_url, jwks_url`,
      [institutionId, issuer, clientId, reg.authUrl, reg.tokenUrl, reg.jwksUrl],
    );
    for (const deploymentId of reg.deploymentIds) {
      await tx.query(
        `insert into lti_deployments (platform_id, deployment_id) values ($1, $2)
         on conflict (platform_id, deployment_id) do nothing`,
        [row.id, deploymentId],
      );
    }
    return toPlatform(row);
  });
}

/** Whether a launch's deployment_id is one this platform installed. */
export async function isKnownDeployment(db: Db, platformId: string, deploymentId: string): Promise<boolean> {
  const rows = await db.query(
    "select 1 from lti_deployments where platform_id = $1 and deployment_id = $2",
    [platformId, deploymentId],
  );
  return rows.length > 0;
}
