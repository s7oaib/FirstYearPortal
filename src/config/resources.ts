/**
 * Resource kinds and the copy that has to travel with an unverified entry
 * (PRD 5.9).
 */

export const RESOURCE_KINDS = [
  { value: "syllabus", label: "Syllabus" },
  { value: "scheme", label: "Scheme" },
  { value: "question_paper", label: "Question paper" },
  { value: "course", label: "Course" },
  { value: "certification", label: "Certification" },
  { value: "book", label: "Book" },
  { value: "video", label: "Video" },
  { value: "tool", label: "Tool" },
  { value: "other", label: "Other" },
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number]["value"];

export const RESOURCE_KIND_VALUES = RESOURCE_KINDS.map((k) => k.value) as [
  ResourceKind,
  ...ResourceKind[],
];

const KIND_LABELS: Record<string, string> = Object.fromEntries(
  RESOURCE_KINDS.map((k) => [k.value, k.label]),
);

export function resourceKindLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return KIND_LABELS[value] ?? value;
}

/**
 * Shown on every resource an administrator has not checked.
 *
 * PRD 5.9 requires unverified entries to be visibly marked, and the reason is
 * worth stating plainly: this portal links out to the wider internet, and a
 * link nobody has opened is a claim nobody has stood behind. Defined here so
 * the catalogue, the recommendations, and any export all say the same thing.
 */
export const UNVERIFIED_NOTICE =
  "Not yet checked by an administrator — the link and its details have not " +
  "been confirmed.";

export const VERIFIED_NOTICE =
  "An administrator has opened this link and confirmed its details.";
