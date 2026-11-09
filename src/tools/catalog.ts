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
  /** Query that opens the tool's create screen at its first step, when it has one. */
  start?: string;
  /** Where a draft opens, and where Edit goes, under the activity's own path, when the tool has setup steps (`setup/[step]`). */
  draftOpens?: string;
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
    start: "?step=materials",
    draftOpens: "/setup/scenario",
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

/**
 * Where "+ Activity" goes: straight into the one live tool's first step while
 * there is only one (no choice to make), else the page to pick a type.
 */
export function newActivityPath(courseId: string, tools: readonly ToolInfo[] = TOOLS): string {
  const live = tools.filter(isLive);
  const base = `/courses/${courseId}/activities/new`;
  return live.length === 1 ? `${base}/${live[0].slug}${live[0].start ?? ""}` : base;
}

/**
 * Where an activity's title links for its teacher: a draft reopens its tool's
 * setup steps when the tool has them, anything else the activity's page.
 */
/** Where an activity's Edit button goes: its tool's setup steps, or its page when the tool has none. */
export function editActivityPath(courseId: string, a: { id: string; tool: string }): string {
  const opens = findTool(a.tool)?.draftOpens;
  return `/courses/${courseId}/activities/${a.id}${opens ?? ""}`;
}

export function teacherActivityPath(courseId: string, a: { id: string; tool: string; status: "draft" | "published" }): string {
  const path = `/courses/${courseId}/activities/${a.id}`;
  const opens = a.status === "draft" ? findTool(a.tool)?.draftOpens : undefined;
  return opens ? `${path}${opens}` : path;
}
