/**
 * A student's Study Chat: sending a message, streaming the reply, and ending
 * the chat when its settings say so. Every limit is checked here on the
 * server; the browser only shows what it's told.
 *
 * A turn counts only once its reply is saved. A failed reply leaves the turn
 * 'failed', which costs the student nothing: sending the same message again
 * with the same key tries again. A retry of a turn that already has a reply
 * gets that reply back without another model call.
 */

import type { LanguageModel } from "ai";
import { z } from "zod";
import { completeAttempt, getAttempt, getTakenActivity, startAttempt, type Attempt, type TakenActivity } from "@/attempts/store";
import { generateStructured, streamReply } from "@/ai/call";
import { aiGuide } from "@/content/guide";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { STUDY_CHAT } from "./create";
import { ENDED, REPLY_FAILED } from "./student-messages";
import { chatMessages, chatSystemPrompt, type Exchange } from "./prompt";
import { StudyChatSettings } from "./schema";
import { MAX_MESSAGE_LENGTH } from "./student-view";

/** The model that replies, and the cheap one that checks whether the question was answered. */
export type ChatModels = { reply: LanguageModel; check: LanguageModel };

/** A turn left 'pending' this long belongs to a request that died; it may be sent again. */
const STALE_PENDING_SECONDS = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A turn key is a browser-made UUID; `sendTurn` refuses anything else. */
export const validTurnKey = (key: string) => UUID.test(key);

export type TurnOutcome = { ok: true; reply: string; attempt: Attempt } | { ok: false; reason: string };

export type SendResult =
  | { kind: "refused"; reason: string }
  /** This key already has a reply. */
  | { kind: "replay"; reply: string; attempt: Attempt }
  /** A new reply: read `textStream` as it's written; `done` settles once it's saved (or failed). */
  | { kind: "stream"; textStream: AsyncIterable<string>; done: Promise<TurnOutcome> };

type Chat = { activity: TakenActivity; settings: StudyChatSettings };

async function openChat(db: Db, actor: Actor, activityId: string): Promise<Chat | { reason: string }> {
  const activity = await getTakenActivity(db, actor, activityId);
  if (!activity || activity.tool !== STUDY_CHAT) return { reason: "We couldn't find that assignment." };
  const parsed = StudyChatSettings.safeParse(activity.settings);
  if (!parsed.success) return { reason: "This chat isn't set up correctly. Let your teacher know." };
  return { activity, settings: parsed.data };
}

/** The finished exchanges of an attempt, in the order they happened. */
export async function doneTurns(db: Db, attemptId: string): Promise<Exchange[]> {
  return db.query<Exchange>(
    "select message, reply from chat_turns where attempt_id = $1 and status = 'done' order by sent_at, id",
    [attemptId],
  );
}

function timeIsUp(settings: StudyChatSettings, attempt: Attempt): boolean {
  const minutes = settings.completion.timeLimitMinutes;
  return minutes !== null && Date.now() >= attempt.startedAt.getTime() + minutes * 60_000;
}

/**
 * Asks the check model whether the student has answered the chat's question.
 * A failed check means "not yet": it must never end a chat by accident. Nor
 * does it end while the AI's last reply is waiting on the student: ending
 * there leaves the AI's own question hanging (feedback ad893b84).
 */
