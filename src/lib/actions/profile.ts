"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnStudent, getProfileSnapshot } from "@/lib/queries/student";
import { computeCompletionPercent } from "@/lib/profile-completion";
import {
  academicSectionSchema,
  personalSectionSchema,
  selectionSectionSchema,
} from "@/lib/validation/student";
import { fieldErrorsFrom, type ActionState } from "./form-state";

/**
 * Security layer 2 of 3 (ARCHITECTURE section 3).
 *
 * The invariant every action here upholds: the caller's `student_id` is
 * re-derived from their session via `getOwnStudent()` and is never read from
 * the submitted form. A client can therefore post any `student_id` it likes
 * and still only ever write its own row. RLS enforces the same rule at the
 * database, so a mistake here is contained rather than exploitable.
 *
 * This is the template for every future mutation in the product.
 */

/**
 * Recomputes and persists `profile_completion_percent`.
 *
 * Called at the end of every section save. The stored value is what
 * middleware reads on each dashboard request, so a write that skipped this
 * would leave a student locked out of a profile they had actually finished
 * — which is why it lives inside the same action as the write rather than in
 * a caller's hands.
 */
async function recomputeCompletion(studentId: string) {
  const student = await getOwnStudent();
  if (!student || student.id !== studentId) return;

  const snapshot = await getProfileSnapshot(student);
  const percent = computeCompletionPercent(snapshot);

  const supabase = createClient();
  await supabase
    .from("students")
    .update({ profile_completion_percent: percent })
    .eq("id", studentId);
}

function revalidateProfileViews() {
  revalidatePath("/complete-profile");
  revalidatePath("/dashboard");
}

// --- Personal, guardian & residence details ---------------------------------

export async function savePersonalSection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const student = await getOwnStudent();
  if (!student) {
    return { status: "error", message: "Your session has expired. Sign in again." };
  }

  const parsed = personalSectionSchema.safeParse({
    fullName: formData.get("fullName"),
    dob: formData.get("dob"),
    phone: formData.get("phone"),
    state: formData.get("state"),
    city: formData.get("city"),
    guardianName: formData.get("guardianName"),
    guardianPhone: formData.get("guardianPhone"),
    residenceType: formData.get("residenceType"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("students")
    .update({
      full_name: parsed.data.fullName,
      dob: parsed.data.dob,
      phone: parsed.data.phone,
      state: parsed.data.state,
      city: parsed.data.city,
      guardian_name: parsed.data.guardianName,
      guardian_phone: parsed.data.guardianPhone,
      residence_type: parsed.data.residenceType,
    })
    .eq("id", student.id);

  if (error) {
    const message = /duplicate key|unique/i.test(error.message)
      ? "That phone number is already registered to another account."
      : "Could not save. Please try again.";
    return { status: "error", message };
  }

  await recomputeCompletion(student.id);
  revalidateProfileViews();

  return { status: "success", message: "Personal and contact details saved." };
}

// --- Academic background ----------------------------------------------------

export async function saveAcademicSection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const student = await getOwnStudent();
  if (!student) {
    return { status: "error", message: "Your session has expired. Sign in again." };
  }

  const parsed = academicSectionSchema.safeParse({
    tenthPercentage: formData.get("tenthPercentage"),
    twelfthPercentage: formData.get("twelfthPercentage"),
    quota: formData.get("quota"),
    entranceRank: formData.get("entranceRank") ?? "",
    semester: formData.get("semester"),
    section: formData.get("section"),
    admissionYear: formData.get("admissionYear"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = createClient();
  const { error } = await supabase.from("student_academic_profiles").upsert(
    {
      student_id: student.id,
      tenth_percentage: parsed.data.tenthPercentage,
      twelfth_percentage: parsed.data.twelfthPercentage,
      quota: parsed.data.quota,
      entrance_rank: parsed.data.entranceRank,
      semester: parsed.data.semester,
      section: parsed.data.section.toUpperCase(),
      admission_year: parsed.data.admissionYear,
    },
    { onConflict: "student_id" },
  );

  if (error) {
    return { status: "error", message: "Could not save. Please try again." };
  }

  await recomputeCompletion(student.id);
  revalidateProfileViews();

  return { status: "success", message: "Academic background saved." };
}

// --- Many-to-many selection sections ---------------------------------------

type SelectionTable = {
  table: "student_interests" | "student_goals" | "student_domains";
  column: "interest_id" | "goal_id" | "domain_id";
  label: string;
};

const SELECTION_TABLES = {
  interests: {
    table: "student_interests",
    column: "interest_id",
    label: "Areas of interest",
  },
  goals: {
    table: "student_goals",
    column: "goal_id",
    label: "Career goals",
  },
  domains: {
    table: "student_domains",
    column: "domain_id",
    label: "Technical domains",
  },
} as const satisfies Record<string, SelectionTable>;

async function saveSelection(
  kind: keyof typeof SELECTION_TABLES,
  formData: FormData,
): Promise<ActionState> {
  const student = await getOwnStudent();
  if (!student) {
    return { status: "error", message: "Your session has expired. Sign in again." };
  }

  const parsed = selectionSectionSchema.safeParse({
    ids: formData.getAll("ids"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Select at least one option before saving.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const { table, column, label } = SELECTION_TABLES[kind];
  const supabase = createClient();

  // Replace rather than merge: the form submits the student's complete
  // intended selection, so a deselected option has to actually disappear.
  // Delete is scoped to this student's rows and RLS re-checks that scope.
  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq("student_id", student.id);

  if (deleteError) {
    return { status: "error", message: "Could not save. Please try again." };
  }

  const rows = parsed.data.ids.map((id) => ({
    student_id: student.id,
    [column]: id,
  }));

  const { error: insertError } = await supabase.from(table).insert(rows as never);

  if (insertError) {
    return { status: "error", message: "Could not save. Please try again." };
  }

  await recomputeCompletion(student.id);
  revalidateProfileViews();

  return { status: "success", message: `${label} saved.` };
}

export async function saveInterests(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return saveSelection("interests", formData);
}

export async function saveGoals(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return saveSelection("goals", formData);
}

export async function saveDomains(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return saveSelection("domains", formData);
}
