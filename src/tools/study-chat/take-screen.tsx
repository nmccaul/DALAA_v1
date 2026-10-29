import { db } from "@/db/client";
import type { TakeScreenProps } from "@/tools/screens";
import { readChat } from "./chat";
import { ChatRoom } from "./chat-room";
import { StudyChatSettings } from "./schema";
import { ENDED } from "./student-messages";
import { studentView } from "./student-view";

/**
 * A student's Study Chat: directions, the material, then the chat. The
 * browser gets `studentView` and the finished exchanges, nothing else.
 */
export async function StudyChatTake({ actor, activity }: TakeScreenProps) {
  const parsed = StudyChatSettings.safeParse(activity.settings);
  const chat = parsed.success ? await readChat(db(), actor, activity.id) : null;
  if (!parsed.success || !chat) {
    return <p className="text-danger">This chat isn&apos;t set up correctly. Let your teacher know.</p>;
  }
  const view = studentView(parsed.data);
  const { attempt } = chat;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance break-words">{view.title}</h1>
        <Directions view={view} hasContent={activity.content !== null} />
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
      <ChatRoom
        activityId={activity.id}
        view={view}
        initialTurns={chat.turns}
        startedAt={attempt?.startedAt.toISOString() ?? null}
        ended={attempt?.status === "completed" && attempt.endedBy ? ENDED[attempt.endedBy] : null}
      />
    </div>
  );
}

function Directions({ view, hasContent }: { view: ReturnType<typeof studentView>; hasContent: boolean }) {
  const { maxTurns, timeLimitMinutes, question, studentCanFinish } = view.limits;
  const ends = [
    maxTurns !== null && `after ${maxTurns} ${maxTurns === 1 ? "message" : "messages"} from you`,
    timeLimitMinutes !== null && `after ${timeLimitMinutes} minutes, counted from your first message`,
    question !== null && "once you've answered the question below",
    studentCanFinish && "when you click Finish",
  ].filter((e): e is string => typeof e === "string");

  return (
    <div className="flex max-w-[65ch] flex-col gap-2 text-muted">
      <p>
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
