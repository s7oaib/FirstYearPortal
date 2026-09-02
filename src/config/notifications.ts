/**
 * Notification kinds and their labels (PRD 5.11).
 */

export type NotificationKind =
  | "account_approved"
  | "profile_incomplete"
  | "achievement_verified"
  | "achievement_rejected"
  | "assessment_graded"
  | "event_seat_confirmed"
  | "roadmap_approved"
  | "roadmap_returned";

/**
 * How each kind reads at a glance. Tone matters here: a student sees these
 * without context, so "Not verified" has to be neutral rather than a verdict.
 */
export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  account_approved: "Account",
  profile_incomplete: "Profile",
  achievement_verified: "Achievement",
  achievement_rejected: "Achievement",
  assessment_graded: "Assessment",
  event_seat_confirmed: "Event",
  roadmap_approved: "Roadmap",
  roadmap_returned: "Roadmap",
};

export function notificationLabel(value: string | null | undefined): string {
  if (!value) return "Update";
  return NOTIFICATION_LABELS[value as NotificationKind] ?? "Update";
}
