"use client";

import { useFormState } from "react-dom";
import { gradeAnswer } from "@/lib/actions/assessments";
import { idleState } from "@/lib/actions/form-state";
import { TextInput } from "@/components/ui/Field";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";

/**
 * Records a mark on one written answer.
 *
 * Saving recomputes the whole attempt, so the student's total and pass/fail
 * update as each answer is marked rather than only when the last one is —
 * which matters because a marker may not finish a paper in one sitting.
 */
export function MarkAnswerForm({
  answerId,
  attemptId,
  maxPoints,
  currentPoints,
  currentRemarks,
}: {
  answerId: string;
  attemptId: string;
  maxPoints: number;
  currentPoints: number | null;
  currentRemarks: string | null;
}) {
  const [state, formAction] = useFormState(gradeAnswer, idleState);

  return (
    <form action={formAction} className="space-y-2 border-t border-indigo-100 pt-3">
      <input type="hidden" name="answerId" value={answerId} />
      <input type="hidden" name="attemptId" value={attemptId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <TextInput
            label={`Mark (of ${maxPoints})`}
            name="awardedPoints"
            type="number"
            min={0}
            max={maxPoints}
            step="0.5"
            defaultValue={currentPoints?.toString() ?? ""}
            error={state.fieldErrors?.awardedPoints}
          />
        </div>
        <div className="min-w-[14rem] flex-1">
          <TextInput
            label="Remarks"
            name="remarks"
            maxLength={1000}
            defaultValue={currentRemarks ?? ""}
            placeholder="What the student should take from this"
          />
        </div>
        <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
          Save mark
        </SubmitButton>
      </div>

      <FormMessage state={state} />
    </form>
  );
}
