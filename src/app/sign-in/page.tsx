import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/auth/current";
import { devPasswordRequired, devSignInEnabled } from "@/auth/dev";
import { Logo } from "@/components/logo";
import { Button, inputStyles } from "@/components/ui";
import { devSignIn } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

const MESSAGES: Record<string, string> = {
  "not-on-roster":
    "We couldn't find you. Students: ask your instructor to add you to the course. Instructors: ask the DALAA team to add your NetID.",
  "bad-netid": "That doesn't look like a NetID.",
  password: "That password isn't right.",
  disabled: "Sign-in isn't set up on this site yet.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await currentActor()) redirect("/");
  const { error } = await searchParams;
  const message = typeof error === "string" ? MESSAGES[error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4">
      <Link href="/" aria-label="DALAA home" className="self-start">
        <Logo height={32} />
      </Link>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Sign in</h1>
      {message && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {message}
        </p>
      )}
      {devSignInEnabled() ? (
        <form action={devSignIn} className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            This is a test sign-in. BYU sign-in replaces it before real students use DALAA.
          </p>
          <label className="flex flex-col gap-2">
            <span className="font-medium">NetID</span>
            <input name="netId" required autoFocus autoComplete="username" spellCheck={false} autoCapitalize="none" className={inputStyles} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-medium">Your name</span>
            <span className="-mt-1 text-sm text-muted">Only needed the first time.</span>
            <input name="name" autoComplete="name"  className={inputStyles} />
          </label>
          {devPasswordRequired() && (
            <label className="flex flex-col gap-2">
              <span className="font-medium">Test-site password</span>
              <input name="password" type="password" required className={inputStyles} />
            </label>
          )}
          <Button>Sign in</Button>
        </form>
      ) : (
        <p className="text-muted">{MESSAGES.disabled}</p>
      )}
    </main>
  );
}
