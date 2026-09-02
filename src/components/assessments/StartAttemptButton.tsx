"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { startAttempt } from "@/lib/actions/assessments";
import { idleState } from "@/lib/actions/form-state";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";
import {
  PSYCHOMETRIC_CONSENT,
  PSYCHOMETRIC_DISCLOSURE,
} from "@/config/assessments";

/**
 * Starts an attempt.
 *
 * A psychometric assessment cannot be started until the student has been
 * shown what it is and is not, and has said so — informed consent is a
 * product requirement for these (PRD 5.7), not a nicety. The consent
 * checkbox gates the button in the browser; the disclosure text travels with
 * the assessment wherever it is displayed, so the student sees it again while
 * sitting the paper.
 */
export function StartAttemptButton({
  assessmentId,
  kind,
  resuming,
}: {
  assessmentId: string;
  kind: string;
  resuming: boolean;
}) {
  const [state, formAction] = useFormState(startAttempt, idleState);
  const [consented, setConsented] = useState(false);

  const needsConsent = kind === "psychometric";

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <FormMessage state={state} />

      {needsConsent && (
        <div className="space-y-2 rounded-lg border border-brass-300/60 bg-brass-50 px-3.5 py-3">
          <p className="text-sm text-brass-800">{PSYCHOMETRIC_DISCLOSURE}</p>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-brass-900">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brass-600"
            />
            <span>{PSYCHOMETRIC_CONSENT}</span>
          </label>
        </div>
      )}

      <SubmitButton
        pendingLabel="Opening…"
        className={needsConsent && !consented ? "pointer-events-none opacity-55" : undefined}
      >
        {resuming ? "Start a new attempt" : "Start"}
      </SubmitButton>

      {needsConsent && !consented && (
        <p className="text-xs text-ink-faint">
          Tick the box above to begin.
        </p>
      )}
    </form>
  );
}
