/**
 * Study Chat settings: the JSON stored in `activities.settings` for this tool
 * (CLAUDE.md: each tool has its own schema). The AI drafts every field (T17);
 * the teacher reviews and changes them. Each field's `title` is the label the
 * teacher sees and the review screen searches; `description` tells the
 * drafting model what to write; `help`, where there is one, is the line the
 * teacher sees under the label when the title alone doesn't say enough.
 *
 * Unknown keys are refused, so a setting this code doesn't read can't be
 * stored and silently ignored. "No limit" is NULL, never 0.
 *
 * What the student studies (the content) is stored with the activity, not
 * here (T15).
 */

import { z } from "zod";
import { MODE_SLUGS, MODES } from "./modes";

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

/**
 * Every setting, without the rules that tie one setting to another. The draft
 * is generated against this (draft.ts) because "Students bring their own work"
 * is the teacher's switch, set after the model answers.
 */
export const StudyChatFields = z
  .strictObject({
    mode: z.enum(MODE_SLUGS).meta({ title: "Mode", description: "The kind of chat this is." }),
    // The teacher's switch on the create flow, not the AI's: drafting keeps it
    // as the teacher set it (create.ts). Missing in settings saved before it
    // existed, which asked for no work.
    studentWork: z.boolean().default(false).meta({
      title: "Students add their own paper or project first",
      description: "Each student adds their own paper, code or plan before the chat, and the chat is about it.",
      help: "Before the chat, each student uploads or pastes their own paper, code or plan, and the chat is about their work. Leave it off when everyone works from the same readings.",
    }),
    goal: text(1000).meta({
      title: "Goal",
      description: "What students should be able to do after the chat, in one or two sentences.",
    }),
    // Why the wizard suggested this type (suggest.ts), for the teacher's
    // wizard panel. The teacher's only: the student view and every prompt are
    // built field by field and never read it. Missing when the type wasn't
    // suggested, or in settings saved before it existed.
    typeReason: text(300).optional().meta({
      title: "Why this type",
      description: "Why DALAA suggested this kind of chat.",
    }),
    // A list so stages can come later; v1 runs exactly one.
    scenarios: z.array(Scenario).length(1).meta({ title: "Scenario" }),
    positions: z
      .array(LabeledItem)
      .max(6)
      .meta({
        title: "Positions students can take",
        description: "Directions a student may take (for example, for or against). Empty when there are none.",
        help: "Sides a student might take, like for or against. Insights shows how many took each. Leave it empty when there are no sides.",
      }),
    touchpoints: z
      .array(LabeledItem)
      .max(12)
      .meta({
        title: "Key points to listen for",
        description: "Points the teacher wants to see whether each student brings up (for example, cost or culture).",
        help: "Ideas you hope each student brings up. Each is checked yes or no with the student's words, and shows in Insights and in students' progress. They don't score points on their own; the criteria below do.",
      }),
    // The teacher's switch, like `studentWork`: drafting leaves it off and
    // create.ts sets it. Missing in settings saved before it existed: off.
    showProgress: z.boolean().default(false).meta({
      title: "Show students their progress",
      help: "While they chat, students see how many messages they have left and which points they've covered.",
      description: "As they chat, students see how many touchpoints they've covered and the position they've taken.",
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
          title: "Question that ends the chat",
          description: "The chat ends once the student has answered this. NULL when not used.",
          help: "Optional. The character makes sure the chat gets to this question, and the chat ends once the student has answered it. Leave it empty to end the chat only by messages, time or the student.",
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
          .max(10)
          .meta({ title: "Criteria" }),
        strictness: z.enum(STRICTNESS).meta({
          title: "Grader strictness",
          description: "How hard the AI grader is on partial answers.",
        }),
      })
      .meta({
        title: "How it's scored",
        description: "What the AI grader scores the chat on.",
        help: "The criteria the AI grader scores, each worth points. Only these make up the grade.",
      }),
  })
  .meta({ title: "Study Chat settings" });

/**
 * What the model drafts (draft.ts): every setting but the teacher's own
 * switches, which draft.ts sets after it answers, and the type's reason,
 * which create.ts keeps from the suggestion. OpenAI's structured output
 * refuses a schema with any field not required, and those two have defaults.
 */
export const StudyChatDraftFields = StudyChatFields.omit({ studentWork: true, showProgress: true, typeReason: true });

export const StudyChatSettings = StudyChatFields.refine((s) => s.studentWork || !MODES[s.mode].needsStudentWork, {
  message: "A Defend chat is about each student's own work, so “Students add their own paper or project first” stays on.",
  path: ["studentWork"],
});

export type StudyChatSettings = z.infer<typeof StudyChatSettings>;

/** The points a chat is worth: the sum of its rubric criteria. */
export function rubricPoints(settings: StudyChatSettings): number {
  return settings.rubric.criteria.reduce((sum, c) => sum + c.points, 0);
}

/** The schema's meta for the setting at `path` (keys only; list positions, as numbers or digit strings, are skipped). */
function settingMeta(path: readonly PropertyKey[]) {
  let node = StudyChatSettings as z.ZodType;
  for (const key of path) {
    if (typeof key !== "string" || /^\d+$/.test(key)) continue;
    while (node instanceof z.ZodNullable || node instanceof z.ZodArray) {
      node = (node instanceof z.ZodNullable ? node.unwrap() : node.element) as z.ZodType;
    }
    if (!(node instanceof z.ZodObject) || !Object.hasOwn(node.shape, key)) throw new Error(`No setting ${path.join(".")}`);
    node = node.shape[key] as z.ZodType;
  }
  return node.meta();
}

/**
 * The teacher-facing label of the setting at `path` (keys only; list
 * positions are skipped), read from the schema's `title`s so the editor, its
 * search and its error messages can't drift from the schema.
 */
export function settingTitle(path: readonly PropertyKey[]): string {
  const title = settingMeta(path)?.title;
  if (!title) throw new Error(`Setting ${path.join(".")} has no title`);
  return title;
}

/** The teacher-facing line under a setting's label, or null when its title says enough. */
export function settingHelp(path: readonly PropertyKey[]): string | null {
  const help = settingMeta(path)?.help;
  return typeof help === "string" ? help : null;
}

/** Why settings don't fit, as plain sentences that name each setting. */
export function settingProblems(error: z.ZodError): string[] {
  const problems = error.issues.map((issue) => {
    if (issue.code === "custom") return issue.message;
    const where = `“${settingTitle(issue.path)}”`;
    if (issue.code === "too_small") return issue.origin === "string" ? `${where} can't be empty.` : `${where} is too low or too short.`;
    if (issue.code === "too_big") return issue.origin === "string" ? `${where} is too long.` : `${where} is too high or has too many.`;
    return `${where} needs a valid value.`;
  });
  return [...new Set(problems)];
}
