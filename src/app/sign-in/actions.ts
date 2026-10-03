"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { admit } from "@/auth/admit";
import { endSession, institutionId, startSession } from "@/auth/current";
import { devPasswordMatches, devSignInEnabled } from "@/auth/dev";

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
