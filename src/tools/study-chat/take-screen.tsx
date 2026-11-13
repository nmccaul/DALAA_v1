import { after } from "next/server";
import { graderModel } from "@/ai/models";
import { db } from "@/db/client";
import { latestDispute } from "@/results/disputes";
import { getResult } from "@/results/store";
import { StudentResult } from "@/results/student-result";
import type { TakeScreenProps } from "@/tools/screens";
import { readChat } from "./chat";
import { ChatRoom } from "./chat-room";
import { FinishedChat } from "./finished-chat";
import { gradeAttempt } from "./grade";
import { StudyChatSettings } from "./schema";
import { ENDED } from "./student-messages";
import { StudentSteps, type StudentStep } from "./student-steps";
import { studentView } from "./student-view";
import { WorkForm } from "./work-form";

/**
 * A student's Study Chat: directions, the material, then the chat. Once it
 * has ended, the grade comes first and the chat is folded away under it. The
 * browser gets `studentView`, the finished exchanges and the student's own
 * result (and their own work, when the chat asks for it), nothing else. A
 * chat about the student's own work opens only once they've added it. An ended chat with no
 * grade yet (or a failed one) is graded after the page is sent.
 */
export async function StudyChatTake({ actor, activity }: TakeScreenProps) {
  const parsed = StudyChatSettings.safeParse(activity.settings);
  const chat = parsed.success ? await readChat(db(), actor, activity.id) : null;
  if (!parsed.success || !chat) {
    return <p className="text-danger">This chat isn&apos;t set up correctly. Let your teacher know.</p>;
  }
  const view = studentView(parsed.data);
  const { attempt } = chat;
  const ended = attempt?.status === "completed" ? attempt : null;
  const result = ended ? await getResult(db(), ended.id) : null;
  if (ended && result?.status !== "graded") after(() => gradeAttempt(db(), graderModel(), ended.id));
  const dispute = ended && result?.status === "graded" ? await latestDispute(db(), ended.id) : null;
  const endedReason = ended?.endedBy ? ENDED[ended.endedBy] : null;
  const needsWork = view.bringsWork && !ended && chat.work === null;
  const room = (
    <ChatRoom
      activityId={activity.id}
      view={view}
      initialTurns={chat.turns}
      startedAt={attempt?.startedAt.toISOString() ?? null}
      ended={endedReason}
      progress={chat.progress}
    />
  );

  const hasReading = activity.readings.length > 0 || chat.work !== null;
  const reading = (
    <div className="flex flex-col gap-6">
      {activity.readings.map((r, i) => (
        <article key={i} className="flex flex-col gap-3 rounded-panel border border-border bg-surface px-5 py-5 sm:px-8">
          <h2 className="font-display text-xl font-semibold break-words">{r.name}</h2>
          <div className="max-w-[70ch] text-[1.0625rem] leading-relaxed whitespace-pre-wrap break-words">{r.body}</div>
        </article>
      ))}
      {chat.work && (
        <article className="flex flex-col gap-3 rounded-panel border border-border bg-surface px-5 py-5 sm:px-8">
          <h2 className="font-display text-xl font-semibold break-words">Your work: {chat.work.name}</h2>
          <div className="max-w-[70ch] leading-relaxed whitespace-pre-wrap break-words">{chat.work.body}</div>
        </article>
      )}
    </div>
  );

  const steps: StudentStep[] = [
    {
      key: "task",
      label: "Your task",
      content: <TaskCard view={view} hasContent={activity.readings.length > 0} hasWork={chat.work !== null} />,
      next: needsWork ? "Add your work →" : hasReading ? "Start reading →" : attempt ? "Go to the chat →" : "Start the chat →",
    },
  ];
  if (needsWork) steps.push({ key: "work", label: "Your work", content: <WorkForm activityId={activity.id} /> });
  else {
    if (hasReading) {
      steps.push({
        key: "read",
        label: "Read",
        content: reading,
        next: ended ? "See your grade →" : attempt ? "Back to the chat →" : "I've read it: start the chat →",
      });
    }
    steps.push({
      key: "chat",
      label: ended ? "Your grade" : "Chat",
      link: hasReading ? { label: ended ? "Look at the material again" : "Reread the material", to: "read" } : undefined,
      content: ended ? (
        <FinishedChat
          ended={endedReason ?? ENDED.student}
          messages={chat.turns.length}
          result={<StudentResult result={result} attemptId={ended.id} activityId={activity.id} dispute={dispute} />}
          conversation={room}
        />
      ) : (
        room
      ),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[1.75rem] font-normal text-balance break-words">{view.title}</h1>
      {/* A student who has started goes straight back to the chat (or their grade). */}
      <StudentSteps steps={steps} start={needsWork ? (attempt ? "work" : "task") : attempt ? "chat" : "task"} />
    </div>
  );
}

/**
 * What the student is here to do, in one place (feedback abf69c71): the goal,
 * who they talk with and when it ends, and what the grade is made of
 * (criterion names and points only). The chat's question isn't here: the
 * character asks it, and it stays in sight above the chat.
 */
function TaskCard({ view, hasContent, hasWork }: { view: ReturnType<typeof studentView>; hasContent: boolean; hasWork: boolean }) {
  const { maxTurns, timeLimitMinutes, question, studentCanFinish } = view.limits;
  const ends = [
    maxTurns !== null && `after ${maxTurns} ${maxTurns === 1 ? "message" : "messages"} from you`,
    timeLimitMinutes !== null &&
      `after ${timeLimitMinutes} minutes, counted from ${view.bringsWork ? "when you add your work" : "your first message"}`,
    // The question is the character's to ask in the chat, often in their voice (Nathan, 2026-11-13).
    question !== null && `once you've answered ${view.persona.name}'s question`,
    studentCanFinish && "when you click Finish",
  ].filter((e): e is string => typeof e === "string");
  const total = view.criteria.reduce((sum, c) => sum + c.points, 0);
  const pts = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${n === 1 ? "pt" : "pts"}`;

  return (
    <section aria-label="Your task" className="flex flex-col gap-5 rounded-panel border border-accent bg-surface px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-bold tracking-wide text-accent-text uppercase">Your goal</h2>
        <p className="font-medium">By the end, you should be able to: {view.goal}</p>
      </div>
      </div>
      <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-sm">
        <h2 className="text-xs font-bold tracking-wide text-accent-text uppercase">How it works</h2>
        <ol className="flex list-decimal flex-col gap-0.5 pl-5">
          {view.bringsWork && <li>{hasWork ? "You added your work." : "Add your own work to start."}</li>}
          {hasContent && <li>Read the material.</li>}
          <li>
            Talk it through with <span className="font-medium">{view.persona.name}</span>, {view.persona.role}. Explain in your own
            words.
          </li>
          {ends.length > 0 && <li>The chat ends {ends.join(", or ")}.</li>}
        </ol>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <h2 className="text-xs font-bold tracking-wide text-accent-text uppercase">How you&apos;re graded · {pts(total)}</h2>
        <ul className="flex flex-col gap-0.5">
          {view.criteria.map((c) => (
            <li key={c.label} className="flex justify-between gap-3">
              <span className="min-w-0 break-words">{c.label}</span>
              <span className="whitespace-nowrap text-muted tabular-nums">{pts(c.points)}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted">The whole conversation is graded.</p>
      </div>
      </div>
    </section>
  );
}
