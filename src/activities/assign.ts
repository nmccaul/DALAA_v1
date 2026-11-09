/**
 * Assign: DALAA makes the Canvas assignment for an activity (D-034, behind
 * ASSIGN_TO_CANVAS). It is an external-tool assignment that opens the activity
 * through the LTI launch, so grades flow back over AGS as for a link added
 * from Canvas. Assigning again updates the same Canvas assignment (a new due
 * date, published or not); it never makes a second one.
 *
 * The points are the activity's own (they follow its rubric). Canvas is told
 * the same number; nothing is rescaled.
 */

import { CanvasError, type CanvasAssignmentGroup } from "@/canvas/client";
import type { TeacherCanvas } from "@/canvas/connection";
import { canvasIdOf, taughtCourse } from "@/canvas/sync";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { ltiUrls } from "@/lti/config";
import { getTaughtActivity, publishActivity } from "./store";

export type AssignRequest = {
  dueAt: Date | null;
  /** When students can no longer open it; null for never. Left out: never on create, unchanged on update. */
  lockAt?: Date | null;
  /** A Canvas assignment group; left out, Canvas uses the course's first (or, on update, leaves it). */
  groupId?: number;
  /** Whether students see the assignment in Canvas yet. Left out: not yet on create, unchanged on update. */
  publish?: boolean;
};

/** Assign from DALAA is behind a flag until it's checked on gitgrade (D-034). */
export function assignToCanvasOn(): boolean {
  return process.env.ASSIGN_TO_CANVAS === "1";
}

export type AssignResult =
  | { ok: true; canvasAssignmentId: string; created: boolean }
  | {
      ok: false;
      /** "connect" and "reconnect" mean: show a link to connect Canvas. */
      problem: "connect" | "reconnect" | "not-yours" | "not-linked" | "wrong-canvas" | "linked-by-hand" | "refused";
      reason: string;
    };

const refuse = (problem: Exclude<AssignResult, { ok: true }>["problem"], reason: string): AssignResult => ({
  ok: false,
  problem,
  reason,
});

/** Where Canvas sends students for this activity. `appUrl` is DALAA's public origin. */
export function activityLaunchUrl(appUrl: string, activityId: string): string {
  return `${ltiUrls(appUrl).launch}?activity_id=${activityId}`;
}

/**
 * Publishes the activity in DALAA, then makes (or updates) its Canvas
 * assignment and remembers it. `canvas` is the teacher's own connection, or
 * null if they haven't connected.
 *
 * The activity row is locked while Canvas is asked, so a double click makes
 * one assignment, not two.
 */
export async function assignActivity(
  db: Db,
  actor: Actor,
  canvas: TeacherCanvas | null,
  activityId: string,
  request: AssignRequest,
  appUrl: string,
): Promise<AssignResult> {
  if (!actor.isStaff) throw new Error("Only instructors assign activities");
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity) return refuse("not-yours", "That activity isn't one of yours.");
  if (!canvas) return refuse("connect", "Connect Canvas so DALAA can add this to your Canvas course.");

  const course = await taughtCourse(db, actor, activity.courseId);
  if (!course) return refuse("not-yours", "That activity isn't one of yours.");
  if (!course.canvas_course_id) return refuse("not-linked", "This course isn't linked to a Canvas course yet.");
  if (course.is_practice !== (canvas.mode === "practice")) {
    return refuse(
      "wrong-canvas",
      course.is_practice
        ? "This is a practice course. Switch to practice Canvas to assign in it."
        : "This course is in real Canvas, but you're connected to practice Canvas. Connect your Canvas account to assign in it.",
    );
  }
  if (request.lockAt && request.dueAt && request.lockAt < request.dueAt) {
    return refuse("refused", "The close date can't be before the due date.");
  }

  const published = await publishActivity(db, actor, activity.id);
  if (!published.ok) return refuse("refused", published.reason);

  const canvasCourseId = canvasIdOf(course.canvas_course_id);
  return db.transaction(async (tx) => {
    const [row] = await tx.query<{ canvas_assignment_id: string | null; lti_resource_link_id: string | null }>(
      "select canvas_assignment_id, lti_resource_link_id from activities where id = $1 for update",
      [activity.id],
    );
    const existing = row.canvas_assignment_id;
    // Added from Canvas the old way: it already has a Canvas link, and a second assignment would split its grades.
    if (!existing && row.lti_resource_link_id) {
      return refuse("linked-by-hand", "This activity is already in Canvas. Change its due date in Canvas.");
    }

    const fields = {
      name: activity.title,
      pointsPossible: activity.points!,
      dueAt: request.dueAt,
      ...(request.groupId !== undefined && { groupId: request.groupId }),
      launchUrl: activityLaunchUrl(appUrl, activity.id),
    };
    let made;
    try {
      made = existing
        ? await canvas.client.updateAssignment(canvasCourseId, Number(existing), {
            ...fields,
            ...(request.lockAt !== undefined && { lockAt: request.lockAt }),
            ...(request.publish !== undefined && { published: request.publish }),
          })
        : await canvas.client.createAssignment(canvasCourseId, {
            ...fields,
            lockAt: request.lockAt ?? null,
            published: request.publish ?? false,
          });
    } catch (e) {
      if (!(e instanceof CanvasError)) throw e;
      return canvasRefusal(e, Boolean(existing));
    }

    const id = String(made.id);
    await tx.query("update activities set canvas_assignment_id = $2, due_at = $3, updated_at = now() where id = $1", [
      activity.id,
      id,
      request.dueAt,
    ]);
    return { ok: true, canvasAssignmentId: id, created: !existing };
  });
}

