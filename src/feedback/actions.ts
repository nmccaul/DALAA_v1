"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { isPriority } from "@/feedback/report";
import { setReportPriority } from "@/feedback/store";

/** An admin changing a report's priority, from Help's list or the inbox (D-042); anyone else changes nothing. */
export async function setPriorityAction(form: FormData): Promise<void> {
  const raw = form.get("priority");
  await setReportPriority(db(), await requireActor(), String(form.get("id") ?? ""), isPriority(raw) ? raw : null);
  revalidatePath("/courses/[courseId]/help", "page");
  revalidatePath("/settings/feedback", "layout");
}
