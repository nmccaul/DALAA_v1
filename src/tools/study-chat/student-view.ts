/**
 * What a student's browser may know about a Study Chat. Built field by field
 * from the settings, never by removing fields, so a setting added later stays
 * on the server until someone chooses to show it. The scenario's situation,
 * the persona's background, positions, touchpoints and the rubric are for the
 * AI and the grader only (CLAUDE.md: hidden material is never sent to the
 * student's browser).
 */

import type { StudyChatSettings } from "./schema";

export type StudentChatView = {
  title: string;
  /** The AI's first message, shown before the student writes. */
  opening: string;
  persona: { name: string; role: string };
  /** NULL: no limit, or no question. */
  limits: {
    maxTurns: number | null;
    timeLimitMinutes: number | null;
    question: string | null;
    studentCanFinish: boolean;
  };
};

export function studentView(settings: StudyChatSettings): StudentChatView {
  const [scenario] = settings.scenarios;
  const { maxTurns, timeLimitMinutes, question, studentCanFinish } = settings.completion;
  return {
    title: scenario.title,
    opening: scenario.opening,
    persona: { name: settings.persona.name, role: settings.persona.title },
    limits: { maxTurns, timeLimitMinutes, question, studentCanFinish },
  };
}
