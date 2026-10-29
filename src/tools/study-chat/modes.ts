/**
 * Study Chat modes (ralph/PLAN.md): presets that seed the AI's draft of an
 * activity's settings. A mode is a starting point, not a separate kind of
 * activity: once drafted, every setting is the teacher's to change, and the
 * chat and grader read the settings, not the mode.
 */

export const MODE_SLUGS = [
  "explain",
  "apply",
  "liken-to-me",
  "case-chat",
  "debate",
  "pitch",
  "interview",
  "roleplay",
  "liken-to-us",
  "socratic",
  "defend",
] as const;

export type ModeSlug = (typeof MODE_SLUGS)[number];

export type Mode = {
  slug: ModeSlug;
  /** What the teacher sees on the mode card. */
  label: string;
  /** One line under the label: what the student does. */
  description: string;
  /** Tells the drafting model what kind of chat to set up, and the chat model what kind it's in. Never shown to students. */
  promptSeed: string;
  /** The chat is about the student's own work, so "Students bring their own work" is always on (schema.ts). */
  needsStudentWork: boolean;
  /** Starting points for the draft; the model and the teacher may change them. */
  hints: {
    persona: string;
    completion: string;
    rubric: string;
  };
};

export const MODES: Readonly<Record<ModeSlug, Mode>> = {
  explain: {
    slug: "explain",
    label: "Explain",
    description: "Students explain the idea to a curious beginner in their own words.",
    promptSeed:
      "The student explains the material to someone who has never heard of it (the Feynman technique). " +
      "The AI plays that beginner: it asks naive but pointed questions where the explanation is vague, " +
      "skips a step, or leans on jargon, until the idea is clear.",
    needsStudentWork: false,
    hints: {
      persona: "A friendly, curious beginner with no background in the subject.",
      completion: "Ends when the student has answered the main question clearly, or after about 10 turns.",
      rubric: "Accuracy, completeness of the key ideas, plain language, and handling of follow-up questions.",
    },
  },
  apply: {
    slug: "apply",
    label: "Apply",
    description: "Students use a concept from the material on a new situation.",
    promptSeed:
      "The AI presents a new situation the material doesn't cover directly and asks the student to apply " +
      "its concepts to it, pressing for the reasoning behind each step.",
    needsStudentWork: false,
    hints: {
      persona: "A practitioner who brings a real problem and wants a reasoned answer.",
      completion: "Ends when the student has proposed and defended a solution, or after about 10 turns.",
      rubric: "Correct use of the concept, reasoning, and fit to the specifics of the situation.",
    },
  },
  "liken-to-me": {
    slug: "liken-to-me",
    label: "Liken to me",
    description: "Students connect the material to their own life and experience.",
    promptSeed:
      "The AI helps the student connect the material to their own experience: it asks for a specific " +
      "example from their life, then how the ideas explain or change it.",
    needsStudentWork: false,
    hints: {
      persona: "A warm mentor who asks personal, open questions.",
      completion: "Ends when the student has described a concrete connection, or after about 8 turns.",
      rubric: "A specific personal example, accurate use of the material, and reflection.",
    },
  },
  "case-chat": {
    slug: "case-chat",
    label: "Case Chat",
    description: "Students question the main character of a case, then recommend what to do.",
    promptSeed:
      "The AI plays the protagonist of the case. It answers from that person's point of view and reveals " +
      "facts only when asked good questions. The student uncovers the key facts, then recommends a course of action.",
    needsStudentWork: false,
    hints: {
      persona: "The case protagonist, speaking in their own voice, under some pressure to decide.",
      completion: "Ends when the student has made and defended a recommendation, or after about 12 turns.",
      rubric: "Quality of questions, key facts uncovered, and a recommendation backed by evidence from the case.",
    },
  },
  debate: {
    slug: "debate",
    label: "Debate",
    description: "Students take a position and defend it against counter-arguments.",
    promptSeed:
      "The student takes a position on the question. The AI argues the other side with the strongest " +
      "counter-arguments it can, one at a time, and the student must answer each.",
    needsStudentWork: false,
    hints: {
      persona: "A sharp, fair opponent who concedes good points.",
      completion: "Ends after the student has answered several counter-arguments, or after about 10 turns.",
      rubric: "Clear position, use of evidence, and direct responses to counter-arguments.",
    },
  },
  pitch: {
    slug: "pitch",
    label: "Pitch",
    description: "Students pitch an idea and answer tough questions about it.",
    promptSeed:
      "The student pitches an idea based on the material. The AI plays the decision-maker hearing the " +
      "pitch and asks the hard questions a real one would: cost, risk, evidence, alternatives.",
    needsStudentWork: false,
    hints: {
      persona: "A busy, skeptical decision-maker with money or approval on the line.",
      completion: "Ends when the decision-maker has heard the pitch and the answers, or after about 10 turns.",
      rubric: "A clear proposal, value backed by evidence, and answers to objections.",
    },
  },
  interview: {
    slug: "interview",
    label: "Interview",
    description: "Students practice a discovery or proposal interview.",
    promptSeed:
      "The student practices an interview (for example, a discovery interview with a client). The AI plays " +
      "the interviewee: it shares information in answer to good open questions and stays vague when " +
      "questions are leading or closed.",
    needsStudentWork: false,
    hints: {
      persona: "A realistic interviewee with needs the student has to discover.",
      completion: "Ends when the student has uncovered the key needs, or after about 12 turns.",
      rubric: "Open questions, listening and follow-up, and an accurate summary of what was learned.",
    },
  },
  roleplay: {
    slug: "roleplay",
    label: "Roleplay",
    description: "Students practice a conversation: a hard talk, a negotiation, a problem to solve.",
    promptSeed:
      "The AI plays a character in a realistic situation from the material (a difficult conversation, a " +
      "negotiation, a customer problem). The student practices handling it well.",
    needsStudentWork: false,
    hints: {
      persona: "A realistic character with their own goals and emotions.",
      completion: "Ends when the situation is resolved, or after about 10 turns.",
      rubric: "Communication, problem-solving, and use of the ideas in the material.",
    },
  },
  "liken-to-us": {
    slug: "liken-to-us",
    label: "Liken to us",
    description: "Students apply a passage of scripture to life today.",
    promptSeed:
      "The student applies a passage of scripture to our lives today. The AI asks what the passage says, " +
      "what principle it teaches, and how that principle applies to a present-day situation, respectfully " +
      "and without pressing any one interpretation.",
    needsStudentWork: false,
    hints: {
      persona: "A thoughtful, respectful study partner.",
      completion: "Ends when the student has stated a principle and a present-day application, or after about 8 turns.",
      rubric: "Accurate reading of the passage, a clear principle, and a specific application.",
    },
  },
  socratic: {
    slug: "socratic",
    label: "Socratic",
    description: "Students have their assumptions questioned until they reason it through.",
    promptSeed:
      "The AI uses Socratic questioning: it asks the student what they believe about the topic, then " +
      "questions the assumptions behind it, one question at a time, without giving answers.",
    needsStudentWork: false,
    hints: {
      persona: "A patient questioner who never lectures and never gives the answer.",
      completion: "Ends when the student has examined their main assumption, or after about 10 turns.",
      rubric: "Identifies assumptions, reasons from evidence, and revises views when warranted.",
    },
  },
  defend: {
    slug: "defend",
    label: "Defend",
    description: "Students add their own paper, code or plan, then answer an examiner's questions about it.",
    promptSeed:
      "The student has added their own work. The AI is an examiner who has read it closely and questions the student " +
      "about it, one question at a time: why they made a choice, what a passage or a piece of code does, what the " +
      "weakest part is, how it connects to the material. It follows up when an answer is vague, quotes the work " +
      "when it asks about it, and never rewrites or fixes the work for them.",
    needsStudentWork: true,
    hints: {
      persona: "A fair, attentive examiner who has read the student's work and wants to see that they understand it.",
      completion: "Ends after about 8 student messages (a turn limit), and students can end it themselves.",
      rubric:
        "Understanding of their own work: explains its choices, accounts for how it works or argues, " +
        "acknowledges its limits, and connects it to the material.",
    },
  },
};
