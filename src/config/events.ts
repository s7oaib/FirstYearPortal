/**
 * Event kinds, registration states, and their labels (PRD 5.8).
 *
 * Defined once and imported by the builder, the student list, the roster, and
 * the attendance screen — the same reasoning as `config/residence.ts`.
 */

export const EVENT_KINDS = [
  { value: "workshop", label: "Workshop" },
  { value: "seminar", label: "Seminar" },
  { value: "training", label: "Training" },
  { value: "competition", label: "Competition" },
  { value: "placement_drive", label: "Placement drive" },
  { value: "cultural", label: "Cultural" },
  { value: "sports", label: "Sports" },
  { value: "other", label: "Other" },
] as const;

export type EventKind = (typeof EVENT_KINDS)[number]["value"];

export const EVENT_KIND_VALUES = EVENT_KINDS.map((k) => k.value) as [
  EventKind,
  ...EventKind[],
];

export type RegistrationStatus = "registered" | "waitlisted" | "cancelled";

export const REGISTRATION_LABELS: Record<RegistrationStatus, string> = {
  registered: "Registered",
  waitlisted: "On the waiting list",
  cancelled: "Cancelled",
};

const KIND_LABELS: Record<string, string> = Object.fromEntries(
  EVENT_KINDS.map((k) => [k.value, k.label]),
);

export function eventKindLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return KIND_LABELS[value] ?? value;
}

export function registrationLabel(value: string | null | undefined): string {
  if (!value) return "Not registered";
  return REGISTRATION_LABELS[value as RegistrationStatus] ?? value;
}
