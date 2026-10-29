/** Shared by the Study Chat tests: a valid Harbor Bikes draft and a mock model that answers with it. */

import { MockLanguageModelV4 } from "ai/test";
import type { StudyChatSettings } from "./schema";

const usage = {
  inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 400, text: 400, reasoning: undefined },
};

export const draft = (over: Partial<StudyChatSettings> = {}): StudyChatSettings => ({
  mode: "case-chat",
  goal: "Recommend whether Harbor Bikes should open a second store, using evidence from the case.",
  scenarios: [
    {
      title: "Second store",
      situation: "Maya, the owner, is deciding whether to open a second store and wants advice.",
      opening: "Thanks for coming in. I have to decide about the second store by Friday. Where do we start?",
    },
  ],
  positions: [
    { label: "Open it", description: "Expand now while the lease is available." },
    { label: "Wait", description: "Fix cash flow first." },
  ],
  touchpoints: [{ label: "Cash flow", description: "Notices the seasonal cash squeeze." }],
  persona: {
    name: "Maya Ortiz",
    title: "Owner of Harbor Bikes",
    background: "Started the shop ten years ago.",
    tone: "Warm but busy",
    helpfulness: "balanced",
  },
  completion: { maxTurns: 12, timeLimitMinutes: null, question: null, studentCanFinish: true },
  rubric: {
    criteria: [
      { label: "Questions", description: "Asks questions that uncover the key facts.", points: 4 },
      { label: "Recommendation", description: "Makes a recommendation backed by evidence.", points: 6 },
    ],
    strictness: "balanced",
  },
  ...over,
});

/** A model that gives each answer in turn (as JSON text), then repeats the last. */
export function answering(...answers: unknown[]) {
  let call = 0;
  return new MockLanguageModelV4({
    modelId: "test/grader",
    doGenerate: async () => {
      const answer = answers[Math.min(call++, answers.length - 1)];
      return {
        content: [{ type: "text", text: typeof answer === "string" ? answer : JSON.stringify(answer) }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}