function canvasRefusal(e: CanvasError, updating: boolean): AssignResult {
  switch (e.kind) {
    case "token-rejected":
      return refuse("reconnect", "Canvas didn't accept your connection. Reconnect Canvas and try again.");
    case "forbidden":
      return refuse("refused", "Canvas won't let your account add assignments to this course.");
    case "not-found":
      return refuse(
        "refused",
        updating
          ? "Its Canvas assignment isn't in Canvas anymore."
          : "Canvas couldn't find this course. Check that you still teach it there.",
      );
    case "bad-response":
      return refuse("refused", "Canvas didn't accept the assignment. Check the dates and the assignment group.");
    default:
      return refuse("refused", "Canvas didn't answer. Try again in a minute.");
  }
}

/** What the Assign page needs: whether it's in Canvas already, and the course's assignment groups. */
export type AssignSetup = {
  canvasAssignmentId: string | null;
  /** Added from Canvas the old way; its dates are changed in Canvas. */
  linkedByHand: boolean;
  dueAt: Date | null;
  /** Null when Canvas couldn't be asked (not connected, not linked, or no answer): Canvas then uses its default group. */
  groups: CanvasAssignmentGroup[] | null;
};

export async function assignSetup(
  db: Db,
  actor: Actor,
  canvas: TeacherCanvas | null,
  activityId: string,
): Promise<AssignSetup | null> {
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity) return null;
  const [row] = await db.query<{ canvas_assignment_id: string | null; lti_resource_link_id: string | null; due_at: Date | null }>(
    "select canvas_assignment_id, lti_resource_link_id, due_at from activities where id = $1",
    [activity.id],
  );
  const course = await taughtCourse(db, actor, activity.courseId);
  let groups: CanvasAssignmentGroup[] | null = null;
  if (canvas && course?.canvas_course_id && course.is_practice === (canvas.mode === "practice")) {
    try {
      groups = (await canvas.client.assignmentGroups(canvasIdOf(course.canvas_course_id))).sort(
        (a, b) => a.position - b.position,
      );
    } catch (e) {
      if (!(e instanceof CanvasError)) throw e;
    }
  }
  return {
    canvasAssignmentId: row.canvas_assignment_id,
    linkedByHand: !row.canvas_assignment_id && Boolean(row.lti_resource_link_id),
    dueAt: row.due_at,
    groups,
  };
}

/**
 * The Assign form's fields as an AssignRequest. Dates arrive as ISO strings
 * (the browser converts the teacher's local time); blank means none. A field
 * not on the form at all (the due-date edit has only the due date) is left out.
 */
export function assignRequestFrom(form: FormData): AssignRequest | { error: string } {
  const date = (name: string): Date | null | undefined | "bad" => {
    if (!form.has(name)) return undefined;
    const raw = String(form.get(name) ?? "").trim();
    if (!raw) return null;
    const at = new Date(raw);
    return Number.isNaN(at.getTime()) ? "bad" : at;
  };
  const dueAt = date("dueAt");
  const lockAt = date("lockAt");
  if (dueAt === "bad" || lockAt === "bad") return { error: "We couldn't read that date. Pick it again." };
  const group = String(form.get("groupId") ?? "").trim();
  if (group && !/^\d+$/.test(group)) return { error: "Pick an assignment group from the list." };
  return {
    dueAt: dueAt ?? null,
    ...(lockAt !== undefined && { lockAt }),
    ...(group && { groupId: Number(group) }),
    ...(form.has("publishChoice") && { publish: form.get("publish") === "on" }),
  };
}
