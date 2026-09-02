"use client";

import { useFormState } from "react-dom";
import { deleteQuestion, setPublished } from "@/lib/actions/assessments";
import { idleState } from "@/lib/actions/form-state";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";

/**
 * Publish and unpublish.
 *
 * The button is disabled on an empty paper rather than hidden, so an author
 * can see that publishing exists and why it is not available yet. The server
 * action refuses the same case independently — this is the explanation, not
 * the enforcement.
 */
export function PublishToggle({
  assessmentId,
  isPublished,
  questionCount,
}: {
  assessmentId: string;
  isPublished: boolean;
  questionCount: number;
}) {
  const [state, formAction] = useFormState(setPublished, idleState);
  const blocked = !isPublished && questionCount === 0;

  return (
    <form action={formAction} className="space-y-1.5">
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <input
        type="hidden"
        name="publish"
        value={isPublished ? "false" : "true"}
      />

      <SubmitButton
        variant={isPublished ? "secondary" : "primary"}
        pendingLabel={isPublished ? "Unpublishing…" : "Publishing…"}
        className={blocked ? "pointer-events-none opacity-55" : undefined}
      >
        {isPublished ? "Unpublish" : "Publish"}
      </SubmitButton>

      {blocked && (
        <p className="text-xs text-ink-faint">Add a question first.</p>
      )}

      <FormMessage state={state} />
    </form>
  );
}

export function RemoveQuestionButton({
  questionId,
  assessmentId,
}: {
  questionId: string;
  assessmentId: string;
}) {
  const [state, formAction] = useFormState(deleteQuestion, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <button
        type="submit"
        className="rounded-lg border border-danger/40 px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/5"
      >
        Remove
        <span className="sr-only"> this question</span>
      </button>
      <FormMessage state={state} />
    </form>
  );
}
