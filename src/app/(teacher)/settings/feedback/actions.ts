"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { resolveReport } from "@/feedback/store";

/** "Mark resolved" on a report, with the fix's commit when there was one. */
export async function resolveReportAction(form: FormData): Promise<void> {
  const id = String(form.get("id"));
  const ok = await resolveReport(db(), await requireActor(), id, String(form.get("commit") ?? ""));
  // Keep the way back to the list it was opened from (feedback 42c212ac); the page checks it again.
  const q = new URLSearchParams();
  if (!ok) q.set("error", "commit");
  const from = form.get("from");
  if (typeof from === "string" && from) q.set("from", from);
  const query = q.toString();
  redirect(`/settings/feedback/${id}${query ? `?${query}` : ""}`);
}
