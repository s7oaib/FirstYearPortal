"use client";

import { useFormState } from "react-dom";
import { createResource } from "@/lib/actions/resources";
import { idleState } from "@/lib/actions/form-state";
import { CheckboxGroup, Select, TextInput } from "@/components/ui/Field";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";
import { RESOURCE_KINDS } from "@/config/resources";
import type { LookupOption } from "@/lib/queries/student";

/**
 * Adds a resource to the catalogue.
 *
 * The tag pickers are the important part, and the hint says why: a resource
 * with no tags is never recommended to anyone, because "recommended because
 * it exists" is not an explanation. Untagged entries sit in the catalogue for
 * browsing and nothing more.
 */
export function ResourceForm({
  departments,
  interests,
  goals,
  domains,
  canVerify,
}: {
  departments: Array<{ code: string; name: string }>;
  interests: LookupOption[];
  goals: LookupOption[];
  domains: LookupOption[];
  /** Administrators can verify; everyone else adds it as unchecked. */
  canVerify: boolean;
}) {
  const [state, formAction] = useFormState(createResource, idleState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-4">
      <FormMessage state={state} />

      {!canVerify && (
        <p className="rounded-lg border border-brass-300/60 bg-brass-50 px-3.5 py-2.5 text-sm text-brass-800">
          Anything you add is shown to students as unchecked until an
          administrator opens the link and confirms it.
        </p>
      )}

      <TextInput
        label="Title"
        name="title"
        required
        error={errors.title}
        placeholder="VTU 2022 scheme — Physics cycle syllabus"
      />

      <TextInput
        label="Link"
        name="url"
        type="url"
        required
        error={errors.url}
        placeholder="https://…"
        hint="Paste the exact page. Nobody should have to search for it."
      />

      <div className="space-y-1.5">
        <label
          htmlFor="resource-description"
          className="block text-sm font-medium text-ink-muted"
        >
          Description
        </label>
        <textarea
          id="resource-description"
          name="description"
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-indigo-200 bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm hover:border-indigo-300 focus:border-indigo-500"
          placeholder="What it covers and who it suits."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Type"
          name="kind"
          defaultValue="course"
          options={RESOURCE_KINDS.map((k) => ({
            value: k.value,
            label: k.label,
          }))}
          error={errors.kind}
        />
        <TextInput
          label="Provider"
          name="provider"
          maxLength={120}
          placeholder="NPTEL, SWAYAM, VTU…"
          error={errors.provider}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          label="Department"
          name="departmentCode"
          placeholder="Any department"
          options={departments.map((d) => ({ value: d.code, label: d.name }))}
          error={errors.departmentCode}
        />
        <Select
          label="Semester"
          name="semester"
          placeholder="Any semester"
          options={[
            { value: 1, label: "Semester 1" },
            { value: 2, label: "Semester 2" },
          ]}
          error={errors.semester}
        />
        <TextInput
          label="Effort (hours)"
          name="estimatedHours"
          type="number"
          min={0}
          max={2000}
          placeholder="Unknown"
          error={errors.estimatedHours}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          name="isFree"
          defaultChecked
          className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-700"
        />
        <span>Free to access</span>
      </label>

      <div className="space-y-4 rounded-card border border-indigo-100 bg-parchment-sunk/40 p-4">
        <p className="text-sm text-ink-muted">
          Tag what this is about. These are the same words students used to
          describe themselves at registration, and they are what lets the
          portal tell a student <em>why</em> it suggested something. An
          untagged resource is never recommended to anyone.
        </p>

        <CheckboxGroup
          legend="Career goals"
          name="goalIds"
          options={goals}
          columns={2}
        />
        <CheckboxGroup
          legend="Technical domains"
          name="domainIds"
          options={domains}
          columns={2}
        />
        <CheckboxGroup
          legend="Areas of interest"
          name="interestIds"
          options={interests}
          columns={2}
        />
      </div>

      <SubmitButton pendingLabel="Adding…">Add to catalogue</SubmitButton>
    </form>
  );
}
