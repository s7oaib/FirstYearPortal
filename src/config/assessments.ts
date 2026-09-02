/**
 * Assessment kinds, question types, and the copy that has to travel with
 * them (PRD 5.7).
 *
 * Defined once and imported by the builder, the sitting screen, the results
 * view, and the CSV export — the same reasoning as `config/residence.ts`.
 * Enums in the database, labels here.
 */

export const ASSESSMENT_KINDS = [
  {
    value: "general",
    label: "General",
    hint: "Subject or skills test, marked against correct answers.",
  },
  {
    value: "english",
    label: "English",
    hint: "Section-wise language assessment.",
  },
  {
    value: "psychometric",
    label: "Psychometric",
    hint: "Self-development only. Results reach the student and their mentor.",
  },
] as const;

export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number]["value"];

export const ASSESSMENT_KIND_VALUES = ASSESSMENT_KINDS.map((k) => k.value) as [
  AssessmentKind,
  ...AssessmentKind[],
];

export const QUESTION_KINDS = [
  { value: "single_choice", label: "Single choice", objective: true },
  { value: "multiple_choice", label: "Multiple choice", objective: true },
  { value: "true_false", label: "True / false", objective: true },
  { value: "likert", label: "Likert scale", objective: false },
  { value: "short_answer", label: "Short answer", objective: false },
  { value: "long_answer", label: "Long answer", objective: false },
] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number]["value"];

export const QUESTION_KIND_VALUES = QUESTION_KINDS.map((q) => q.value) as [
  QuestionKind,
  ...QuestionKind[],
];

/** Question types the machine can mark without a human reading them. */
const OBJECTIVE_KINDS = new Set<string>(
  QUESTION_KINDS.filter((q) => q.objective).map((q) => q.value),
);

export function isObjective(kind: string): boolean {
  return OBJECTIVE_KINDS.has(kind);
}

/** Question types that carry options rather than free text. */
export function hasOptions(kind: string): boolean {
  return kind !== "short_answer" && kind !== "long_answer";
}

export type AttemptStatus =
  | "in_progress"
  | "submitted"
  | "graded"
  | "abandoned";

export const ATTEMPT_STATUS_LABELS: Record<AttemptStatus, string> = {
  in_progress: "In progress",
  submitted: "Awaiting marking",
  graded: "Marked",
  abandoned: "Abandoned",
};

const KIND_LABELS: Record<string, string> = Object.fromEntries(
  ASSESSMENT_KINDS.map((k) => [k.value, k.label]),
);
const QUESTION_LABELS: Record<string, string> = Object.fromEntries(
  QUESTION_KINDS.map((q) => [q.value, q.label]),
);

export function assessmentKindLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return KIND_LABELS[value] ?? value;
}

export function questionKindLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return QUESTION_LABELS[value] ?? value;
}

export function attemptStatusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return ATTEMPT_STATUS_LABELS[value as AttemptStatus] ?? value;
}

/**
 * The disclosure that must accompany every psychometric assessment.
 *
 * This is a product requirement, not optional copy (PRD 5.7 and the non-goals
 * in section 2). It is defined here so the sitting screen, the results view,
 * and any export all state the same thing, and so removing it from one place
 * is a visible deletion rather than an omission nobody notices.
 */
export const PSYCHOMETRIC_DISCLOSURE =
  "This questionnaire is for self-development and mentoring only. It is " +
  "indicative, not a clinical or medical assessment, and it is never used " +
  "as a basis for denying you any opportunity. Your results are visible to " +
  "you and your assigned mentor.";

/** Shown before a psychometric attempt can be started. */
export const PSYCHOMETRIC_CONSENT =
  "I understand these results are indicative, are for my own development, " +
  "and will be shared only with my assigned mentor.";
