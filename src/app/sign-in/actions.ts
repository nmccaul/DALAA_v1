"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { admit } from "@/auth/admit";
import { endSession, institutionId, requireActor, startSession } from "@/auth/current";
import { devPasswordMatches, devSignInEnabled } from "@/auth/dev";
import { createAccount, setOwnPassword, signInWithPassword, type PasswordAdmission } from "@/auth/password";
import { supabasePasswords } from "@/auth/supabase";

async function finish(result: PasswordAdmission, from: string): Promise<never> {
  if (!result.ok) redirect(`/sign-in?${from}error=${result.reason}`);
  await startSession(result.userId);
  redirect("/");
}

const credentials = (form: FormData) => ({
  email: String(form.get("email") ?? ""),
  password: String(form.get("password") ?? ""),
});

export async function passwordSignIn(form: FormData): Promise<void> {
  await finish(await signInWithPassword(db(), await institutionId(), credentials(form), supabasePasswords), "");
}

export async function createStudentAccount(form: FormData): Promise<void> {
  const result = await createAccount(db(), await institutionId(), credentials(form), supabasePasswords);
  await finish(result, "mode=create&");
}

/** "Sign in without Canvas": the signed-in person sets a password for their own email (D-029). */
export async function setPasswordAction(form: FormData): Promise<void> {
  const back = form.get("back") === "/settings" ? "/settings" : "/";
  const result = await setOwnPassword(
    db(),
    await requireActor(),
    { password: String(form.get("password") ?? ""), confirm: String(form.get("confirm") ?? "") },
    supabasePasswords,
  );
  redirect(`${back}?password=${result.ok ? "set" : result.reason}#password`);
}

export async function devSignIn(form: FormData): Promise<void> {
  if (!devSignInEnabled()) redirect("/sign-in?error=disabled");
  if (!devPasswordMatches(String(form.get("password") ?? ""))) {
    redirect("/sign-in?error=password");
  }
  const result = await admit(db(), await institutionId(), {
    netId: String(form.get("netId") ?? ""),
    displayName: String(form.get("name") ?? ""),
  });
  if (!result.ok) redirect(`/sign-in?error=${result.reason}`);
  await startSession(result.userId);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/sign-in");
}
