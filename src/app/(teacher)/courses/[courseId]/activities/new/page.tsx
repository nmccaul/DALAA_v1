import { redirect } from "next/navigation";
import { loadTaughtCourse } from "@/courses/load";
import { afterPublishPath, PICKER_PARAM, pickerRequest } from "@/lti/picker";

/**
 * The old "What kind of activity?" page. "+ Activity" is a menu of types now
 * (feedback b6714065), so an old link lands back where that menu is: the
 * course's Activities tab, or Canvas's Add to Canvas picker.
 */
export default async function NewActivityPage({ params, searchParams }: PageProps<"/courses/[courseId]/activities/new">) {
  const { course } = await loadTaughtCourse((await params).courseId);
  redirect(afterPublishPath(course.id, pickerRequest((await searchParams)[PICKER_PARAM])));
}
