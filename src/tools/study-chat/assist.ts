/**
 * DALAA writes the parts of a Study Chat the teacher asks for (parts.ts):
 * one text box, one list, or every empty part of a setup step. It reads the
 * materials and everything the teacher has written so far, keeps to it, and
 * follows their instruction when they give one ("shorter", "use alien
 * jargon"). Nothing is saved here: the editor shows what came back, and the
 * teacher saves it with the rest of the step.
 */

import type { LanguageModel } from "ai";
import { z } from "zod";
import { generateStructured, type AiCallContext } from "@/ai/call";
import type { Db } from "@/db/types";
import { DRAFT_RULES, modeBrief } from "./draft";
import { fence, guideBlocks, type Material } from "./material";
import { PARTS, partTitle, type PartKey } from "./parts";
import type { StudyChatSettings } from "./schema";

export type AssistRequest = {
  readings: readonly Material[];
  guides: readonly Material[];
  /** What the teacher has on screen now, saved or not. */
  settings: StudyChatSettings;
  /** At least one. */
  parts: readonly PartKey[];
  /** The teacher's direction for this rewrite; empty for none. */
  instruction: string;
};

export type AssistResult = { ok: true; values: Partial<Record<PartKey, unknown>> } | { ok: false; reason: string };

/** The longest direction kept: a sentence or two. */
export const MAX_INSTRUCTION_CHARS = 500;

/** The settings as the model reads them: what the teacher sees, without what's only for the panel. */
function written(settings: StudyChatSettings): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { typeReason, ...rest } = settings;
  return JSON.stringify(rest, null, 2);
}

/** The prompt for writing `parts`. Exported for tests. */
export function assistPrompt(request: AssistRequest): { system: string; prompt: string } {
  const names = request.parts.map((key) => `"${key}" (${partTitle(key)})`).join(", ");
  const system = [
    ...DRAFT_RULES,
    "",
    "The teacher is setting the chat up themselves and has asked you to write only some parts of it.",
    "- Write only the parts asked for. Everything else in the settings is the teacher's: keep to it and never contradict it.",
    "- A part that already has text is a rewrite: keep what works and change what the teacher asks.",
    "- Size the number of touchpoints to fit the chat's message limit.",
  ].join("\n");
  const parts = [
    modeBrief(request.settings.mode, request.settings.studentWork),
    ...request.readings.map((reading) => `Material title: ${reading.name.trim() || "Untitled"}\n${fence("student-reading", reading.body)}`),
    `The chat's settings so far (empty means not written yet):\n${written(request.settings)}`,
    ...guideBlocks(request.guides),
    `Write: ${names}.`,
  ];
  const instruction = request.instruction.trim();
  if (instruction) parts.push(`The teacher's direction for this: ${instruction}`);
  return { system, prompt: parts.join("\n\n") };
}

/** The answer's shape: one key per part asked for, each with that setting's schema. */
const answerSchema = (parts: readonly PartKey[]) => z.object(Object.fromEntries(parts.map((key) => [key, PARTS[key].schema])));

/** Writes the parts asked for with `model`; one call, recorded as `assist`. A failure says so plainly. */
export async function assistParts(db: Db, model: LanguageModel, ctx: Omit<AiCallContext, "purpose">, request: AssistRequest): Promise<AssistResult> {
  if (request.parts.length === 0) return { ok: false, reason: "Pick something for DALAA to write." };
  if (request.readings.every((reading) => reading.body.trim() === "")) return { ok: false, reason: "Add the material students will study first." };
  try {
    const values = await generateStructured(db, model, { ...ctx, purpose: "assist" }, answerSchema(request.parts), assistPrompt(request));
    return { ok: true, values };
  } catch (error) {
    console.error("study-chat assist failed:", error instanceof Error ? error.name : "unknown error");
    return { ok: false, reason: "DALAA couldn't write that this time. Try again, or write it yourself." };
  }
}
