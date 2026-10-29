/**
 * Study Chat settings: the JSON stored in `activities.settings` for this tool
 * (CLAUDE.md: each tool has its own schema). The AI drafts every field (T17);
 * the teacher reviews and changes them. Each field's `title` is the label the
 * teacher sees and the review screen searches; `description` tells the
 * drafting model what to write.
 *
 * Unknown keys are refused, so a setting this code doesn't read can't be
 * stored and silently ignored. "No limit" is NULL, never 0.
 *
 * What the student studies (the content) is stored with the activity, not
 * here (T15).
 */

import { z } from "zod";
import { MODE_SLUGS } from "./modes";

const text = (max: number) => z.string().trim().min(1).max(max);

const Scenario = z
  .strictObject({
    title: text(120).meta({ title: "Title", description: "A short name for the scenario." }),
    situation: text(4000).meta({
      title: "Situation",
      description: "What the chat is about and how it unfolds, written for the AI that runs the chat.",
    }),
    opening: text(1000).meta({
      title: "Opening message",
      description: "The AI's first message to the student.",
    }),
  })
  .meta({ title: "Scenario" });

const LabeledItem = z.strictObject({
  label: text(120).meta({ title: "Name" }),
  description: text(1000).meta({ title: "Description" }),
});

export const STRICTNESS = ["strict", "balanced", "lenient"] as const;

export const StudyChatSettings = z
  .strictObject({
    mode: z.enum(MODE_SLUGS).meta({ title: "Mode", description: "The kind of chat this is." }),
    goal: text(1000).meta({
      title: "Goal",
      description: "What students should be able to do after the chat, in one or two sentences.",
    }),
    // A list so stages can come later; v1 runs exactly one.
    scenarios: z.array(Scenario).length(1).meta({ title: "Scenario" }),
    positions: z
      .array(LabeledItem)
      .max(6)
      .meta({
        title: "Positions",
        description: "Directions a student may take (for example, for or against). Empty when there are none.",
      }),
    touchpoints: z
      .array(LabeledItem)
      .max(12)
      .meta({
        title: "Touchpoints",
        description: "Points the teacher wants to see whether each student brings up (for example, cost or culture).",
      }),
    persona: z
      .strictObject({
        name: text(80).meta({ title: "Name" }),
        title: text(120).meta({ title: "Role", description: "Who they are, e.g. 'CEO of Harbor Bikes'." }),
        background: text(2000).meta({ title: "Background" }),
        tone: text(300).meta({ title: "Tone", description: "How they talk, e.g. 'warm but busy'." }),
        helpfulness: z.enum(["challenging", "balanced", "supportive"]).meta({
          title: "How much they help",
          description: "Challenging pushes back and gives little away; supportive offers hints.",
        }),
      })
      .meta({ title: "Persona", description: "The character the AI plays in the chat." }),
    completion: z
      .strictObject({
        maxTurns: z.int().min(1).max(100).nullable().meta({
          title: "Most student messages",
          description: "The chat ends after this many student messages. NULL for no limit.",
        }),
        timeLimitMinutes: z.int().min(1).max(240).nullable().meta({
          title: "Time limit (minutes)",
          description: "NULL for no time limit.",
        }),
        question: text(1000).nullable().meta({
          title: "Question to answer",
          description: "The chat ends once the student has answered this. NULL when not used.",
        }),
        studentCanFinish: z.boolean().meta({
          title: "Students can end the chat themselves",
        }),
      })
      .refine(
        (c) => c.maxTurns !== null || c.timeLimitMinutes !== null || c.question !== null || c.studentCanFinish,
        { message: "The chat needs at least one way to end." },
      )
      .meta({ title: "When the chat ends" }),
    rubric: z
      .strictObject({
        criteria: z
          .array(
            z.strictObject({
              label: text(120).meta({ title: "Criterion" }),
              description: text(1000).meta({ title: "What earns full points" }),
              points: z.number().positive().max(1000).meta({ title: "Points" }),
            }),
          )
          .min(1)
          .max(10),
        strictness: z.enum(STRICTNESS).meta({
          title: "Grader strictness",
          description: "How hard the AI grader is on partial answers.",
        }),
      })
      .meta({ title: "Grading", description: "What the AI grader scores the chat on." }),
  })
  .meta({ title: "Study Chat settings" });

export type StudyChatSettings = z.infer<typeof StudyChatSettings>;

/** The points a chat is worth: the sum of its rubric criteria. */
export function rubricPoints(settings: StudyChatSettings): number {
  return settings.rubric.criteria.reduce((sum, c) => sum + c.points, 0);
}
