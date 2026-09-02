"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { addQuestion } from "@/lib/actions/assessments";
import { idleState } from "@/lib/actions/form-state";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";
import { QUESTION_KINDS, hasOptions } from "@/config/assessments";

const BLANK = { label: "", correct: false, score: "0" };

/**
 * Adds one question to a paper.
 *
 * The option rows change shape with the question type, because the same three
 * fields mean different things: a choice question needs "which is correct",
 * a Likert item needs "what is this worth", and a written answer needs
 * neither. Showing all of them always would invite an author to set a correct
 * answer on a scale item, which is not a thing that exists.
 */
export function QuestionForm({ assessmentId }: { assessmentId: string }) {
  const [state, formAction] = useFormState(addQuestion, idleState);
  const [kind, setKind] = useState<string>("single_choice");
  const [options, setOptions] = useState([{ ...BLANK }, { ...BLANK }]);

  const errors = state.fieldErrors ?? {};
  const showsOptions = hasOptions(kind);
  const isLikert = kind === "likert";
  const isTrueFalse = kind === "true_false";

  function setOption(index: number, patch: Partial<typeof BLANK>) {
    setOptions((current) =>
      current.map((option, i) => (i === index ? { ...option, ...patch } : option)),
    );
  }

  function chooseKind(next: string) {
    setKind(next);
    // True/false has exactly two options and they are not the author's to
    // name, so they are filled in rather than left as empty boxes.
    if (next === "true_false") {
      setOptions([
        { label: "True", correct: false, score: "0" },
        { label: "False", correct: false, score: "0" },
      ]);
    } else if (!hasOptions(next)) {
      setOptions([]);
    } else if (options.length < 2) {
      setOptions([{ ...BLANK }, { ...BLANK }]);
    }
  }

  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <FormMessage state={state} />

      <Select
        label="Question type"
        name="kind"
        value={kind}
        onChange={(event) => chooseKind(event.target.value)}
        options={QUESTION_KINDS.map((q) => ({ value: q.value, label: q.label }))}
        error={errors.kind}
      />

      <div className="space-y-1.5">
        <label htmlFor="prompt" className="block text-sm font-medium text-ink-muted">
          Question
        </label>
        <textarea
          id="prompt"
          name="prompt"
          rows={2}
          maxLength={2000}
          required
          className="w-full rounded-lg border border-indigo-200 bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm hover:border-indigo-300 focus:border-indigo-500"
        />
        {errors.prompt && (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.prompt}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Points"
          name="points"
          type="number"
          min={0}
          step="0.5"
          defaultValue="1"
          error={errors.points}
        />
        <TextInput label="Help text" name="helpText" maxLength={500} />
      </div>

      {showsOptions && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-muted">
            {isLikert ? "Scale points" : "Options"}
          </legend>
          {errors.options && (
            <p role="alert" className="text-xs font-medium text-danger">
              {errors.options}
            </p>
          )}

          {options.map((option, index) => (
            <div
              key={index}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-2"
            >
              <input
                name="optionLabel"
                value={option.label}
                onChange={(event) =>
                  setOption(index, { label: event.target.value })
                }
                readOnly={isTrueFalse}
                placeholder={isLikert ? "e.g. Strongly agree" : "Option text"}
                aria-label={`Option ${index + 1}`}
                className="h-9 min-w-[12rem] flex-1 rounded-lg border border-indigo-200 px-3 text-sm text-ink read-only:bg-parchment-sunk"
              />

              {isLikert ? (
                <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                  Value
                  <input
                    name="optionScore"
                    type="number"
                    step="0.5"
                    value={option.score}
                    onChange={(event) =>
                      setOption(index, { score: event.target.value })
                    }
                    aria-label={`Score for option ${index + 1}`}
                    className="h-9 w-20 rounded-lg border border-indigo-200 px-2 text-sm"
                  />
                </label>
              ) : (
                <>
                  {/* Score is posted for every option so the arrays stay
                      aligned by index on the server. */}
                  <input type="hidden" name="optionScore" value="0" />
                  <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      name="optionCorrect"
                      value={index}
                      checked={option.correct}
                      onChange={(event) =>
                        setOption(index, { correct: event.target.checked })
                      }
                      className="h-4 w-4 accent-success"
                    />
                    Correct
                  </label>
                </>
              )}

              {!isTrueFalse && options.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setOptions((current) => current.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          ))}

          {!isTrueFalse && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setOptions((current) => [...current, { ...BLANK }])}
            >
              Add option
            </Button>
          )}
        </fieldset>
      )}

      <SubmitButton pendingLabel="Adding…">Add question</SubmitButton>
    </form>
  );
}
