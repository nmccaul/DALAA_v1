/**
 * The activity tools teachers choose from (PRD §8). Today this only describes
 * them, for the "New activity" preview; nothing is created. When the first
 * tool is built (#49), this becomes the registry tools plug into, and the
 * chassis still never branches on a tool name (CLAUDE.md).
 */

import { ChatsCircle, Lightbulb, ListChecks } from "@phosphor-icons/react/dist/ssr";
import type { ComponentType } from "react";

export type ToolInfo = {
  slug: string;
  name: string;
  icon: ComponentType<{ size?: number; weight?: "regular" | "duotone"; "aria-hidden"?: boolean }>;
  /** What students do, in one sentence. */
  students: string;
  /** What the teacher gets back. */
  teacher: string;
  /** What the teacher brings. */
  material: string;
  /** What DALAA drafts from that material (setup step 2). */
  draft: string;
  /** Tools may differ in accent color and nothing else (CLAUDE.md). White text on it >= 4.5:1. */
  accent: string;
};

export const TOOLS: readonly ToolInfo[] = [
  {
    slug: "case-chat",
    name: "Case Chat",
    icon: ChatsCircle,
    students: "Students question a character from a case to uncover what happened, then take a position.",
    teacher: "Where the class landed, the themes in their reasoning, and who found each key fact.",
    material: "A case or reading, plus your teaching notes",
    draft: "the character, what they know and will reveal, and the facts students should uncover",
    accent: "#0b7f74",
  },
  {
    slug: "quiz",
    name: "Quiz",
    icon: ListChecks,
    students: "Students answer questions, with AI feedback on written answers.",
    teacher: "Scores by question and objective, and the questions most of the class missed.",
    material: "A reading, your notes, or a quiz you already have",
    draft: "questions with answer guides, tied to your learning objectives",
    accent: "#a36307",
  },
  {
    slug: "explain",
    name: "Explain",
    icon: Lightbulb,
    students: "Students explain an idea in their own words, and DALAA asks follow-up questions until it's clear.",
    teacher: "Where understanding breaks down, for each student and across the class.",
    material: "A reading or lecture notes",
    draft: "the key ideas to explain and the follow-up questions to ask",
    accent: "#c2417a",
  },
];

export function findTool(slug: string): ToolInfo | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
