import { getStudentWork } from "@/attempts/work";
import { db } from "@/db/client";
import type { TranscriptProps } from "@/tools/screens";
import { doneTurns } from "./chat";
import { Bubble } from "./chat-room";
import { StudyChatSettings } from "./schema";

/** The whole conversation for the teacher: the work the student brought, the opening, then every finished exchange. */
export async function StudyChatTranscript({ attempt }: TranscriptProps) {
  const parsed = StudyChatSettings.safeParse(attempt.settings);
  const persona = parsed.success ? parsed.data.persona.name : "AI";
  const [turns, work] = await Promise.all([doneTurns(db(), attempt.id), getStudentWork(db(), attempt.id)]);
  return (
    <div className="flex flex-col gap-4">
      {work && (
        <details className="group rounded-panel border border-border bg-surface">
          <summary className="cursor-pointer list-none px-4 py-3 font-medium select-none">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
              ▸
            </span>
            Their work: {work.name}
          </summary>
          <div className="max-h-[60vh] overflow-y-auto border-t border-border px-4 py-4 leading-relaxed whitespace-pre-wrap break-words">
            {work.body}
          </div>
        </details>
      )}
      {parsed.success && <Bubble from={persona} text={parsed.data.scenarios[0].opening} />}
      {turns.map((t, i) => (
        <div key={i} className="flex flex-col gap-4">
          <Bubble mine from={attempt.studentName} text={t.message} />
          <Bubble from={persona} text={t.reply} />
        </div>
      ))}
      {turns.length === 0 && <p className="text-muted">No messages yet.</p>}
    </div>
  );
}
