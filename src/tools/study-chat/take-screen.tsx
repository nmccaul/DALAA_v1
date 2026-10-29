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
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance break-words">{view.title}</h1>
        <Directions view={view} hasContent={activity.content !== null} hasWork={chat.work !== null} />
      </div>
      {activity.content && (
        <details open={attempt === null} className="group rounded-panel border border-border bg-surface">
          <summary className="cursor-pointer list-none px-4 py-3 font-medium select-none">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
              ▸
            </span>
            Read first: {activity.content.name}
          </summary>
          <div className="max-h-[60vh] overflow-y-auto border-t border-border px-4 py-4 leading-relaxed whitespace-pre-wrap break-words">
            {activity.content.body}
          </div>
        </details>
      )}
      {chat.work && (
        <details className="group rounded-panel border border-border bg-surface">
          <summary className="cursor-pointer list-none px-4 py-3 font-medium select-none">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
              ▸
            </span>
            Your work: {chat.work.name}
          </summary>
          <div className="max-h-[60vh] overflow-y-auto border-t border-border px-4 py-4 leading-relaxed whitespace-pre-wrap break-words">
            {chat.work.body}
          </div>
        </details>
      )}
      {needsWork ? (
        <WorkForm activityId={activity.id} />
      ) : ended ? (
        <FinishedChat
          ended={endedReason ?? ENDED.student}
          messages={chat.turns.length}
          result={<StudentResult result={result} attemptId={ended.id} activityId={activity.id} dispute={dispute} />}
          conversation={room}
        />
      ) : (
        room
      )}
    </div>
  );
}

function Directions({ view, hasContent, hasWork }: { view: ReturnType<typeof studentView>; hasContent: boolean; hasWork: boolean }) {
  const { maxTurns, timeLimitMinutes, question, studentCanFinish } = view.limits;
  const ends = [
    maxTurns !== null && `after ${maxTurns} ${maxTurns === 1 ? "message" : "messages"} from you`,
    timeLimitMinutes !== null &&
      `after ${timeLimitMinutes} minutes, counted from ${view.bringsWork ? "when you add your work" : "your first message"}`,
    question !== null && "once you've answered the question below",
    studentCanFinish && "when you click Finish",
  ].filter((e): e is string => typeof e === "string");

  return (
    <div className="flex max-w-[65ch] flex-col gap-2 text-muted">
      <p>
        {view.bringsWork && !hasWork && "Add your own work below to start. "}
        {hasContent ? "Read the material below, then talk it through with " : "Talk it through with "}
        <span className="font-medium text-text">{view.persona.name}</span>, {view.persona.role}.
        {ends.length > 0 && ` The chat ends ${ends.join(", or ")}.`} The whole conversation is graded.
      </p>
      {question !== null && (
        <p className="rounded-control border border-border bg-surface px-3 py-2 text-text">
          <span className="font-medium">Question to answer:</span> {question}
        </p>
      )}
    </div>
  );
}
