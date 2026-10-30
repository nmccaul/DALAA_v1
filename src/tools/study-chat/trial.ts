/**
 * "Try it with a sample student" (T41): a simulated student of the level the
 * teacher picks talks with the real chat prompt until the chat's own rules end
 * it (or the cap), then the real grader grades it. The teacher sees the
 * transcript and the grade; nothing is saved as an attempt or a result, and
 * nothing goes to Canvas. Every model call is in the ledger as 'trial'.
 *
 * The simulated student knows only what a real student sees (student-view.ts)
 * and the reading: never the situation, the guide, the positions, the
 * touchpoints or the rubric. A teacher runs one trial at a time.
 */

import type { LanguageModel, ModelMessage } from "ai";
import { generateReply, type AiCallContext } from "@/ai/call";
import { getTaughtActivity } from "@/activities/store";
import type { StudentWork } from "@/attempts/work";
import { getContent } from "@/content/store";
import { aiGuide } from "@/content/guide";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import type { GradedResult } from "@/results/store";
import { questionAnswered } from "./chat";
import { STUDY_CHAT } from "./create";
import { gradeTurns } from "./grade";
import { fence } from "./material";
import { chatMessages, chatSystemPrompt, type ChatContent, type Exchange } from "./prompt";
import { StudyChatSettings } from "./schema";
import { studentView } from "./student-view";

export const TRIAL_LEVELS = ["struggling", "strong"] as const;
export type TrialLevel = (typeof TRIAL_LEVELS)[number];

/** A trial stops here even when the chat has no limit of its own. */
export const TRIAL_MAX_TURNS = 12;

/** A trial row this old belongs to a request that died; the next trial takes it over. */
const STALE_TRIAL_MINUTES = 10;

/** Why the trial stopped, for the teacher. */
export function trialEnding(trial: Pick<Trial, "endedBy" | "turns">): string {
  const n = trial.turns.length;
  const after = `Ended after ${n} ${n === 1 ? "message" : "messages"} from the sample student`;
  if (trial.endedBy === "turns") return `${after}: it reached the chat's message limit.`;
  if (trial.endedBy === "question") return `${after}: they answered the chat's question.`;
  return `${after}: a sample student stops at ${TRIAL_MAX_TURNS}.`;
}

/** The student model is the cheap chat model; the grader is the real one. */
export type TrialModels = { student: LanguageModel; reply: LanguageModel; check: LanguageModel; grader: LanguageModel };

export type Trial = {
  opening: string;
  /** The work the sample student brought, when the chat asks for it. */
  work: StudentWork | null;
  turns: Exchange[];
  /** What ended it: the chat's turn limit, its question answered, or the trial's cap. */
  endedBy: "turns" | "question" | "cap";
  /** NULL when the grader's answer never fit the rubric. */
  grade: GradedResult | null;
};

export type TrialOutcome = { ok: true; trial: Trial } | { ok: false; reason: string };

export const TRIAL_BUSY = "A sample student is already running. Wait for it to finish.";
export const TRIAL_FAILED = "The sample student couldn't finish: the AI didn't answer. Try again in a minute.";

const LEVEL: Record<TrialLevel, string> = {
  struggling:
    "You're a struggling student: you skimmed the reading, mix up some facts, give short answers, and sometimes " +
    "guess instead of reasoning. You try, but you need prompting.",
  strong:
    "You're a strong student: you read carefully, ask sharp questions, use specific facts from the reading, " +
    "and back up what you say.",
};

/** What the simulated student is told: only what a real student would see. Exported for tests. */
export function studentPrompt(settings: StudyChatSettings, level: TrialLevel, content: ChatContent, work: StudentWork | null): string {
  const view = studentView(settings);
  const parts = [
    `You're a college student in a class chat assignment called "${view.title}", talking with ${view.persona.name} (${view.persona.role}).`,
    LEVEL[level],
    "Write only your own next message, in the first person, as a student would type it: a few sentences at most. Never write the other side.",
  ];
  if (view.limits.question !== null) parts.push(`Your assignment asks you to answer: ${view.limits.question}`);
  if (content !== null) parts.push(`What you were given to read ("${content.name}"):\n${fence("student-reading", content.body)}`);
  if (work !== null) parts.push(`Your own work, which this chat is about ("${work.name}"):\n${fence("student-work", work.body)}`);
  return parts.join("\n\n");
}

