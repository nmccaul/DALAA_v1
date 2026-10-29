/**
 * The tool registry: every kind of activity a teacher can create (PRD §8,
 * D-021). Pages list tools from here and read `status`; the chassis never
 * branches on a tool name (CLAUDE.md). Study Chat is the one live tool; the
 * others are listed so teachers see what's coming, and can't be started.
 */

import { ChatsCircle, ListChecks, Microphone } from "@phosphor-icons/react/dist/ssr";
import type { ComponentType } from "react";

export type ToolStatus = "live" | "coming-soon";

export type ToolInfo = {
  slug: string;
  name: string;
  status: ToolStatus;
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
    slug: "study-chat",
    name: "Study Chat",
    status: "live",
    icon: ChatsCircle,
    students:
      "Students read your material, then talk it through with an AI: explain it, apply it, debate it, or question a character from a case.",
    teacher: "A grade for each student against your rubric, with the parts of the chat that earned it.",
    material: "A Canvas page, a file, or text you paste",
    draft: "the goal, the scenario, the AI's character, when the chat ends, and a rubric",
    accent: "#0b7f74",
  },
  {
    slug: "quizzer",
    name: "Quizzer",
    status: "coming-soon",
    icon: ListChecks,
    students: "Students answer questions, with AI feedback on written answers.",
    teacher: "Scores by question and objective, and the questions most of the class missed.",
    material: "A reading, your notes, or a quiz you already have",
    draft: "questions with answer guides, tied to your learning objectives",
    accent: "#a36307",
  },
  {
    slug: "oral-assessment",
    name: "Oral Assessment",
    status: "coming-soon",
    icon: Microphone,
    students: "Students answer questions out loud, and DALAA asks follow-ups the way an examiner would.",
    teacher: "A score for each student, with the spoken answers that earned it.",
    material: "A reading, lecture notes, or the questions you want asked",
    draft: "the questions, the follow-ups to ask, and a rubric",
    accent: "#c2417a",
  },
];

export function findTool(slug: string): ToolInfo | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function isLive(tool: ToolInfo): boolean {
  return tool.status === "live";
}
