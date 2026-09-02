"use client";

import { useFormState } from "react-dom";
import { createAssessment, updateAssessment } from "@/lib/actions/assessments";
import { idleState } from "@/lib/actions/form-state";
import { Select, TextInput } from "@/components/ui/Field";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";
import { ASSESSMENT_KINDS } from "@/config/assessments";
import type { AssessmentSummary } from "@/lib/queries/assessments";

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
 * Create or edit an assessment.
 *
 * One component for both, because the fields are identical and the only
 * difference is which action receives them — keeping them apart would mean
 * two forms drifting out of step field by field.
 */
export function AssessmentForm({
  departments,
  assessment,
}: {
  departments: Array<{ code: string; name: string }>;
  /** Absent when creating. */
  assessment?: AssessmentSummary;
}) {
  const [state, formAction] = useFormState(
    assessment ? updateAssessment : createAssessment,
    idleState,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-4">
      <FormMessage state={state} />
      {assessment && (
        <input type="hidden" name="assessmentId" value={assessment.id} />
      )}

      <TextInput
        label="Title"
        name="title"
        defaultValue={assessment?.title ?? ""}
        error={errors.title}
        required
      />

      <div className="space-y-1.5">
        <label
          htmlFor="description"
          className="block text-sm font-medium text-ink-muted"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={assessment?.description ?? ""}
          className="w-full rounded-lg border border-indigo-200 bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm hover:border-indigo-300 focus:border-indigo-500"
          placeholder="What this assessment covers, and anything students should know before starting."
        />
      </div>

      <Select
        label="Type"
        name="kind"
        defaultValue={assessment?.kind ?? "general"}
        options={ASSESSMENT_KINDS.map((k) => ({
          value: k.value,
          label: `${k.label} — ${k.hint}`,
        }))}
        error={errors.kind}
      />

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium text-ink-muted">
          Audience
        </legend>
        <Select
          label="Department"
          name="departmentCode"
          placeholder="Any department"
          defaultValue={assessment?.departmentCode ?? ""}
          options={departments.map((d) => ({ value: d.code, label: d.name }))}
          error={errors.departmentCode}
        />
        <Select
          label="Semester"
          name="semester"
          placeholder="Any semester"
          defaultValue={assessment?.semester?.toString() ?? ""}
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
          defaultValue={assessment?.section ?? ""}
          error={errors.section}
        />
      </fieldset>
      <p className="-mt-2 text-xs text-ink-faint">
        Leave a field blank to include everyone. Blank department, semester,
        and section means every first-year student in the institution.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Opens at"
          name="opensAt"
          type="datetime-local"
          defaultValue={toLocalInput(assessment?.opensAt ?? null)}
          error={errors.opensAt}
        />
        <TextInput
          label="Closes at"
          name="closesAt"
          type="datetime-local"
          defaultValue={toLocalInput(assessment?.closesAt ?? null)}
          error={errors.closesAt}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput
          label="Time limit (minutes)"
          name="durationMinutes"
          type="number"
          min={1}
          max={600}
          placeholder="No limit"
          defaultValue={assessment?.durationMinutes?.toString() ?? ""}
          error={errors.durationMinutes}
        />
        <TextInput
          label="Attempts allowed"
          name="maxAttempts"
          type="number"
          min={1}
          max={10}
          defaultValue={assessment?.maxAttempts?.toString() ?? "1"}
          error={errors.maxAttempts}
        />
        <TextInput
          label="Pass mark (%)"
          name="passPercentage"
          type="number"
          min={0}
          max={100}
          step="0.01"
          placeholder="No pass mark"
          defaultValue={assessment?.passPercentage?.toString() ?? ""}
          error={errors.passPercentage}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          name="randomiseQuestions"
          defaultChecked={assessment?.randomiseQuestions ?? false}
          className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-700"
        />
        <span>Show questions in a random order</span>
      </label>

      <SubmitButton pendingLabel="Saving…">
        {assessment ? "Save changes" : "Create assessment"}
      </SubmitButton>
    </form>
  );
}
