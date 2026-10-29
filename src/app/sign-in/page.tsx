import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/auth/current";
import { devPasswordRequired, devSignInEnabled } from "@/auth/dev";
import { loginIdLabel, type LoginIdLabel } from "@/auth/login-id";
import { MIN_PASSWORD, passwordSignInAvailable, schoolDomains } from "@/auth/password";
import { Logo } from "@/components/logo";
import { Button, inputStyles } from "@/components/ui";
import { createStudentAccount, devSignIn, passwordSignIn } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

const messages = (loginId: LoginIdLabel): Record<string, string> => ({
  "not-on-roster": `We couldn't find you. Students: ask your instructor to add you to the course. Instructors: ask the DALAA team to add your ${loginId.noun}.`,
  "bad-netid": `That doesn't look like a ${loginId.noun}.`,
  password: "That email and password don't match.",
  "bad-email": "That doesn't look like an email address.",
  "not-school-email": "Use your school email address.",
  "account-exists": "There's already an account for that email. Sign in instead.",
  "weak-password": `Choose a longer password (at least ${MIN_PASSWORD} characters).`,
  disabled: "Sign-in isn't set up on this site yet.",
});

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await currentActor()) redirect("/");
  const { error, mode } = await searchParams;
  const loginId = loginIdLabel();
  const MESSAGES = messages(loginId);
  const message = typeof error === "string" ? MESSAGES[error] : undefined;
  const creating = mode === "create";
  const domains = schoolDomains();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4">
      <Link href="/" aria-label="DALAA home" className="self-start">
        <Logo height={32} />
      </Link>
      <h1 className="font-display text-3xl font-semibold tracking-tight">{creating ? "Create an account" : "Sign in"}</h1>
      {message && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {message}
        </p>
      )}
      {passwordSignInAvailable() &&
        (creating ? (
          <form action={createStudentAccount} className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              Students: create an account with your school email
              {domains.length > 0 && <> (ending in {domains.map((d) => `@${d}`).join(" or ")})</>}.
            </p>
            <EmailPassword newPassword />
            <Button>Create account</Button>
            <Link href="/sign-in" className="text-sm text-muted underline">
              Already have an account? Sign in
            </Link>
          </form>
        ) : (
          <form action={passwordSignIn} className="flex flex-col gap-4">
            <EmailPassword />
            <Button>Sign in</Button>
            <Link href="/sign-in?mode=create" className="text-sm text-muted underline">
              New student? Create an account
            </Link>
          </form>
        ))}
      {devSignInEnabled() && !creating && (
        <details className="flex flex-col gap-4" open={!passwordSignInAvailable()}>
          <summary className="cursor-pointer text-sm text-muted">Test sign-in with a {loginId.noun}</summary>
          <form action={devSignIn} className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-muted">
              This is a test sign-in. BYU sign-in replaces it before real students use DALAA.
            </p>
            <label className="flex flex-col gap-2">
              <span className="font-medium">{loginId.title}</span>
              <input name="netId" required autoComplete="username" spellCheck={false} autoCapitalize="none" className={inputStyles} />
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
            <Button variant="secondary">Sign in with {loginId.noun}</Button>
          </form>
        </details>
      )}
      {!passwordSignInAvailable() && !devSignInEnabled() && <p className="text-muted">{MESSAGES.disabled}</p>}
    </main>
  );
}

function EmailPassword({ newPassword = false }: { newPassword?: boolean }) {
  return (
    <>
      <label className="flex flex-col gap-2">
        <span className="font-medium">Email</span>
        <input name="email" type="email" required autoFocus autoComplete="email" spellCheck={false} autoCapitalize="none" className={inputStyles} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={newPassword ? MIN_PASSWORD : undefined}
          autoComplete={newPassword ? "new-password" : "current-password"}
          className={inputStyles}
        />
      </label>
    </>
  );
}
