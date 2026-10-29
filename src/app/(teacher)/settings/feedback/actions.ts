"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { resolveReport } from "@/feedback/store";

/** "Mark resolved" on a report, with the fix's commit when there was one. */
export async function resolveReportAction(form: FormData): Promise<void> {
  const id = String(form.get("id"));
  const ok = await resolveReport(db(), await requireActor(), id, String(form.get("commit") ?? ""));
  redirect(`/settings/feedback/${id}${ok ? "" : "?error=commit"}`);
}
