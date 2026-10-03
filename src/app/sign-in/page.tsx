import { redirect } from "next/navigation";
import { currentActor } from "@/auth/current";
import { devPasswordRequired, devSignInEnabled } from "@/auth/dev";
import { devSignIn } from "./actions";

const MESSAGES: Record<string, string> = {
  "not-on-roster":
    "We couldn't find you. Students: ask your instructor to add you to the course. Instructors: ask the DALAA team to add your NetID.",
  "bad-netid": "That doesn't look like a NetID.",
  password: "That password isn't right.",
  disabled: "Sign-in isn't set up on this site yet.",
};

const field = "rounded-md border border-current/25 bg-transparent px-3 py-2";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await currentActor()) redirect("/");
  const { error } = await searchParams;
  const message = typeof error === "string" ? MESSAGES[error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Sign in to DALAA</h1>
      {message && (
        <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm">
          {message}
        </p>
      )}
      {devSignInEnabled() ? (
        <form action={devSignIn} className="flex flex-col gap-4">
          <p className="text-sm opacity-70">
            Test sign-in — BYU sign-in replaces this before real students use DALAA.
          </p>
          <label className="flex flex-col gap-1">
            <span className="font-medium">NetID</span>
            <input name="netId" required autoFocus autoComplete="username" className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Your name</span>
            <input name="name" autoComplete="name" placeholder="First sign-in only" className={field} />
          </label>
          {devPasswordRequired() && (
            <label className="flex flex-col gap-1">
              <span className="font-medium">Test-site password</span>
              <input name="password" type="password" required className={field} />
            </label>
          )}
          <button className="rounded-md bg-foreground px-4 py-2 font-medium text-background">
            Sign in
          </button>
        </form>
      ) : (
        <p>{MESSAGES.disabled}</p>
      )}
    </main>
  );
}
