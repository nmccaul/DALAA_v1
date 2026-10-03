/**
 * Reads a class list pasted from a spreadsheet or CSV: one student per line,
 * NetID first, then name, then (optionally) section. A header row is
 * recognised and may put the columns in any order. Tabs or commas both work.
 *
 * Pure: no database. Problems are reported per line so the teacher can fix
 * them; nothing is guessed (a line without a NetID is never matched by name).
 */

import { normalizeNetId } from "@/auth/admit";

export type RosterRow = { netId: string; name: string | null; section: string | null };

export type RosterProblem = { line: number; text: string; reason: string };

export type ParsedRoster = { rows: RosterRow[]; problems: RosterProblem[] };

type Columns = { netId: number; name: number; section: number | null };

const DEFAULT_COLUMNS: Columns = { netId: 0, name: 1, section: 2 };

function splitLine(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : ",";
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1").trim());
}

function headerColumns(cells: string[]): Columns | null {
  const find = (...names: string[]) =>
    cells.findIndex((c) => names.includes(c.toLowerCase().replace(/[\s_-]/g, "")));
  const netId = find("netid", "loginid", "login", "username");
  if (netId < 0) return null;
  const name = find("name", "fullname", "student", "studentname");
  const section = find("section", "sec");
  return { netId, name, section: section < 0 ? null : section };
}

export function parseRoster(text: string): ParsedRoster {
  const lines = text.split(/\r?\n/);
  const rows: RosterRow[] = [];
  const problems: RosterProblem[] = [];
  const seen = new Map<string, number>();
  let columns: Columns | null = null;

  lines.forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    const cells = splitLine(raw);

    if (!columns) {
      const header = headerColumns(cells);
      columns = header ?? DEFAULT_COLUMNS;
      if (header) return;
    }

    const cell = (i: number | null) => (i === null || i < 0 ? "" : (cells[i] ?? ""));
    const rawNetId = cell(columns.netId);
    const netId = normalizeNetId(rawNetId);
    if (!netId) {
      const reason = rawNetId ? `"${rawNetId}" isn't a NetID` : "No NetID on this line";
      problems.push({ line, text: raw.trim(), reason });
      return;
    }
    const first = seen.get(netId);
    if (first !== undefined) {
      problems.push({ line, text: raw.trim(), reason: `${netId} is already on line ${first}` });
      return;
    }
    seen.set(netId, line);
    rows.push({ netId, name: cell(columns.name) || null, section: cell(columns.section) || null });
  });

  return { rows, problems };
}
