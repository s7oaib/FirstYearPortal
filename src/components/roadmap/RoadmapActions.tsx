"use client";

import { useFormState } from "react-dom";
import {
  generateRoadmapForStudent,
  reviewRoadmap,
  toggleMilestone,
} from "@/lib/actions/roadmaps";
import { idleState } from "@/lib/actions/form-state";
import { TextInput } from "@/components/ui/Field";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";

export function GenerateRoadmapButton({
  studentId,
  hasExisting,
}: {
  studentId: string;
  hasExisting: boolean;
}) {
  const [state, formAction] = useFormState(
    generateRoadmapForStudent,
    idleState,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="studentId" value={studentId} />
      <SubmitButton size="sm" pendingLabel="Generating…">
        {hasExisting ? "Generate a new plan" : "Generate a plan"}
      </SubmitButton>
      {hasExisting && (
        <p className="text-xs text-ink-faint">
          The current plan is replaced, not edited — what you approved before
          stays on record.
        </p>
      )}
      <FormMessage state={state} />
    </form>
  );
}

/**
 * Approve or send back.
 *
 * Both buttons share one form and differ only in the `decision` they post, so
 * the remark box applies to either. Sending a plan back without a remark is
 * refused server-side — a rejection nobody can act on wastes everyone's time.
 */
export function ReviewRoadmapForm({ roadmapId }: { roadmapId: string }) {
  const [state, formAction] = useFormState(reviewRoadmap, idleState);

  return (
    <form action={formAction} className="space-y-3 border-t border-indigo-100 pt-4">
      <input type="hidden" name="roadmapId" value={roadmapId} />

      <TextInput
        label="Remarks"
        name="remarks"
        maxLength={2000}
        placeholder="What the student should know, or what needs changing"
        hint="Required when sending a plan back."
        error={state.fieldErrors?.remarks}
      />

      <div className="flex flex-wrap gap-2">
        <SubmitButton
          name="decision"
          value="approved"
          pendingLabel="Approving…"
          size="sm"
        >
          Approve — the student sees it
        </SubmitButton>
        <SubmitButton
          name="decision"
          value="rejected"
          variant="secondary"
          pendingLabel="Sending back…"
          size="sm"
        >
          Send back
        </SubmitButton>
      </div>

      <FormMessage state={state} />
    </form>
  );
}

export function MilestoneToggle({
  milestoneId,
  done,
  title,
}: {
  milestoneId: string;
  done: boolean;
  title: string;
}) {
  const [state, formAction] = useFormState(toggleMilestone, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="milestoneId" value={milestoneId} />
      <input type="hidden" name="done" value={done ? "false" : "true"} />
      <button
        type="submit"
        className={[
          "flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
          done
            ? "border-success/30 bg-success/5 text-success"
            : "border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-50",
        ].join(" ")}
      >
        <span aria-hidden="true">{done ? "✓" : "○"}</span>
        {done ? "Done" : "Mark done"}
        <span className="sr-only"> — {title}</span>
      </button>
      <FormMessage state={state} />
    </form>
  );
}
