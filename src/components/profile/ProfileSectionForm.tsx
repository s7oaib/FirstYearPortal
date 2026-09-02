"use client";

import { useFormState } from "react-dom";
import { Select, TextInput, CheckboxGroup } from "@/components/ui/Field";
import { FormMessage, SubmitButton } from "@/components/ui/FormStatus";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { idleState, type ActionState } from "@/lib/actions/form-state";
import type { LookupOption } from "@/lib/queries/student";
import { RESIDENCE_TYPES } from "@/config/residence";

type ServerAction = (
  prev: ActionState,
  formData: FormData,
) => Promise<ActionState>;

const QUOTA_OPTIONS = [
  { value: "cet", label: "KCET" },
  { value: "comedk", label: "COMEDK" },
  { value: "jee", label: "JEE / Central counselling" },
  { value: "management", label: "Management quota" },
  { value: "diploma_lateral", label: "Diploma lateral entry" },
  { value: "other", label: "Other" },
];

export type PersonalDefaults = {
  fullName: string | null;
  usn: string | null;
  email?: string | null;
  departmentName?: string | null;
  dob: string | null;
  phone: string | null;
  state: string | null;
  city: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  residenceType: string | null;
};

export function PersonalSectionForm({
  action,
  defaults,
  complete,
}: {
  action: ServerAction;
  defaults: PersonalDefaults;
  complete: boolean;
}) {
  const [state, formAction] = useFormState(action, idleState);

  return (
    <Card as="section">
      <CardHeader
        title="Personal, guardian & residence details"
        description="Your personal information, contact numbers, and accommodation during term."
        eyebrow={complete ? "Complete" : "Needs attention"}
      />
      <CardBody>
        <form action={formAction} noValidate className="space-y-4">
          <FormMessage state={state} />

          <div className="rounded-lg border border-indigo-100 bg-parchment-sunk/40 p-3.5">
            <div className="grid gap-3 text-xs sm:grid-cols-3">
              <div>
                <span className="block font-medium text-ink-muted">USN</span>
                <span className="font-mono text-sm text-indigo-950 font-medium">
                  {defaults.usn ?? "—"}
                </span>
              </div>
              <div>
                <span className="block font-medium text-ink-muted">Department</span>
                <span className="text-sm text-indigo-950 font-medium">
                  {defaults.departmentName ?? "—"}
                </span>
              </div>
              <div>
                <span className="block font-medium text-ink-muted">Institutional Email</span>
                <span className="break-all text-sm text-indigo-950 font-medium">
                  {defaults.email ?? "—"}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">
              USN, Department, and Email are managed by the portal administration.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Full name"
              name="fullName"
              defaultValue={defaults.fullName ?? ""}
              error={state.fieldErrors?.fullName}
              required
            />
            <TextInput
              label="Date of birth"
              name="dob"
              type="date"
              defaultValue={defaults.dob ?? ""}
              error={state.fieldErrors?.dob}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Mobile number"
              name="phone"
              type="tel"
              placeholder="10-digit mobile"
              defaultValue={defaults.phone ?? ""}
              error={state.fieldErrors?.phone}
              required
            />
            <Select
              label="Residence type"
              name="residenceType"
              placeholder="Select where you live during term"
              options={RESIDENCE_TYPES as unknown as Array<{ value: string; label: string }>}
              defaultValue={defaults.residenceType ?? ""}
              error={state.fieldErrors?.residenceType}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="City / Town"
              name="city"
              defaultValue={defaults.city ?? ""}
              error={state.fieldErrors?.city}
              required
            />
            <TextInput
              label="State"
              name="state"
              defaultValue={defaults.state ?? ""}
              error={state.fieldErrors?.state}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Parent / Guardian's name"
              name="guardianName"
              defaultValue={defaults.guardianName ?? ""}
              error={state.fieldErrors?.guardianName}
              required
            />
            <TextInput
              label="Guardian's mobile number"
              name="guardianPhone"
              type="tel"
              placeholder="10-digit mobile"
              defaultValue={defaults.guardianPhone ?? ""}
              error={state.fieldErrors?.guardianPhone}
              required
            />
          </div>

          <div className="flex justify-end border-t border-indigo-100 pt-4">
            <SubmitButton>Save section</SubmitButton>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export type AcademicDefaults = {
  tenthPercentage: number | null;
  twelfthPercentage: number | null;
  quota: string | null;
  entranceRank: number | null;
  semester: number | null;
  section: string | null;
  admissionYear: number | null;
};

/**
 * Each section is an independent `<form action={serverAction}>`, so a student
 * can save one section and come back later (PRD 5.2) without the others
 * being validated or overwritten.
 */
export function AcademicSectionForm({
  action,
  defaults,
  complete,
}: {
  action: ServerAction;
  defaults: AcademicDefaults;
  complete: boolean;
}) {
  const [state, formAction] = useFormState(action, idleState);

  return (
    <Card as="section">
      <CardHeader
        title="Academic background"
        description="Your qualifying marks and current placement at the college."
        eyebrow={complete ? "Complete" : "Needs attention"}
      />
      <CardBody>
        <form action={formAction} noValidate className="space-y-4">
          <FormMessage state={state} />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="10th percentage"
              name="tenthPercentage"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={defaults.tenthPercentage ?? ""}
              error={state.fieldErrors?.tenthPercentage}
            />
            <TextInput
              label="12th / PUC percentage"
              name="twelfthPercentage"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={defaults.twelfthPercentage ?? ""}
              error={state.fieldErrors?.twelfthPercentage}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Admission quota"
              name="quota"
              placeholder="Select your quota"
              options={QUOTA_OPTIONS}
              defaultValue={defaults.quota ?? ""}
              error={state.fieldErrors?.quota}
            />
            <TextInput
              label="Entrance rank"
              name="entranceRank"
              type="number"
              min={0}
              defaultValue={defaults.entranceRank ?? ""}
              hint="Leave blank if you joined under management quota."
              error={state.fieldErrors?.entranceRank}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Semester"
              name="semester"
              placeholder="Select"
              options={[
                { value: 1, label: "Semester 1" },
                { value: 2, label: "Semester 2" },
              ]}
              defaultValue={defaults.semester ?? ""}
              error={state.fieldErrors?.semester}
            />
            <TextInput
              label="Section"
              name="section"
              placeholder="A"
              maxLength={4}
              className="uppercase"
              defaultValue={defaults.section ?? ""}
              error={state.fieldErrors?.section}
            />
            <TextInput
              label="Admission year"
              name="admissionYear"
              type="number"
              placeholder={String(new Date().getFullYear())}
              defaultValue={defaults.admissionYear ?? ""}
              error={state.fieldErrors?.admissionYear}
            />
          </div>

          <div className="flex justify-end border-t border-indigo-100 pt-4">
            <SubmitButton>Save section</SubmitButton>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function SelectionSectionForm({
  action,
  title,
  description,
  legend,
  options,
  selected,
  complete,
  columns = 2,
}: {
  action: ServerAction;
  title: string;
  description: string;
  legend: string;
  options: LookupOption[];
  selected: number[];
  complete: boolean;
  columns?: 1 | 2 | 3;
}) {
  const [state, formAction] = useFormState(action, idleState);

  return (
    <Card as="section">
      <CardHeader
        title={title}
        description={description}
        eyebrow={complete ? "Complete" : "Needs attention"}
      />
      <CardBody>
        <form action={formAction} noValidate className="space-y-4">
          <FormMessage state={state} />

          <CheckboxGroup
            legend={legend}
            name="ids"
            options={options}
            defaultSelected={selected}
            error={state.fieldErrors?.ids}
            columns={columns}
          />

          <div className="flex justify-end border-t border-indigo-100 pt-4">
            <SubmitButton>Save section</SubmitButton>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
