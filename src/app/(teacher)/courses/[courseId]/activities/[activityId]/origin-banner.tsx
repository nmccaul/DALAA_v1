import Link from "next/link";
import { originListPath } from "@/courses/origin";
import type { CourseCard } from "@/courses/queries";

/** "This is in <course>" with the way back, on an activity opened from another course's list (feedback 12b101b4). */
export function OriginBanner({ here, origin }: { here: CourseCard; origin: CourseCard }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-control border border-border bg-accent-soft px-4 py-3">
      <p>
        This is in <strong>{here.code}</strong>, not {origin.code}.
      </p>
      <Link href={originListPath(origin.id)} className="font-semibold text-accent-text underline hover:text-text">
        ‹ Back to {origin.code}
      </Link>
    </div>
  );
}
