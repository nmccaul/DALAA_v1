import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" />
      <EmptyState title="Nothing in your library yet">
        <p>
          Activities you create are saved here, so you can reuse them in another course or next term.
        </p>
      </EmptyState>
    </>
  );
}
