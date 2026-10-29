import type { ReactNode } from "react";
import type { ReviewScreenProps } from "@/tools/screens";
import { PublishForm } from "./forms";
import { MODES } from "./modes";
import { StudyChatSettings } from "./schema";

const HELPFULNESS = { challenging: "Challenging", balanced: "Balanced", supportive: "Supportive" } as const;
const STRICTNESS = { strict: "Strict", balanced: "Balanced", lenient: "Lenient" } as const;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-5">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <div className="flex flex-col gap-2 text-sm">{children}</div>
    </section>
  );
}

function Items({ items, none }: { items: { label: string; description: string }[]; none: string }) {
  if (items.length === 0) return <p className="text-muted">{none}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.label}>
          <span className="font-medium">{item.label}</span>: {item.description}
        </li>
      ))}
    </ul>
  );
}

function endings(c: StudyChatSettings["completion"]): string[] {
  return [
    c.maxTurns !== null && `After ${c.maxTurns} student ${c.maxTurns === 1 ? "message" : "messages"}`,
    c.timeLimitMinutes !== null && `After ${c.timeLimitMinutes} minutes`,
    c.question !== null && `Once the student answers: “${c.question}”`,
    c.studentCanFinish && "When the student chooses to end it",
  ].filter((e): e is string => typeof e === "string");
}

/** The drafted Study Chat as short summary cards, then Publish. Editing comes next (T19b). */
export function StudyChatReview({ activity }: ReviewScreenProps) {
  const parsed = StudyChatSettings.safeParse(activity.settings);
  if (!parsed.success) {
    return <p className="text-danger">Some of this chat&apos;s settings don&apos;t fit any more. Create it again.</p>;
  }
  const s = parsed.data;
  const scenario = s.scenarios[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight break-words">{activity.title}</h2>
        <p className="text-muted">
          {MODES[s.mode].label} · {activity.status === "published" ? "Published" : "Draft, students can't see it yet"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Goal">
          <p>{s.goal}</p>
        </Card>
        <Card title="Scenario">
          <p>{scenario.situation}</p>
          <p className="text-muted">Opens with: “{scenario.opening}”</p>
        </Card>
        <Card title="Positions">
          <Items items={s.positions} none="None: students don't pick a side." />
        </Card>
        <Card title="Touchpoints">
          <Items items={s.touchpoints} none="None tracked." />
        </Card>
        <Card title="Persona">
          <p>
            <span className="font-medium">{s.persona.name}</span>, {s.persona.title}
          </p>
          <p>{s.persona.background}</p>
          <p className="text-muted">
            Tone: {s.persona.tone} · {HELPFULNESS[s.persona.helpfulness]}
          </p>
        </Card>
        <Card title="When the chat ends">
          <ul className="list-disc pl-5">
            {endings(s.completion).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Card>
        <Card title={activity.points === null ? "Grading" : `Grading: ${activity.points} points`}>
          <ul className="flex flex-col gap-1">
            {s.rubric.criteria.map((c) => (
              <li key={c.label}>
                <span className="font-medium">
                  {c.label} ({c.points})
                </span>
                : {c.description}
              </li>
            ))}
          </ul>
          <p className="text-muted">Grader: {STRICTNESS[s.rubric.strictness]}</p>
        </Card>
      </div>

      {activity.status === "draft" && <PublishForm courseId={activity.courseId} activityId={activity.id} />}
    </div>
  );
}
