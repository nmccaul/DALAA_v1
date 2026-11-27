import { deleteFacts, type DeleteImpact } from "@/activities/delete";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteActivityAction } from "./actions";

/**
 * An activity's delete button and dialog (D-041), on its Activities row (a
 * trash icon) and on every setup wizard step (`label`, feedback 9689e37b).
 * The dialog says what deleting touches (`deleteFacts`); once students have
 * started, Delete waits for the teacher to tick that their work goes too.
 * Afterwards the teacher lands on the list it was in, with "Activity deleted."
 */
export function DeleteActivity({
  activity: a,
  label,
}: {
  activity: { id: string; title: string } & DeleteImpact;
  label?: string;
}) {
  const { facts, mustTick } = deleteFacts(a);
  return (
    <ConfirmDelete
      action={deleteActivityAction}
      fields={{ activityId: a.id, show: a.assigned ? "assigned" : "unassigned" }}
      name={a.title}
      label={label}
      mustTick={mustTick}
    >
      <ul className="flex list-disc flex-col gap-1.5 pl-5">
        {facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </ConfirmDelete>
  );
}
