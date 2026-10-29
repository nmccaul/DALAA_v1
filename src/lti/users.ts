/**
 * The platform's id for a DALAA user (db/migrations/*_lti_users.sql): what
 * Assignment and Grade Services needs to send a student's score. Only ever
 * looked up by DALAA user; never used to find or create an account.
 */

import type { Db } from "@/db/types";

/**
 * Records that `userId` is `sub` on this platform. The latest wins: a sub
 * held by another account (e.g. a Canvas login renamed and relinked) moves.
 */
export async function rememberLtiUser(tx: Db, platformId: string, userId: string, sub: string): Promise<void> {
  if (!sub) return;
  await tx.query("delete from lti_users where platform_id = $1 and sub = $2 and user_id <> $3", [platformId, sub, userId]);
  await tx.query(
    `insert into lti_users (platform_id, user_id, sub) values ($1, $2, $3)
     on conflict (platform_id, user_id) do update set sub = excluded.sub, updated_at = now()
      where lti_users.sub <> excluded.sub`,
    [platformId, userId, sub],
  );
}

/** The platform's ids for these DALAA users; users it has never seen are left out. */
export async function ltiSubs(db: Db, platformId: string, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.query<{ user_id: string; sub: string }>(
    "select user_id, sub from lti_users where platform_id = $1 and user_id = any($2::uuid[])",
    [platformId, userIds],
  );
  return new Map(rows.map((r) => [r.user_id, r.sub]));
}
