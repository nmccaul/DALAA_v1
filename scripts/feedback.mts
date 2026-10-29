/**
 * Feedback reports from the command line, for the /fix-bug skill
 * (.claude/skills/fix-bug/SKILL.md) and the bug loop (D-030, ralph/bugs.sh).
 *   npm run feedback -- list                     open reports the loop hasn't closed
 *   npm run feedback -- show <id>                pull one into .bugs/<short id>/
 *   npm run feedback -- claim <id> [--branch B]  mark it as being worked on
 *   npm run feedback -- record <id> <status> [--pr URL] [--commit SHA] [--note …] [--branch B]
 *   npm run feedback -- resolve <id> <sha>       merged and deployed: resolve it
 * <id> is a report id or its first 8 characters. `list` and `show` run read-only;
 * the others write only feedback_fixes and the report's resolve columns
 * (src/feedback/fixes.ts). Add --prod to use production's database: the URL is
 * pulled from Vercel into a temp dir that's deleted at once, and never printed.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { wrap } from "../src/db/client";
import { databaseUrl } from "../src/db/url";
import type { Db } from "../src/db/types";
import {
  FIX_STATUSES, claimReport, findReport, getFix, isFixStatus, listLine, openReports, readOnly, recordFix, resolveFixed,
  type Fix,
} from "../src/feedback/fixes";

const USAGE = `usage: npm run feedback -- <list | show <id> | claim <id> | record <id> <status> | resolve <id> <sha>> [--prod]
  record options: --pr URL  --commit SHA  --note TEXT  --branch NAME
  statuses: ${FIX_STATUSES.join(", ")}`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    prod: { type: "boolean" },
    pr: { type: "string" },
    commit: { type: "string" },
    note: { type: "string" },
    branch: { type: "string" },
  },
});
const [command, rawId, arg] = positionals;

type Row = {
  id: string;
  kind: string;
  note: string;
  url: string;
  context: {
    title?: string;
    userAgent?: string;
    viewport?: { w: number; h: number; dpr: number };
    colorScheme?: string;
    console?: { t: number; level: string; text: string }[];
    errors?: { t: number; message: string; stack: string | null }[];
  };
  screenshot: Uint8Array | null;
  screenshot_type: string | null;
  app_commit: string | null;
  status: string;
  fixed_commit: string | null;
  created_at: Date;
  reporter: string;
};

const time = (t: number) => new Date(t).toISOString();

function markdown(r: Row, fix: Fix | null): string {
  const c = r.context;
  const lines = [
    `# Feedback ${r.id.slice(0, 8)} · ${r.kind} · ${r.status}${r.fixed_commit ? ` (fixed in ${r.fixed_commit})` : ""}`,
    "",
    "## What they wrote",
    "",
    r.note,
    "",
    "## Where",
    "",
    `- Page: ${r.url}`,
    `- Title: ${c.title ?? "not captured"}`,
    `- Reporter: ${r.reporter}, ${r.created_at.toISOString()}`,
    `- Screen: ${c.viewport ? `${c.viewport.w}×${c.viewport.h} at ${c.viewport.dpr}x, ${c.colorScheme}` : "not captured"}`,
    `- Browser: ${c.userAgent ?? "not captured"}`,
    `- Deployed commit: ${r.app_commit ?? "none (local build)"}`,
    `- Screenshot: ${r.screenshot ? "yes" : "none"}`,
    "",
    "## What the bug loop did",
    "",
    ...(fix
      ? [
          `- Status: ${fix.status}`,
          ...(fix.branch ? [`- Branch: ${fix.branch}`] : []),
          ...(fix.prUrl ? [`- PR: ${fix.prUrl}`] : []),
          ...(fix.commit ? [`- Commit: ${fix.commit}`] : []),
          ...(fix.note ? [`- Note: ${fix.note}`] : []),
        ]
      : ["Nothing yet."]),
    "",
    `## Errors thrown (${c.errors?.length ?? 0})`,
    "",
    ...(c.errors ?? []).map((e) => `- ${time(e.t)} ${e.message}${e.stack ? `\n\n  \`\`\`\n${e.stack}\n  \`\`\`` : ""}`),
    "",
    `## Console warnings and errors (${c.console?.length ?? 0})`,
    "",
    ...(c.console ?? []).map((l) => `- ${time(l.t)} ${l.level}: ${l.text}`),
    "",
  ];
  return lines.join("\n");
}

/** Production's direct database URL, read from a Vercel env pull that's deleted before this returns. */
async function productionUrl(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "dalaa-feedback-"));
  try {
    const file = join(dir, "p.env");
    execFileSync("vercel", ["-Q", join(homedir(), ".vercel-dalaa"), "env", "pull", file, "--environment=production", "--yes"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    const line = (await readFile(file, "utf8")).split("\n").find((l) => l.startsWith("POSTGRES_URL_NON_POOLING="));
    const url = line?.slice("POSTGRES_URL_NON_POOLING=".length).trim().replace(/^"(.*)"$/, "$1");
    if (!url) throw new Error("Production has no POSTGRES_URL_NON_POOLING.");
    return url;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function show(db: Db, id: string): Promise<void> {
  const [r] = await db.query<Row>(
    `select f.*, u.display_name as reporter
       from feedback_reports f join users u on u.id = f.user_id
      where f.id = $1`,
    [id],
  );
  const fix = await getFix(db, id);
  const dir = `.bugs/${r.id.slice(0, 8)}`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/report.md`, markdown(r, fix));
  await writeFile(`${dir}/context.json`, `${JSON.stringify(r.context, null, 2)}\n`);
  if (r.screenshot) await writeFile(`${dir}/screenshot.${r.screenshot_type === "image/png" ? "png" : "jpg"}`, r.screenshot);
  console.log(`${dir}/ — report.md, context.json${r.screenshot ? ", screenshot" : ""}${fix ? ` (fix: ${fix.status})` : ""}`);
}

/** Runs the command; a string is a refusal to print, and fails the run. */
async function run(db: Db): Promise<string | void> {
  if (command === "list") {
    const rows = await readOnly(db, openReports);
    console.log(rows.length ? rows.map((r) => listLine(r)).join("\n") : "No open reports.");
    return;
  }
  if (!["show", "claim", "record", "resolve"].includes(command ?? "")) return USAGE;
  const found = await readOnly(db, (tx) => findReport(tx, rawId ?? ""));
  if ("problem" in found) return found.problem;
  const { id } = found;

  if (command === "show") return readOnly(db, (tx) => show(tx, id));
  if (command === "claim") {
    if (!(await claimReport(db, id, opts.branch ?? null))) return "Already claimed or closed, or not open.";
    console.log(`Claimed ${id.slice(0, 8)}.`);
    return;
  }
  if (command === "record") {
    if (!arg || !isFixStatus(arg)) return USAGE;
    const outcome = await recordFix(db, id, { status: arg, prUrl: opts.pr, commit: opts.commit, note: opts.note, branch: opts.branch });
    if (!outcome.ok) return outcome.problem;
    console.log(`Recorded ${id.slice(0, 8)}: ${arg}.`);
    return;
  }
  const outcome = await resolveFixed(db, id, arg ?? "");
  if (!outcome.ok) return outcome.problem;
  console.log(`Resolved ${id.slice(0, 8)} in ${arg}.`);
}

// Locally, the same .env.local the app reads (variables already set win).
if (!opts.prod && existsSync(".env.local")) process.loadEnvFile(".env.local");
const sql = postgres(opts.prod ? await productionUrl() : databaseUrl(), { max: 1, prepare: false });
try {
  const problem = await run(wrap(sql));
  if (problem) {
    console.log(problem);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
