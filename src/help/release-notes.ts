/**
 * What's new, for teachers: the Help tab's "Latest release notes". Newest
 * first, one entry per day something a teacher can see changed, in plain
 * language (no PR numbers, no internal names). Add a line here in the same PR
 * as the change; the test keeps the list in order.
 */

export type ReleaseNote = { date: string; changes: string[] };

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    date: "2026-11-12",
    changes: [
      "New Help tab: give feedback and see what's new.",
      "The DALAA tab is now called Setup.",
      "+ Activity opens a menu of activity types, and copying one from another course is in the same menu.",
      "Switch courses from the course name at the top of the page.",
      "Try an activity as a student two ways: an AI practice run, or yourself in Canvas Student View.",
      "A practice run with a struggling student no longer stops partway through.",
    ],
  },
  {
    date: "2026-11-11",
    changes: [
      "A Results tab for reviewing scores and sending them to Canvas.",
      "Study Chat appears in Canvas's Submission Type list when you create an assignment.",
    ],
  },
  {
    date: "2026-11-09",
    changes: [
      "A new activity wizard: start from your materials, and the AI suggests the goal and the kind of activity.",
      "Edit on every activity opens it in the wizard.",
      "An activity can use several materials.",
      "The Activities tab shows Assigned, Not assigned and Other courses, and copies activities between courses.",
      "Materials: add Word and PowerPoint files and web pages; your Canvas Pages and Files are listed for you.",
      "DALAA looks like Canvas, for you and for students.",
    ],
  },
  {
    date: "2026-11-04",
    changes: ["Students land on their grade when it arrives.", "Chat replies keep their formatting."],
  },
];

/** "November 12, 2026" for a YYYY-MM-DD date, without the reader's time zone moving it a day. */
export function noteDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
