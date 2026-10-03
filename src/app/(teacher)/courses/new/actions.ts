"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { createCourse } from "@/courses/create";
import { parseRoster, type RosterProblem } from "@/courses/roster";
import { db } from "@/db/client";

export type Fields = { creationKey: string; code: string; title: string; term: string; roster: string };

export type SetUpState = {
  fields: Fields;
  errors?: Partial<Record<"code" | "title" | "term" | "roster", string>>;
  /** Lines that couldn't be read; the teacher fixes them or continues without them. */
  problems?: RosterProblem[];
};

const MAX_UPLOAD_BYTES = 1_000_000;

export async function setUpCourse(_prev: SetUpState, form: FormData): Promise<SetUpState> {
  const actor = await requireActor();
  if (!actor.isStaff) redirect("/");

  const text = (name: string) => String(form.get(name) ?? "").trim();
  let roster = text("roster");
  const file = form.get("rosterFile");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return { fields: fieldsOf(), errors: { roster: "That file is too big for a class list. Is it the right file?" } };
    }
    roster = [roster, (await file.text()).trim()].filter(Boolean).join("\n");
  }

  function fieldsOf(): Fields {
    return { creationKey: text("creationKey"), code: text("code"), title: text("title"), term: text("term"), roster };
  }
  const fields = fieldsOf();

  const errors: SetUpState["errors"] = {};
  if (!fields.code) errors.code = "Add the course code, like BUS M 361.";
  if (!fields.title) errors.title = "Add the course title.";
  if (!fields.term) errors.term = "Add the term, like Winter 2027.";
  const parsed = parseRoster(roster);
  if (roster && parsed.rows.length === 0 && parsed.problems.length === 0) {
    errors.roster = "We couldn't find any NetIDs in that list.";
  }
  if (Object.keys(errors).length > 0) return { fields, errors };

  if (parsed.problems.length > 0 && form.get("skipProblems") !== "1") {
    return { fields, problems: parsed.problems };
  }

  const created = await createCourse(db(), actor, {
    creationKey: fields.creationKey,
    code: fields.code,
    title: fields.title,
    term: fields.term,
    students: parsed.rows,
  });
  redirect(`/courses/${created.courseId}/students?added=${created.studentsAdded}`);
}
