/**
 * Which model does what (D-026). Both are Vercel AI Gateway model strings from
 * the environment, so switching providers is an env change, not a code change.
 * Locally the gateway reads AI_GATEWAY_API_KEY; on Vercel it uses OIDC.
 *
 * Server-only. Tests never call these: they pass a mock model to `src/ai/call.ts`.
 */

import { gateway, type LanguageModel, type TranscriptionModel } from "ai";

function modelFromEnv(name: "CHAT_MODEL" | "GRADER_MODEL"): LanguageModel {
  const id = process.env[name]?.trim();
  if (!id) throw new Error(`${name} is not set`);
  return gateway(id);
}

/** The model students talk to: fast and cheap. */
export function chatModel(): LanguageModel {
  return modelFromEnv("CHAT_MODEL");
}

/** The model that grades transcripts and drafts settings: careful. */
export function graderModel(): LanguageModel {
  return modelFromEnv("GRADER_MODEL");
}

/**
 * The model that turns a student's speech into their message (D-038). An env
 * override like the others; without one, OpenAI's small transcriber (about
 * $0.003 a minute), since dictation shouldn't need setting up to work.
 */
export function dictationModel(): TranscriptionModel {
  return gateway.transcriptionModel(process.env.DICTATION_MODEL?.trim() || "openai/gpt-4o-mini-transcribe");
}
