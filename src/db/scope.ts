/**
 * The scope builder — every ownership filter goes through here (CLAUDE.md, D-018).
 * No hand-written WHERE clause on membership anywhere else.
 *
 * A scope is never empty: "no access" is MATCH_NOTHING, a value you have to
 * choose. An empty fragment dropped into `where` is either a syntax error or —
 * once someone "fixes" it by removing the `where` — every row in the table.
 *
 * Composition renumbers placeholders by offset and wraps each part in
 * parentheses. It never rewrites text inside a fragment (DAALAA's `or()` split
 * on " and " and silently widened scopes — don't reintroduce that).
 */

export type Scope = {
  /** SQL with $1-style placeholders, numbered from 1 within this fragment. */
  readonly text: string;
  readonly values: readonly unknown[];
};

export const MATCH_NOTHING: Scope = { text: "false", values: [] };
export const MATCH_ALL: Scope = { text: "true", values: [] };

/** Who is acting. Resolved only by `src/auth`, then passed to scopes. */
export type Actor = {
  readonly userId: string;
  readonly institutionId: string;
  readonly netId: string;
  readonly displayName: string;
  /** On the staff allowlist right now — checked at every request, not cached. */
  readonly isStaff: boolean;
  readonly isAdmin: boolean;
};

export function and(...parts: readonly Scope[]): Scope {
  return compose(" and ", parts);
}

export function or(...parts: readonly Scope[]): Scope {
  return compose(" or ", parts);
}

function compose(joiner: string, parts: readonly Scope[]): Scope {
  if (parts.length === 0) return MATCH_NOTHING;
  const values: unknown[] = [];
  const texts = parts.map((part) => {
    const offset = values.length;
    values.push(...part.values);
    return `(${part.text.replace(/\$(\d+)/g, (_, n: string) => `$${offset + Number(n)}`)})`;
  });
  return { text: texts.join(joiner), values };
}

const ALIAS = /^[a-z][a-z0-9_]*$/;

function checkAlias(alias: string): string {
  if (!ALIAS.test(alias)) throw new Error(`Bad table alias: ${alias}`);
  return alias;
}

/** Courses the actor may open at all: as an active member, or as admin. */
export function coursesVisibleTo(actor: Actor, alias = "c"): Scope {
  if (actor.isAdmin) return MATCH_ALL;
  const a = checkAlias(alias);
  return {
    text: `exists (select 1 from course_members cm
                    where cm.course_id = ${a}.id and cm.user_id = $1
                      and cm.status = 'active')`,
    values: [actor.userId],
  };
}

/**
 * Courses the actor teaches — the teacher home page. Admins get only their own
 * here; seeing everyone's courses is a separate, explicit admin view. Someone
 * removed from the staff allowlist teaches nothing, even with old memberships.
 */
export function coursesTaughtBy(actor: Actor, alias = "c"): Scope {
  if (!actor.isStaff) return MATCH_NOTHING;
  const a = checkAlias(alias);
  return {
    text: `exists (select 1 from course_members cm
                    where cm.course_id = ${a}.id and cm.user_id = $1
                      and cm.role = 'instructor' and cm.status = 'active')`,
    values: [actor.userId],
  };
}
