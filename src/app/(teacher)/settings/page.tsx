import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireActor } from "@/auth/current";
import { Button, ButtonLink, PageHeader } from "@/components/ui";
import { getConnection, type ConnectionSummary } from "@/canvas/connection";
import { db } from "@/db/client";
import { disconnectCanvasAction } from "../canvas/connect/actions";
import { signOut } from "../../sign-in/actions";

export const metadata: Metadata = { title: "Settings" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  const actor = await requireActor();
  const canvas = await getConnection(db(), actor);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex max-w-2xl flex-col gap-6">
        <Section title="Your account">
          <dl className="flex flex-col gap-3">
            <Row label="Name">{actor.displayName}</Row>
            <Row label="NetID">
              <span translate="no">{actor.netId}</span>
            </Row>
            <Row label="Access">{actor.isAdmin ? "Instructor and DALAA admin" : "Instructor"}</Row>
          </dl>
          <form action={signOut}>
            <Button variant="secondary">Sign out</Button>
          </form>
        </Section>
        <Section title="Canvas">
          <CanvasStatus connection={canvas} />
        </Section>
      </div>
    </>
  );
}

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function CanvasStatus({ connection }: { connection: ConnectionSummary | null }) {
  if (!connection) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted">Not connected. You&apos;ll be asked to connect when you first bring in a course from Canvas.</p>
        <ButtonLink href="/canvas/connect" variant="secondary">Connect Canvas</ButtonLink>
      </div>
    );
  }
  const disconnectButton = (
    <form action={disconnectCanvasAction}>
      <Button variant="secondary">Disconnect</Button>
    </form>
  );
  if (connection.mode === "practice") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>Using <strong>practice Canvas</strong>: made-up courses and students.</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/canvas/connect" variant="secondary">Connect your real Canvas</ButtonLink>
          {disconnectButton}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-3">
      <dl className="flex flex-col gap-3">
        <Row label="Connected as">{connection.canvasUserName}</Row>
        <Row label="Token">
          ending in <span className="font-mono" translate="no">{connection.tokenLast4}</span>, added{" "}
          {date.format(connection.addedAt)}
        </Row>
      </dl>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/canvas/connect" variant="secondary">Replace token</ButtonLink>
        {disconnectButton}
      </div>
    </div>
  );
}
