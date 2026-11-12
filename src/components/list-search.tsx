"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { createContext, use, useState, type ReactNode } from "react";
import { matchesSearch } from "./search-match";

/**
 * A Canvas-style "Search for …" box over a list the server already rendered.
 * It filters in the browser, by title, as the teacher types: make the screen's
 * outer box a <ListSearch>, put <SearchBox> where the box goes, and wrap each row in
 * <SearchItem text={title}>. The query stays when the teacher switches
 * between views of the same screen.
 */
const Query = createContext<{ query: string; setQuery: (q: string) => void }>({ query: "", setQuery: () => {} });

export function ListSearch({ className, children }: { className?: string; children: ReactNode }) {
  const [query, setQuery] = useState("");
  return (
    <Query value={{ query, setQuery }}>
      <div className={className}>{children}</div>
    </Query>
  );
}

export function SearchBox({ placeholder }: { placeholder: string }) {
  const { query, setQuery } = use(Query);
  return (
    <label className="relative flex w-full items-center sm:w-72">
      <span className="sr-only">{placeholder}</span>
      <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute left-3 text-muted" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-control border border-border-strong bg-surface py-2 pr-3 pl-9 text-text placeholder:text-muted"
      />
    </label>
  );
}

/** A row that hides when it doesn't match. */
export function SearchItem({ text, children }: { text: string; children: ReactNode }) {
  const { query } = use(Query);
  return matchesSearch(query, text) ? children : null;
}

/** A group of rows (a heading and its list) that hides when none of its rows match. */
export function SearchGroup({ texts, children }: { texts: readonly string[]; children: ReactNode }) {
  const { query } = use(Query);
  return texts.some((t) => matchesSearch(query, t)) ? children : null;
}

/** Says so when the teacher searched and nothing in `texts` matched. */
export function NoMatches({ texts, noun }: { texts: readonly string[]; noun: string }) {
  const { query } = use(Query);
  if (query.trim() === "" || texts.some((t) => matchesSearch(query, t))) return null;
  return (
    <p role="status" className="border border-dashed border-border-strong px-6 py-10 text-muted">
      No {noun} match &ldquo;{query.trim()}&rdquo;.
    </p>
  );
}
