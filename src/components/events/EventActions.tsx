"use client";

import { useFormState } from "react-dom";
import {
  cancelRegistration,
  registerForEvent,
  setEventPublished,
  submitFeedback,
} from "@/lib/actions/events";
import { idleState } from "@/lib/actions/form-state";
import { Select, TextInput } from "@/components/ui/Field";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";

export function RegisterButton({
  eventId,
  willWaitlist,
}: {
  eventId: string;
  willWaitlist: boolean;
}) {
  const [state, formAction] = useFormState(registerForEvent, idleState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="eventId" value={eventId} />
      <SubmitButton pendingLabel="Registering…" size="sm">
        {/* Said before the click, not after: a student who wanted a seat
            should know they are joining a queue before they commit. */}
        {willWaitlist ? "Join the waiting list" : "Register"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function CancelButton({ registrationId }: { registrationId: string }) {
  const [state, formAction] = useFormState(cancelRegistration, idleState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="registrationId" value={registrationId} />
      <SubmitButton pendingLabel="Cancelling…" size="sm" variant="secondary">
        Cancel my place
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function PublishEventToggle({
  eventId,
  isPublished,
}: {
  eventId: string;
  isPublished: boolean;
}) {
  const [state, formAction] = useFormState(setEventPublished, idleState);

  return (
    <form action={formAction} className="space-y-1.5">
      <input type="hidden" name="eventId" value={eventId} />
      <input
        type="hidden"
        name="publish"
        value={isPublished ? "false" : "true"}
      />
      <SubmitButton
        variant={isPublished ? "secondary" : "primary"}
        pendingLabel={isPublished ? "Unpublishing…" : "Publishing…"}
      >
        {isPublished ? "Unpublish" : "Publish"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function FeedbackForm({
  registrationId,
  rating,
  comment,
}: {
  registrationId: string;
  rating: number | null;
  comment: string | null;
}) {
  const [state, formAction] = useFormState(submitFeedback, idleState);

  return (
    <form action={formAction} className="space-y-2 border-t border-indigo-100 pt-3">
      <input type="hidden" name="registrationId" value={registrationId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Select
            label="How was it?"
            name="rating"
            placeholder="Choose"
            defaultValue={rating?.toString() ?? ""}
            options={[
              { value: 5, label: "5 — excellent" },
              { value: 4, label: "4 — good" },
              { value: 3, label: "3 — fair" },
              { value: 2, label: "2 — poor" },
              { value: 1, label: "1 — very poor" },
            ]}
            error={state.fieldErrors?.rating}
          />
        </div>
        <div className="min-w-[14rem] flex-1">
          <TextInput
            label="Anything to add"
            name="comment"
            maxLength={1000}
            defaultValue={comment ?? ""}
          />
        </div>
        <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
          Send feedback
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
