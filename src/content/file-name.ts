/**
 * A material's name from its file's name (Lucy, feedback 28111d81):
 * "Harbor_bikes-case.pdf" reads "Harbor bikes case". The extension goes,
 * underscores become spaces, and a name with no spaces at all has its hyphens
 * read as spaces too (one that has spaces keeps "Dunning-Kruger"). The
 * teacher's capitalization stays. Used wherever a file's name becomes a
 * material's name (src/content/read.ts) and where a Canvas file is listed.
 */
export function titleFromFileName(fileName: string): string {
  const base = fileName.trim().replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const spaced = /\s/.test(base) ? base.replace(/_+/g, " ") : base.replace(/[_-]+/g, " ");
  const title = spaced.replace(/\s+/g, " ").trim();
  return title || fileName.trim();
}
