"use client";

import { useFormState } from "react-dom";
import { saveAnswers } from "@/lib/actions/assessments";
import { idleState } from "@/lib/actions/form-state";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PSYCHOMETRIC_DISCLOSURE } from "@/config/assessments";
import type { ExamQuestion } from "@/lib/queries/assessments";
import type { StoredAnswer } from "@/lib/queries/assessments";

/**
 * The sitting screen.
 *
 * Two submit buttons share one form: "Save and continue later" and "Submit".
 * They differ only in the `submit` value they post, so a student's answers
 * travel the same path either way and a save can never be mistaken for a
 * submission — which is final, and cannot be undone by the student.
 *
 * Nothing here knows which option is correct. The questions arrive from
 * `exam_questions` / `exam_options`, which omit `is_correct` at the database
 * level, so the answer key is not in the page source for anyone to read.
 */
export function ExamForm({
  attemptId,
  questions,
  existing,
  isPsychometric,
}: {
  attemptId: string;
  questions: ExamQuestion[];
  existing: StoredAnswer[];
  isPsychometric: boolean;
}) {
  const [state, formAction] = useFormState(saveAnswers, idleState);

  const answerFor = (questionId: string) =>
    existing.find((a) => a.questionId === questionId);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="attemptId" value={attemptId} />
      <FormMessage state={state} />

      {isPsychometric && (
        <p className="rounded-lg border border-brass-300/60 bg-brass-50 px-3.5 py-2.5 text-sm text-brass-800">
          {PSYCHOMETRIC_DISCLOSURE}
        </p>
      )}

      <ol className="space-y-4">
        {questions.map((question, index) => {
          const saved = answerFor(question.id);
          const selected = new Set(saved?.selectedOptionIds ?? []);

          return (
            <li key={question.id}>
              <Card as="section">
                <CardHeader
                  title={`${index + 1}. ${question.prompt}`}
                  description={question.helpText ?? undefined}
                  eyebrow={
                    question.points === 1
                      ? "1 point"
                      : `${question.points} points`
                  }
                />
                <CardBody className="space-y-2">
                  {question.kind === "short_answer" ||
                  question.kind === "long_answer" ? (
                    <>
                      <label
                        htmlFor={`text-${question.id}`}
                        className="sr-only"
                      >
                        Your answer to question {index + 1}
                      </label>
                      <textarea
                        id={`text-${question.id}`}
                        name={`text:${question.id}`}
                        defaultValue={saved?.textAnswer ?? ""}
                        rows={question.kind === "long_answer" ? 8 : 3}
                        maxLength={5000}
                        required={question.required}
                        className="w-full rounded-lg border border-indigo-200 bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm placeholder:text-ink-faint hover:border-indigo-300 focus:border-indigo-500"
                        placeholder="Type your answer"
                      />
                    </>
                  ) : (
                    <fieldset className="space-y-2">
                      <legend className="sr-only">
                        Options for question {index + 1}
                      </legend>
                      {question.options.map((option) => (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-indigo-100 bg-white px-3 py-2.5 text-sm text-ink transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50"
                        >
                          <input
                            // Multiple-choice is the only type where more than
                            // one answer is meaningful; the rest are radios so
                            // the control itself enforces a single choice.
                            type={
                              question.kind === "multiple_choice"
                                ? "checkbox"
                                : "radio"
                            }
                            name={`q:${question.id}`}
                            value={option.id}
                            defaultChecked={selected.has(option.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-700"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3 border-t border-indigo-100 pt-4">
        <SubmitButton
          name="submit"
          value="false"
          variant="secondary"
          pendingLabel="Saving…"
        >
          Save and continue later
        </SubmitButton>
        <SubmitButton name="submit" value="true" pendingLabel="Submitting…">
          Submit for marking
        </SubmitButton>
        <p className="text-xs text-ink-faint">
          Submitting is final — you cannot change your answers afterwards.
        </p>
      </div>
    </form>
  );
}
