import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireActor } from "@/auth/current";
import { Button, PageHeader } from "@/components/ui";
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
          <p className="text-muted">
            Not connected. When you first bring in a course from Canvas, DALAA will walk you through
            connecting your account.
          </p>
        </Section>
      </div>
    </>
  );
}