/** The conversation from the student's side: the AI speaks as "user", the student as "assistant". */
function studentMessages(opening: string, turns: readonly Exchange[]): ModelMessage[] {
  return [
    { role: "user", content: opening },
    ...turns.flatMap((t): ModelMessage[] => [
      { role: "assistant", content: t.message },
      { role: "user", content: t.reply },
    ]),
  ];
}

async function say(db: Db, model: LanguageModel, ctx: AiCallContext, prompt: Parameters<typeof generateReply>[3]) {
  const text = (await generateReply(db, model, ctx, prompt)).trim();
  if (text === "") throw new Error("The model sent an empty reply");
  return text;
}

/** Claims the teacher's one trial slot; false while another trial runs. */
async function claimTrial(db: Db, userId: string): Promise<boolean> {
  const claimed = await db.query(
    `insert into sample_trials (user_id) values ($1)
     on conflict (user_id) do update set started_at = now()
       where sample_trials.started_at < now() - make_interval(mins => $2)
     returning user_id`,
    [userId, STALE_TRIAL_MINUTES],
  );
  return claimed.length > 0;
}

/** Runs one sample-student trial of a Study Chat the actor teaches (draft or published). */
export async function runTrial(
  db: Db,
  models: TrialModels,
  actor: Actor,
  activityId: string,
  level: TrialLevel,
): Promise<TrialOutcome> {
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity || activity.tool !== STUDY_CHAT) return { ok: false, reason: "We couldn't find that activity." };
  const parsed = StudyChatSettings.safeParse(activity.settings);
  if (!parsed.success) return { ok: false, reason: "Fix this chat's settings before trying it." };
  const settings = parsed.data;
  if (!(await claimTrial(db, actor.userId))) return { ok: false, reason: TRIAL_BUSY };

  try {
    const ctx: AiCallContext = { purpose: "trial", userId: actor.userId, courseId: activity.courseId };
    const saved = activity.contentId ? await getContent(db, actor, activity.courseId, activity.contentId) : null;
    const content = saved ? { name: saved.name, body: saved.body } : null;
    // The guide goes to the chat model and the grader only, never to the sample student.
    const guide = await aiGuide(db, activity.id);
    const work: StudentWork | null = settings.studentWork
      ? {
          name: "Sample student's work",
          body: await say(db, models.student, ctx, {
            system: studentPrompt(settings, level, content, null),
            prompt: "Before the chat, write the work you'd bring to it (a short draft, a few paragraphs), at your level. Write only the work.",
          }),
        }
      : null;

    const { opening } = settings.scenarios[0];
    const { maxTurns, question } = settings.completion;
    const turns: Exchange[] = [];
    let endedBy: Trial["endedBy"] = "cap";
    while (turns.length < TRIAL_MAX_TURNS) {
      const message = await say(db, models.student, ctx, {
        system: studentPrompt(settings, level, content, work),
        messages: studentMessages(opening, turns),
      });
      const reply = await say(db, models.reply, ctx, {
        system: chatSystemPrompt(settings, content, guide, work),
        messages: chatMessages(turns, message),
      });
      turns.push({ message, reply });
      if (maxTurns !== null && turns.length >= maxTurns) {
        endedBy = "turns";
        break;
      }
      if (await questionAnswered(db, models.check, ctx, question, turns)) {
        endedBy = "question";
        break;
      }
    }

    const grade = await gradeTurns(db, models.grader, ctx, settings, turns, guide, work, null);
    return { ok: true, trial: { opening, work, turns, endedBy, grade } };
  } catch (error) {
    console.error("trial failed:", error instanceof Error ? error.message : error);
    return { ok: false, reason: TRIAL_FAILED };
  } finally {
    await db.query("delete from sample_trials where user_id = $1", [actor.userId]);
  }
}
