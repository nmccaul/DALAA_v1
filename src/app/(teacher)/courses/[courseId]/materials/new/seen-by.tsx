/** "Who sees it": students and the AI (course_content), or only the AI (course_guides). */
export function SeenByField() {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-bold">Who sees it</legend>
      <label className="flex items-start gap-2">
        <input type="radio" name="seenBy" value="students" defaultChecked className="mt-1" />
        <span>
          Students and the AI <span className="block text-sm text-muted">A reading students study inside an activity.</span>
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input type="radio" name="seenBy" value="ai" className="mt-1" />
        <span>
          Only the AI <span className="block text-sm text-muted">Teaching notes or an answer key. Never sent to students.</span>
        </span>
      </label>
    </fieldset>
  );
}
