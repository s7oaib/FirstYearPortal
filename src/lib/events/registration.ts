/**
 * When a student may register for an event, and what happens if they do
 * (PRD 5.8).
 *
 * Pure, for the same reason the grading module is: this decides what a
 * student is told about an event, and the same rule has to hold in three
 * places — the button on the list, the server action behind it, and the
 * capacity trigger in the database. Keeping it here means the first two agree
 * by construction, and the third is a backstop rather than a separate opinion.
 */

export type EventWindow = {
  isPublished: boolean;
  startsAt: string;
  registrationDeadline: string | null;
  capacity: number | null;
  allowWaitlist: boolean;
};

export type RegistrationOutcome =
  | { canRegister: true; willWaitlist: boolean }
  | {
      canRegister: false;
      reason:
        | "not_published"
        | "already_registered"
        | "deadline_passed"
        | "already_started"
        | "full";
    };

/**
 * `seatsTaken` counts confirmed registrations only — a waitlisted student is
 * not occupying a seat, which is the whole point of the waiting list.
 */
export function registrationOutcome(
  event: EventWindow,
  seatsTaken: number,
  currentStatus: string | null,
  now: Date = new Date(),
): RegistrationOutcome {
  if (!event.isPublished) return { canRegister: false, reason: "not_published" };

  if (currentStatus === "registered" || currentStatus === "waitlisted") {
    return { canRegister: false, reason: "already_registered" };
  }

  // The deadline is checked before the start time so a student who missed the
  // cut-off is told that, rather than being told the event has begun when it
  // has not.
  if (
    event.registrationDeadline &&
    new Date(event.registrationDeadline) < now
  ) {
    return { canRegister: false, reason: "deadline_passed" };
  }

  if (new Date(event.startsAt) <= now) {
    return { canRegister: false, reason: "already_started" };
  }

  if (event.capacity !== null && seatsTaken >= event.capacity) {
    return event.allowWaitlist
      ? { canRegister: true, willWaitlist: true }
      : { canRegister: false, reason: "full" };
  }

  return { canRegister: true, willWaitlist: false };
}

export const REGISTRATION_BLOCKED_COPY: Record<
  Exclude<RegistrationOutcome, { canRegister: true }>["reason"],
  string
> = {
  not_published: "Not open for registration yet.",
  already_registered: "You are already signed up.",
  deadline_passed: "Registration has closed.",
  already_started: "This event has already started.",
  full: "This event is full.",
};

/** Seats left, or null when the event is uncapped. */
export function seatsRemaining(
  capacity: number | null,
  seatsTaken: number,
): number | null {
  if (capacity === null) return null;
  return Math.max(0, capacity - seatsTaken);
}

export type AttendanceSummary = {
  registered: number;
  waitlisted: number;
  cancelled: number;
  attended: number;
  /** Of those who held a seat, the share who turned up. */
  attendanceRate: number | null;
};

export function summariseRoster(
  rows: Array<{ status: string; attended: boolean | null }>,
): AttendanceSummary {
  const registered = rows.filter((r) => r.status === "registered").length;
  const waitlisted = rows.filter((r) => r.status === "waitlisted").length;
  const cancelled = rows.filter((r) => r.status === "cancelled").length;
  const attended = rows.filter(
    (r) => r.status === "registered" && r.attended === true,
  ).length;

  // Measured against the people who actually held a seat. Counting cancelled
  // students in the denominator would make a well-run event with honest
  // cancellations look worse than one nobody could get out of.
  const attendanceRate =
    registered === 0 ? null : Math.round((attended / registered) * 100);

  return { registered, waitlisted, cancelled, attended, attendanceRate };
}
