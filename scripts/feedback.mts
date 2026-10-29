/**
 * Pull one feedback report into `.bugs/<short id>/` for the /fix-bug skill
 * (.claude/skills/fix-bug/SKILL.md). Read-only; resolving is the admin page's
 * "Mark resolved" (src/feedback/store.ts `resolveReport`).
 *   npm run feedback -- show <id or its first 8 characters>
 */

import { mkdir, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { databaseUrl } from "../src/db/url";

const [command, rawId] = process.argv.slice(2);
const id = (rawId ?? "").trim().toLowerCase();

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

function markdown(r: Row): string {
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

if (command !== "show" || !/^[0-9a-f-]{8,36}$/.test(id)) {
  console.log("usage: npm run feedback -- show <report id or its first 8 characters>");
  process.exitCode = 1;
} else {
  const sql = postgres(databaseUrl(), { max: 1, prepare: false });
  try {
    const rows = await sql<Row[]>`
      select f.*, u.display_name as reporter
        from feedback_reports f join users u on u.id = f.user_id
       where f.id::text like ${`${id}%`}
       order by f.created_at desc limit 2`;
    if (rows.length !== 1) {
      console.log(rows.length ? `More than one report starts with ${id}; give more of the id.` : `No report starts with ${id}.`);
      process.exitCode = 1;
    } else {
      const r = rows[0];
      const dir = `.bugs/${r.id.slice(0, 8)}`;
      await mkdir(dir, { recursive: true });
      await writeFile(`${dir}/report.md`, markdown(r));
      await writeFile(`${dir}/context.json`, `${JSON.stringify(r.context, null, 2)}\n`);
      if (r.screenshot) await writeFile(`${dir}/screenshot.${r.screenshot_type === "image/png" ? "png" : "jpg"}`, r.screenshot);
      console.log(`${dir}/ — report.md, context.json${r.screenshot ? ", screenshot" : ""}`);
    }
  } finally {
    await sql.end();
  }
}
