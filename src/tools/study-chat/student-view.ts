/**
 * What a student's browser may know about a Study Chat. Built field by field
 * from the settings, never by removing fields, so a setting added later stays
 * on the server until someone chooses to show it. The learning goal and the
 * rubric's criterion names and points are the student's to know (Nathan,
 * 2026-11-13, feedback abf69c71: students couldn't tell what they were aiming
 * for). What earns full points, the scenario's situation, the persona's
 * background, positions and touchpoints are for the AI and the grader only
 * (CLAUDE.md: hidden material is never sent to the student's browser): a
 * criterion's description can give the answer away.
 */

import type { StudyChatSettings } from "./schema";

/** The longest message a student may send; the page stops typing there, `sendTurn` refuses past it. */
export const MAX_MESSAGE_LENGTH = 4000;

export type StudentChatView = {
  title: string;
  /** What the student should be able to do by the end. */
  goal: string;
  /** What the grade is made of: each criterion's name and points, never what earns them. */
  criteria: { label: string; points: number }[];
  /** The AI's first message, shown before the student writes. */
  opening: string;
  persona: { name: string; role: string };
  /** The student adds their own work before the chat starts. */
  bringsWork: boolean;
  /** NULL: no limit, or no question. */
  limits: {
    maxTurns: number | null;
    /** The fewest messages before answering the question or Finish can end it; NULL for none. */
    minTurns: number | null;
    timeLimitMinutes: number | null;
    question: string | null;
    studentCanFinish: boolean;
  };
};

/**
 * What the student's progress meter shows, only when the teacher turned on
 * "Show students their progress" (progress.ts `studentProgress`). Counts, the
 * names of points the student has already covered (they said them), and their
 * own position; never the names of touchpoints still to cover.
 */
export type StudentProgress = {
  /** NULL when the chat tracks no touchpoints. `names`: the ones covered, in the order covered. */
  points: { covered: number; total: number; names: string[] } | null;
  /** The position the student has taken; NULL before they take one, or when the chat has none. */
  position: string | null;
};

export function studentView(settings: StudyChatSettings): StudentChatView {
  const [scenario] = settings.scenarios;
  const { maxTurns, minTurns, timeLimitMinutes, question, studentCanFinish } = settings.completion;
  return {
    title: scenario.title,
    goal: settings.goal,
    criteria: settings.rubric.criteria.map((c) => ({ label: c.label, points: c.points })),
    opening: scenario.opening,
    persona: { name: settings.persona.name, role: settings.persona.title },
    bringsWork: settings.studentWork,
    limits: { maxTurns, minTurns, timeLimitMinutes, question, studentCanFinish },
  };
}
