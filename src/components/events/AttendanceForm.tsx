"use client";

import { useFormState } from "react-dom";
import { markAttendance } from "@/lib/actions/events";
import { idleState } from "@/lib/actions/form-state";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";
import { registrationLabel } from "@/config/events";
import type { RosterEntry } from "@/lib/queries/events";

/**
 * Taking the register.
 *
 * The whole roster posts at once, and every row posts its id whether or not
 * the box is ticked — an unticked box sends nothing on its own, so without
 * the hidden id the action could not tell "marked absent" from "not on the
 * list". Marking the room in one submission also means a half-finished
 * register cannot be left behind by a dropped request.
 */
export function AttendanceForm({
  eventId,
  roster,
}: {
  eventId: string;
  roster: RosterEntry[];
}) {
  const [state, formAction] = useFormState(markAttendance, idleState);

  // Only people who held a seat can be present. A waitlisted student who was
  // never admitted is not "absent", they were never expected.
  const seated = roster.filter((r) => r.status === "registered");

  if (seated.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Nobody holds a place yet, so there is no register to take.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="eventId" value={eventId} />
      <FormMessage state={state} />

      <ul className="divide-y divide-indigo-100">
        {seated.map((entry) => (
          <li key={entry.id} className="py-2">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-indigo-950">
                  {entry.studentName}
                </span>
                <span className="block text-xs text-ink-faint">
                  {entry.studentUsn} · {registrationLabel(entry.status)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-sm text-ink-muted">
                <input type="hidden" name="registrationId" value={entry.id} />
                <input
                  type="checkbox"
                  name="present"
                  value={entry.id}
                  defaultChecked={entry.attended === true}
                  className="h-4 w-4 accent-success"
                />
                Present
              </span>
            </label>
          </li>
        ))}
      </ul>

      <SubmitButton pendingLabel="Saving…" size="sm">
        Save register
      </SubmitButton>
    </form>
  );
}
