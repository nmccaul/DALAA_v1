export type Tab = {
  href: string;
  label: string;
  /** match only this exact path (plus `also`) */
  exact?: boolean;
  /** other path prefixes that belong to this tab */
  also?: string[];
};

/** Whether `path` is on this tab: its own page, a page under it, or one of its `also` paths. */
export function isCurrentTab({ href, exact, also = [] }: Tab, path: string): boolean {
  const under = (p: string) => path === p || path.startsWith(`${p}/`);
  return (exact ? path === href : under(href)) || also.some(under);
}
