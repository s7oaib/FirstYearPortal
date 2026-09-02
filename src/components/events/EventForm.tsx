"use client";

import { useFormState } from "react-dom";
import { createEvent, updateEvent } from "@/lib/actions/events";
import { idleState } from "@/lib/actions/form-state";
import { Select, TextInput } from "@/components/ui/Field";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";
import { EVENT_KINDS } from "@/config/events";
import type { EventSummary } from "@/lib/queries/events";

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Create or edit an event. One component for both, for the same reason the
 * assessment form is: the fields are identical and only the action differs.
 */
export function EventForm({
  departments,
  event,
}: {
  departments: Array<{ code: string; name: string }>;
  /** Absent when creating. */
  event?: EventSummary;
}) {
  const [state, formAction] = useFormState(
    event ? updateEvent : createEvent,
    idleState,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-4">
      <FormMessage state={state} />
      {event && <input type="hidden" name="eventId" value={event.id} />}

      <TextInput
        label="Title"
        name="title"
        defaultValue={event?.title ?? ""}
        error={errors.title}
        required
      />

      <div className="space-y-1.5">
        <label
          htmlFor="event-description"
          className="block text-sm font-medium text-ink-muted"
        >
          Description
        </label>
        <textarea
          id="event-description"
          name="description"
          rows={3}
          maxLength={4000}
          defaultValue={event?.description ?? ""}
          className="w-full rounded-lg border border-indigo-200 bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm hover:border-indigo-300 focus:border-indigo-500"
          placeholder="What it covers, who it is for, and anything students should bring."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Type"
          name="kind"
          defaultValue={event?.kind ?? "workshop"}
          options={EVENT_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          error={errors.kind}
        />
        <TextInput
          label="Venue"
          name="venue"
          maxLength={200}
          defaultValue={event?.venue ?? ""}
          placeholder="Seminar hall, Block C"
          error={errors.venue}
        />
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium text-ink-muted">
          Who it is open to
        </legend>
        <Select
          label="Department"
          name="departmentCode"
          placeholder="Any department"
          defaultValue={event?.departmentCode ?? ""}
          options={departments.map((d) => ({ value: d.code, label: d.name }))}
          error={errors.departmentCode}
        />
        <Select
          label="Semester"
          name="semester"
          placeholder="Any semester"
          defaultValue={event?.semester?.toString() ?? ""}
          options={[
            { value: 1, label: "Semester 1" },
            { value: 2, label: "Semester 2" },
          ]}
          error={errors.semester}
        />
        <TextInput
          label="Section"
          name="section"
          className="uppercase"
          maxLength={4}
          placeholder="Any"
          defaultValue={event?.section ?? ""}
          error={errors.section}
        />
      </fieldset>
      <p className="-mt-2 text-xs text-ink-faint">
        Leave a field blank to include everyone.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput
          label="Starts"
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={toLocalInput(event?.startsAt ?? null)}
          error={errors.startsAt}
        />
        <TextInput
          label="Ends"
          name="endsAt"
          type="datetime-local"
          defaultValue={toLocalInput(event?.endsAt ?? null)}
          error={errors.endsAt}
        />
        <TextInput
          label="Registration closes"
          name="registrationDeadline"
          type="datetime-local"
          defaultValue={toLocalInput(event?.registrationDeadline ?? null)}
          error={errors.registrationDeadline}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Capacity"
          name="capacity"
          type="number"
          min={1}
          placeholder="No limit"
          defaultValue={event?.capacity?.toString() ?? ""}
          hint="Leave blank for no limit."
          error={errors.capacity}
        />
        <label className="flex cursor-pointer items-start gap-2.5 pt-7 text-sm text-ink">
          <input
            type="checkbox"
            name="allowWaitlist"
            defaultChecked={event?.allowWaitlist ?? true}
            className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-700"
          />
          <span>
            Keep a waiting list once it is full
            <span className="block text-xs text-ink-faint">
              Students who miss out are admitted automatically if someone
              cancels.
            </span>
          </span>
        </label>
      </div>

      <SubmitButton pendingLabel="Saving…">
        {event ? "Save changes" : "Create event"}
      </SubmitButton>
    </form>
  );
}
