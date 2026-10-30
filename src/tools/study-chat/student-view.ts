/**
 * What a student's browser may know about a Study Chat. Built field by field
 * from the settings, never by removing fields, so a setting added later stays
 * on the server until someone chooses to show it. The scenario's situation,
 * the persona's background, positions, touchpoints and the rubric are for the
 * AI and the grader only (CLAUDE.md: hidden material is never sent to the
 * student's browser).
 */

import type { StudyChatSettings } from "./schema";

/** The longest message a student may send; the page stops typing there, `sendTurn` refuses past it. */
export const MAX_MESSAGE_LENGTH = 4000;

export type StudentChatView = {
  title: string;
  /** The AI's first message, shown before the student writes. */
  opening: string;
  persona: { name: string; role: string };
  /** The student adds their own work before the chat starts. */
  bringsWork: boolean;
  /** NULL: no limit, or no question. */
  limits: {
    maxTurns: number | null;
    timeLimitMinutes: number | null;
    question: string | null;
    studentCanFinish: boolean;
  };
};

/**
 * What the student's progress meter shows, only when the teacher turned on
 * "Show students their progress" (progress.ts `studentProgress`). Counts and
 * the student's own position; never the names of touchpoints still to cover.
 */
export type StudentProgress = {
  /** NULL when the chat tracks no touchpoints. */
  points: { covered: number; total: number } | null;
  /** The position the student has taken; NULL before they take one, or when the chat has none. */
  position: string | null;
};

/** The meter's lines, each naming what it counts. */
export function progressLines(progress: StudentProgress): string[] {
  const lines: string[] = [];
  if (progress.points) lines.push(`Points covered — ${progress.points.covered} of ${progress.points.total}`);
  if (progress.position !== null) lines.push(`Your position: ${progress.position}`);
  return lines;
}

export function studentView(settings: StudyChatSettings): StudentChatView {
  const [scenario] = settings.scenarios;
  const { maxTurns, timeLimitMinutes, question, studentCanFinish } = settings.completion;
  return {
    title: scenario.title,
    opening: scenario.opening,
    persona: { name: settings.persona.name, role: settings.persona.title },
    bringsWork: settings.studentWork,
    limits: { maxTurns, timeLimitMinutes, question, studentCanFinish },
  };
}
