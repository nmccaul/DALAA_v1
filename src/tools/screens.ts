/**
 * The screens each live tool brings (CLAUDE.md: tools register behavior; the
 * chassis doesn't ask who they are). The chassis routes
 * `/courses/[id]/activities/new/[tool]`, `/courses/[id]/activities/[activityId]`
 * and the student's `/activities/[activityId]` look a tool's screens up here. Server-only: catalog.ts stays light enough
 * for the landing page.
 */

import type { ReactNode } from "react";
import type { TaughtActivity } from "@/activities/store";
import type { TakenActivity } from "@/attempts/store";
import type { CourseCard } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import { STUDY_CHAT } from "./study-chat/create";
import { StudyChatCreate } from "./study-chat/create-screen";
import { StudyChatReview } from "./study-chat/review-screen";
import { StudyChatTake } from "./study-chat/take-screen";

export type CreateScreenProps = {
  actor: Actor;
  course: CourseCard;
  searchParams: Record<string, string | string[] | undefined>;
};

/** `addToCanvas`: the open "Add to Canvas" picker's request, so Publish returns to it (src/lti/picker.ts). */
export type ReviewScreenProps = { actor: Actor; activity: TaughtActivity; addToCanvas: string | null };

/** A student doing the activity. The screen passes the browser only what the tool's student view allows. */
export type TakeScreenProps = { actor: Actor; activity: TakenActivity };

type ToolScreens = {
  create: (props: CreateScreenProps) => ReactNode | Promise<ReactNode>;
  review: (props: ReviewScreenProps) => ReactNode | Promise<ReactNode>;
  take: (props: TakeScreenProps) => ReactNode | Promise<ReactNode>;
};

const SCREENS: Readonly<Record<string, ToolScreens>> = {
  [STUDY_CHAT]: { create: StudyChatCreate, review: StudyChatReview, take: StudyChatTake },
};

export function screensFor(tool: string): ToolScreens | undefined {
  return Object.hasOwn(SCREENS, tool) ? SCREENS[tool] : undefined;
}
