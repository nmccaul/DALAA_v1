/**
 * Disputes, for every tool: a student asks their teacher to look at a graded
 * attempt again, with a reason; the teacher resolves it, changing the score
 * or not (db/migrations/*_disputes.sql). The grader's score is never changed.
 */

import { and, coursesTakenBy, coursesTaughtBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { countedScore } from "./store";
import { setTeacherScore } from "./grading";

export type Dispute = {
  id: string;
  status: "open" | "resolved";
  reason: string;
  openedAt: Date;
  /** The teacher's answer; NULL while open or when they wrote none. */
  response: string | null;
  resolvedAt: Date | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_REASON = 2000;

export type OpenDisputeResult = "opened" | "already_open" | "no_reason" | "not_found";

/**
 * Opens a dispute on the actor's own graded attempt in a course they take.
 * Sending the same `clientKey` again returns "opened" without a second
 * dispute; another while one is open is "already_open".
 */
export async function openDispute(db: Db, actor: Actor, attemptId: string, reason: string, clientKey: string): Promise<OpenDisputeResult> {
  const text = reason.trim();
  if (!UUID.test(attemptId) || !UUID.test(clientKey)) return "not_found";
  if (text === "" || text.length > MAX_REASON) return "no_reason";
  const where = and(
    { text: "t.id = $1 and t.user_id = $2 and r.status = 'graded'", values: [attemptId, actor.userId] },
    coursesTakenBy(actor, "c"),
  );
  const [mine] = await db.query<{ id: string }>(
    `select t.id
       from attempts t
       join results r on r.attempt_id = t.id
       join activities a on a.id = t.activity_id
       join courses c on c.id = a.course_id
      where ${where.text}`,
    where.values,
  );
  if (!mine) return "not_found";
  await db.query(
    "insert into disputes (attempt_id, client_key, reason) values ($1, $2, $3) on conflict do nothing",
    [attemptId, clientKey, text],
  );
  const [sent] = await db.query("select 1 from disputes where attempt_id = $1 and client_key = $2", [attemptId, clientKey]);
  return sent ? "opened" : "already_open";
}

/** An attempt's latest dispute, or NULL. The caller has already checked who may see the attempt. */
export async function latestDispute(db: Db, attemptId: string): Promise<Dispute | null> {
  const [row] = await db.query<Dispute>(
    `select id, status, reason, opened_at as "openedAt", response, resolved_at as "resolvedAt"
       from disputes where attempt_id = $1
      order by opened_at desc, id desc limit 1`,
    [attemptId],
  );
  return row ?? null;
}

export type ResolveResult = "resolved" | "not_found" | "out_of_range";

/**
 * Resolves an open dispute in a course the actor teaches, with an optional
 * answer to the student. `score` NULL keeps the grade; a score different
 * from the one that counts becomes the teacher's score. Resolving one already
 * resolved changes nothing and reports "resolved", so a resent form is safe.
 */
export async function resolveDispute(
  db: Db,
  actor: Actor,
  disputeId: string,
  score: number | null,
  response: string,
): Promise<ResolveResult> {
  if (!UUID.test(disputeId)) return "not_found";
  const where = and({ text: "d.id = $1 and r.status = 'graded'", values: [disputeId] }, coursesTaughtBy(actor, "c"));
  return db.transaction(async (tx) => {
    const [dispute] = await tx.query<{ attemptId: string; status: Dispute["status"]; score: number; teacherScore: number | null }>(
      `select d.attempt_id as "attemptId", d.status, r.score::float8 as score, r.teacher_score::float8 as "teacherScore"
         from disputes d
         join results r on r.attempt_id = d.attempt_id
         join attempts t on t.id = d.attempt_id
         join activities a on a.id = t.activity_id
         join courses c on c.id = a.course_id
        where ${where.text}
          for update of d`,
      where.values,
    );
    if (!dispute) return "not_found";
    if (dispute.status === "resolved") return "resolved";
    if (score !== null && score !== countedScore(dispute)) {
      const saved = await setTeacherScore(tx, actor, dispute.attemptId, score);
      if (saved !== "saved") return saved;
    }
    const answer = response.trim();
    await tx.query(
      "update disputes set status = 'resolved', resolved_by = $2, resolved_at = now(), response = $3 where id = $1",
      [disputeId, actor.userId, answer === "" ? null : answer],
    );
    return "resolved";
  });
}
