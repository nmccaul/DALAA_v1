import { redirect } from "next/navigation";

/**
 * The Library page is gone (D-034): reuse lives in each course's Activities
 * tab ("From my other courses"). Old links and bookmarks land on Courses.
 */
export default function LibraryPage() {
  redirect("/courses");
}
