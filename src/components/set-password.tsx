import { headers } from "next/headers";
import { setPasswordAction } from "@/app/sign-in/actions";
import { MIN_PASSWORD, type SetPasswordRefusal } from "@/auth/password";
import { Button, inputStyles } from "./ui";

const MESSAGES: Record<SetPasswordRefusal, string> = {
  "no-email": "Your account has no email address, so it can't have a password. Keep opening DALAA from Canvas.",
  "shared-login": "This is a shared test login. Its password is set by the DALAA team.",
  "email-elsewhere": "Another DALAA account uses your email address. Ask the DALAA team to sort it out.",
  mismatch: "The two passwords don't match.",
  "weak-password": `Choose a longer password (at least ${MIN_PASSWORD} characters).`,
};

/** Where the sign-in page is, as people would type it. */
async function siteAddress(): Promise<string> {
  const url = process.env.APP_URL?.trim();
  if (url) return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (await headers()).get("host") ?? "this site";
}

/**
 * "Sign in without Canvas" (D-029): set a password for the email already on
 * the account. `status` is the `?password=` the action redirected back with.
 */
export async function SetPassword({
  email,
  status,
  back,
}: {
  email: string;
  status: string | undefined;
  back: "/settings" | "/";
}) {
  const site = await siteAddress();
  const error = status && status in MESSAGES ? MESSAGES[status as SetPasswordRefusal] : undefined;
  return (
    <div id="password" className="flex scroll-mt-24 flex-col gap-4">
      <p className="text-muted">
        Set a password so you can sign in at <span translate="no">{site}</span> without Canvas, using{" "}
        <strong translate="no">{email}</strong>.
      </p>
      {status === "set" && (
        <p role="status" className="rounded-control bg-accent-soft px-3 py-2 text-sm">
          Password set. Next time, sign in at <span translate="no">{site}/sign-in</span> with {email}.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <form action={setPasswordAction} className="flex max-w-sm flex-col gap-4">
        <input type="hidden" name="back" value={back} />
        {/* Lets a password manager save it under the right account. */}
        <input type="text" hidden readOnly autoComplete="username" value={email} />
        <label className="flex flex-col gap-2">
          <span className="font-medium">New password</span>
          <input name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className={inputStyles} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-medium">Type it again</span>
          <input name="confirm" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className={inputStyles} />
        </label>
        <div>
          <Button variant="secondary">Set password</Button>
        </div>
      </form>
    </div>
  );
}
