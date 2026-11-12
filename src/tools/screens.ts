/**
 * The screens each live tool brings (CLAUDE.md: tools register behavior; the
 * chassis doesn't ask who they are). The chassis routes
 * `/courses/[id]/activities/new/[tool]`, `/courses/[id]/activities/[activityId]`,
 * its `setup/[step]` wizard pages
 * and the student's `/activities/[activityId]` look a tool's screens up here. Server-only: catalog.ts stays light enough
 * for the landing page.
 */

import type { ReactNode } from "react";
import type { TaughtActivity } from "@/activities/store";
import type { TakenActivity } from "@/attempts/store";
import type { CourseCard } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import type { TaughtAttempt } from "@/results/attempt";
import { STUDY_CHAT } from "./study-chat/create";
import { StudyChatCreate } from "./study-chat/create-screen";
import { studyChatGradingNotes } from "./study-chat/grading-notes";
import { StudyChatReview } from "./study-chat/review-screen";
import { StudyChatTake } from "./study-chat/take-screen";
import { StudyChatTranscript } from "./study-chat/transcript";
import { StudyChatSetup } from "./study-chat/wizard/setup-step";

export type CreateScreenProps = {
  actor: Actor;
  course: CourseCard;
  searchParams: Record<string, string | string[] | undefined>;
};

/** `addToCanvas`: the open "Add to Canvas" picker's request, so Publish returns to it (src/lti/picker.ts). */
export type ReviewScreenProps = { actor: Actor; activity: TaughtActivity; addToCanvas: string | null };

/** A step of the tool's setup wizard on a drafted activity; `step` is the URL's, unchecked. */
export type SetupScreenProps = ReviewScreenProps & { step: string };

/** A student doing the activity. The screen passes the browser only what the tool's student view allows. */
export type TakeScreenProps = { actor: Actor; activity: TakenActivity };

/** One student's attempt, for their teacher's transcript page on the Results tab. */
export type TranscriptProps = { attempt: TaughtAttempt };

/**
 * Plain lines a tool adds to an assignment on the Grading tab: a class
 * summary, and lines under each student keyed by attempt id. The chassis
 * shows them as given.
 */
export type GradingNotes = {
  summary: { heading: string; lines: string[] }[];
  byAttempt: Record<string, string[]>;
};

type ToolScreens = {
  create: (props: CreateScreenProps) => ReactNode | Promise<ReactNode>;
  review: (props: ReviewScreenProps) => ReactNode | Promise<ReactNode>;
  /** Calls `notFound()` for a step it doesn't have. */
  setup?: (props: SetupScreenProps) => ReactNode | Promise<ReactNode>;
  take: (props: TakeScreenProps) => ReactNode | Promise<ReactNode>;
  /** What the student did, as their teacher reads it. */
  transcript?: (props: TranscriptProps) => ReactNode | Promise<ReactNode>;
  /** `attemptIds`: this assignment's attempts the Grading tab already scoped to the teacher. */
  gradingNotes?: (db: Db, activityId: string, attemptIds: readonly string[]) => Promise<GradingNotes | null>;
};

const SCREENS: Readonly<Record<string, ToolScreens>> = {
  [STUDY_CHAT]: {
    create: StudyChatCreate,
    review: StudyChatReview,
    setup: StudyChatSetup,
    take: StudyChatTake,
    transcript: StudyChatTranscript,
    gradingNotes: studyChatGradingNotes,
  },
};

export function screensFor(tool: string): ToolScreens | undefined {
  return Object.hasOwn(SCREENS, tool) ? SCREENS[tool] : undefined;
}
