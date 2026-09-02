/**
 * Roadmap sources, review states, and the copy that has to travel with them
 * (PRD 5.10).
 */

export type RoadmapSource = "rule_based" | "ai";

export type RoadmapStatus =
  | "draft"
  | "pending_mentor_review"
  | "approved"
  | "rejected"
  | "superseded";

export const ROADMAP_STATUS_LABELS: Record<RoadmapStatus, string> = {
  draft: "Draft",
  pending_mentor_review: "Waiting for review",
  approved: "Approved",
  rejected: "Sent back",
  superseded: "Replaced",
};

export function roadmapStatusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return ROADMAP_STATUS_LABELS[value as RoadmapStatus] ?? value;
}

/**
 * How a roadmap describes its own origin, to the student and the mentor.
 *
 * PRD 5.10 requires versions to be tagged with model and provider, and the
 * reason is legibility rather than bookkeeping: somebody being asked to act
 * on advice should be able to tell where it came from. "Generated from your
 * profile" is a true and useful thing to say about the rule-based output; it
 * would be a misleading thing to say about a language model's.
 */
export function describeSource(
  source: string,
  provider: string | null,
  model: string | null,
): string {
  if (source === "rule_based") {
    return "Built from your profile using the portal's own rules — no AI was involved.";
  }
  const named = [provider, model].filter(Boolean).join(" · ");
  return named
    ? `Drafted by an AI model (${named}), then reviewed by a person before you saw it.`
    : "Drafted by an AI model, then reviewed by a person before you saw it.";
}

/**
 * Shown above every roadmap a student reads.
 *
 * The review promise is enforced in RLS — a student cannot select an
 * unapproved roadmap at all — but it is also worth stating, because the value
 * of the guarantee depends on the student knowing it exists.
 */
export const ROADMAP_REVIEW_NOTICE =
  "A mentor has read this plan and approved it before it reached you. It is " +
  "a suggestion, not an instruction — tell your mentor if something here " +
  "does not fit.";
