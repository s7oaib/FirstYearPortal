"use client";

import { useFormState } from "react-dom";
import {
  setResourceActive,
  setResourceVerified,
  toggleSavedResource,
} from "@/lib/actions/resources";
import { idleState } from "@/lib/actions/form-state";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";

export function SaveResourceButton({
  resourceId,
  saved,
}: {
  resourceId: string;
  saved: boolean;
}) {
  const [state, formAction] = useFormState(toggleSavedResource, idleState);

  return (
    <form action={formAction} className="space-y-1.5">
      <input type="hidden" name="resourceId" value={resourceId} />
      <input type="hidden" name="save" value={saved ? "false" : "true"} />
      <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
        {saved ? "Remove from my list" : "Save to my list"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/**
 * The verification control.
 *
 * Only rendered for administrators, and the server action refuses anyone else
 * independently — as does a trigger in the database. Three checks for one
 * badge is deliberate: it is the only claim in the catalogue a student is
 * being asked to rely on.
 */
export function VerifyResourceButton({
  resourceId,
  isVerified,
}: {
  resourceId: string;
  isVerified: boolean;
}) {
  const [state, formAction] = useFormState(setResourceVerified, idleState);

  return (
    <form action={formAction} className="space-y-1.5">
      <input type="hidden" name="resourceId" value={resourceId} />
      <input type="hidden" name="verified" value={isVerified ? "false" : "true"} />
      <SubmitButton
        size="sm"
        variant={isVerified ? "secondary" : "primary"}
        pendingLabel="Saving…"
      >
        {isVerified ? "Un-check" : "I have opened this — mark checked"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function RetireResourceButton({
  resourceId,
  isActive,
}: {
  resourceId: string;
  isActive: boolean;
}) {
  const [state, formAction] = useFormState(setResourceActive, idleState);

  return (
    <form action={formAction} className="space-y-1.5">
      <input type="hidden" name="resourceId" value={resourceId} />
      <input type="hidden" name="active" value={isActive ? "false" : "true"} />
      <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
        {isActive ? "Retire" : "Restore"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