async function questionAnswered(
  db: Db,
  model: LanguageModel,
  actor: Actor,
  chat: Chat,
  turns: readonly Exchange[],
): Promise<boolean> {
  const question = chat.settings.completion.question;
  if (question === null) return false;
  const transcript = turns.map((t) => `Student: ${t.message}\nAI: ${t.reply}`).join("\n\n");
  try {
    const { answered, awaitingStudent } = await generateStructured(
      db,
      model,
      { purpose: "chat.check", userId: actor.userId, courseId: chat.activity.courseId },
      z.object({ answered: z.boolean(), awaitingStudent: z.boolean() }),
      {
        system:
          "You check a conversation between a student and an AI. `answered`: has the student given a real answer " +
          "to every part of the question below: a clear position or explanation in their own words, not a promise " +
          "to answer later? Whether the answer is good doesn't matter. `awaitingStudent`: does the AI's last reply " +
          "ask the student to explain, justify or add something they haven't given yet?",
        prompt: `Question: ${question}\n\nConversation:\n${transcript}`,
      },
    );
    return answered && !awaitingStudent;
  } catch (error) {
    console.error("chat.check failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Saves a reply, then ends the attempt if this turn reached a limit. */
async function finishTurn(
  db: Db,
  models: ChatModels,
  actor: Actor,
  chat: Chat,
  attempt: Attempt,
  turnId: string,
  reply: string,
): Promise<Attempt> {
  await db.query("update chat_turns set status = 'done', reply = $2, replied_at = now() where id = $1", [turnId, reply]);
  const turns = await doneTurns(db, attempt.id);
  const { maxTurns } = chat.settings.completion;
  if (maxTurns !== null && turns.length >= maxTurns) return completeAttempt(db, attempt.id, "turns");
  if (timeIsUp(chat.settings, attempt)) return completeAttempt(db, attempt.id, "time");
  if (await questionAnswered(db, models.check, actor, chat, turns)) return completeAttempt(db, attempt.id, "question");
  return attempt;
}

/**
 * Sends one student message. `clientKey` is generated by the browser per
 * message and reused on a retry.
 */
export async function sendTurn(
  db: Db,
  models: ChatModels,
  actor: Actor,
  activityId: string,
  input: { clientKey: string; message: string },
): Promise<SendResult> {
  const message = input.message.trim();
  if (!validTurnKey(input.clientKey)) throw new Error("Chat turn key must be a UUID");
  if (message === "") return { kind: "refused", reason: "Write a message first." };
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { kind: "refused", reason: `Keep it under ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.` };
  }

  const opened = await openChat(db, actor, activityId);
  if ("reason" in opened) return { kind: "refused", reason: opened.reason };
  let attempt = await startAttempt(db, actor, activityId);
  if (!attempt) return { kind: "refused", reason: "We couldn't find that assignment." };
  // Opened again now there's an attempt: it runs on its own copy of the
  // settings, even if the teacher saved changes since `opened` (D-031).
  const chat = await openChat(db, actor, activityId);
  if ("reason" in chat) return { kind: "refused", reason: chat.reason };

  await db.query(
    `update chat_turns set status = 'failed'
      where attempt_id = $1 and status = 'pending' and sent_at < now() - make_interval(secs => $2)`,
    [attempt.id, STALE_PENDING_SECONDS],
  );
  const [existing] = await db.query<{ id: string; status: "pending" | "done" | "failed"; reply: string | null }>(
    "select id, status, reply from chat_turns where attempt_id = $1 and client_key = $2",
    [attempt.id, input.clientKey],
  );
  if (existing?.status === "done") return { kind: "replay", reply: existing.reply!, attempt };
  if (existing?.status === "pending") return { kind: "refused", reason: "That message is still being answered." };

  if (attempt.status === "in_progress" && timeIsUp(chat.settings, attempt)) {
    attempt = await completeAttempt(db, attempt.id, "time");
  }
  if (attempt.status === "completed") return { kind: "refused", reason: ENDED[attempt.endedBy!] };

  const history = await doneTurns(db, attempt.id);
  const { maxTurns } = chat.settings.completion;
  if (maxTurns !== null && history.length >= maxTurns) {
    attempt = await completeAttempt(db, attempt.id, "turns");
    return { kind: "refused", reason: ENDED.turns };
  }

  // `on conflict do nothing` also covers chat_turns_one_pending: another
  // message from this student is still waiting for its reply.
  const [claimed] = existing
    ? await db.query<{ id: string }>(
        `update chat_turns set status = 'pending', message = $2, sent_at = now()
          where id = $1 and status = 'failed'
            and not exists (select 1 from chat_turns where attempt_id = $3 and status = 'pending')
          returning id`,
        [existing.id, message, attempt.id],
      )
    : await db.query<{ id: string }>(
        `insert into chat_turns (attempt_id, client_key, message) values ($1, $2, $3)
         on conflict do nothing returning id`,
        [attempt.id, input.clientKey, message],
      );
  if (!claimed) return { kind: "refused", reason: "Wait for the reply to your last message." };

  const started = attempt;
  // The guide goes into the prompt only; nothing below sends it to the student.
  const guide = await aiGuide(db, chat.activity.id);
  const stream = streamReply(
    db,
    models.reply,
    { purpose: "chat.reply", userId: actor.userId, courseId: chat.activity.courseId },
    { system: chatSystemPrompt(chat.settings, chat.activity.content, guide), messages: chatMessages(history, message) },
  );
  const done = (async (): Promise<TurnOutcome> => {
    try {
      const reply = (await stream.done).trim();
      if (reply === "") throw new Error("The model sent an empty reply");
      return { ok: true, reply, attempt: await finishTurn(db, models, actor, chat, started, claimed.id, reply) };
    } catch (error) {
      console.error("chat.reply failed:", error instanceof Error ? error.message : error);
      await db.query("update chat_turns set status = 'failed' where id = $1 and status = 'pending'", [claimed.id]);
      return { ok: false, reason: REPLY_FAILED };
    }
  })();
  return { kind: "stream", textStream: stream.textStream, done };
}

/** The student ends the chat themselves, when the teacher allows it and there's something to grade. */
export async function finishChat(
  db: Db,
  actor: Actor,
  activityId: string,
): Promise<{ ok: true; attempt: Attempt } | { ok: false; reason: string }> {
  const chat = await openChat(db, actor, activityId);
  if ("reason" in chat) return { ok: false, reason: chat.reason };
  const attempt = await getAttempt(db, actor, activityId);
  if (!attempt) return { ok: false, reason: "Send a message before you finish." };
  if (attempt.status === "completed") return { ok: true, attempt };
  if (!chat.settings.completion.studentCanFinish) return { ok: false, reason: "This chat ends on its own." };
  const [counts] = await db.query<{ done: number; pending: number }>(
    `select count(*) filter (where status = 'done')::int as done, count(*) filter (where status = 'pending')::int as pending
       from chat_turns where attempt_id = $1`,
    [attempt.id],
  );
  if (counts.pending > 0) return { ok: false, reason: "Wait for the reply to your last message." };
  if (counts.done === 0) return { ok: false, reason: "Send a message before you finish." };
  return { ok: true, attempt: await completeAttempt(db, attempt.id, "student") };
}

/** The student's chat so far: their attempt (NULL before the first message) and every finished exchange. */
export async function readChat(
  db: Db,
  actor: Actor,
  activityId: string,
): Promise<{ attempt: Attempt | null; turns: Exchange[] } | null> {
  const chat = await openChat(db, actor, activityId);
  if ("reason" in chat) return null;
  let attempt = await getAttempt(db, actor, activityId);
  if (attempt?.status === "in_progress" && timeIsUp(chat.settings, attempt)) {
    attempt = await completeAttempt(db, attempt.id, "time");
  }
  return { attempt, turns: attempt ? await doneTurns(db, attempt.id) : [] };
}
