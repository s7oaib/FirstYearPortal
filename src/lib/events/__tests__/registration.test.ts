import { describe, expect, it } from "vitest";
import {
  registrationOutcome,
  seatsRemaining,
  summariseRoster,
  type EventWindow,
} from "../registration";

const now = new Date("2026-08-18T10:00:00Z");

const open: EventWindow = {
  isPublished: true,
  startsAt: "2026-09-01T09:00:00Z",
  registrationDeadline: "2026-08-30T23:59:00Z",
  capacity: 10,
  allowWaitlist: true,
};

describe("registrationOutcome", () => {
  it("lets an eligible student take a free seat", () => {
    expect(registrationOutcome(open, 3, null, now)).toEqual({
      canRegister: true,
      willWaitlist: false,
    });
  });

  it("refuses an unpublished event", () => {
    expect(
      registrationOutcome({ ...open, isPublished: false }, 0, null, now),
    ).toEqual({ canRegister: false, reason: "not_published" });
  });

  it("refuses a student who already holds a place", () => {
    expect(registrationOutcome(open, 3, "registered", now)).toEqual({
      canRegister: false,
      reason: "already_registered",
    });
    expect(registrationOutcome(open, 3, "waitlisted", now)).toEqual({
      canRegister: false,
      reason: "already_registered",
    });
  });

  it("lets a student who cancelled sign up again", () => {
    // Cancelling is soft, so the row still exists — it must not be mistaken
    // for an active registration.
    expect(registrationOutcome(open, 3, "cancelled", now)).toEqual({
      canRegister: true,
      willWaitlist: false,
    });
  });

  it("refuses once the deadline has passed", () => {
    expect(
      registrationOutcome(
        { ...open, registrationDeadline: "2026-08-17T00:00:00Z" },
        0,
        null,
        now,
      ),
    ).toEqual({ canRegister: false, reason: "deadline_passed" });
  });

  it("refuses an event that has started", () => {
    expect(
      registrationOutcome(
        { ...open, startsAt: "2026-08-18T09:00:00Z", registrationDeadline: null },
        0,
        null,
        now,
      ),
    ).toEqual({ canRegister: false, reason: "already_started" });
  });

  it("reports a missed deadline rather than a started event", () => {
    // Both apply here. Telling a student the event has begun when it has not
    // is simply wrong, so the deadline wins.
    expect(
      registrationOutcome(
        {
          ...open,
          registrationDeadline: "2026-08-01T00:00:00Z",
          startsAt: "2026-08-02T00:00:00Z",
        },
        0,
        null,
        now,
      ),
    ).toEqual({ canRegister: false, reason: "deadline_passed" });
  });

  it("waitlists once the seats are gone", () => {
    expect(registrationOutcome(open, 10, null, now)).toEqual({
      canRegister: true,
      willWaitlist: true,
    });
    expect(registrationOutcome(open, 11, null, now)).toEqual({
      canRegister: true,
      willWaitlist: true,
    });
  });

  it("refuses a full event when no waiting list is offered", () => {
    expect(
      registrationOutcome({ ...open, allowWaitlist: false }, 10, null, now),
    ).toEqual({ canRegister: false, reason: "full" });
  });

  it("never waitlists an uncapped event", () => {
    expect(
      registrationOutcome({ ...open, capacity: null }, 5000, null, now),
    ).toEqual({ canRegister: true, willWaitlist: false });
  });

  it("treats a null deadline as no deadline", () => {
    expect(
      registrationOutcome({ ...open, registrationDeadline: null }, 0, null, now),
    ).toEqual({ canRegister: true, willWaitlist: false });
  });
});

describe("seatsRemaining", () => {
  it("counts down from capacity", () => {
    expect(seatsRemaining(10, 3)).toBe(7);
    expect(seatsRemaining(10, 10)).toBe(0);
  });

  it("never goes negative when staff have over-filled an event", () => {
    // Staff may admit past capacity deliberately; "-2 seats left" is not a
    // thing to show anyone.
    expect(seatsRemaining(10, 12)).toBe(0);
  });

  it("returns null for an uncapped event", () => {
    expect(seatsRemaining(null, 40)).toBeNull();
  });
});

describe("summariseRoster", () => {
  it("counts each state separately", () => {
    const summary = summariseRoster([
      { status: "registered", attended: true },
      { status: "registered", attended: true },
      { status: "registered", attended: false },
      { status: "waitlisted", attended: null },
      { status: "cancelled", attended: null },
    ]);

    expect(summary.registered).toBe(3);
    expect(summary.waitlisted).toBe(1);
    expect(summary.cancelled).toBe(1);
    expect(summary.attended).toBe(2);
    expect(summary.attendanceRate).toBe(67);
  });

  it("measures attendance against seat-holders, not everyone", () => {
    // Counting cancellations in the denominator would make an event with
    // honest cancellations look worse than one nobody could leave.
    const summary = summariseRoster([
      { status: "registered", attended: true },
      { status: "cancelled", attended: null },
      { status: "cancelled", attended: null },
    ]);
    expect(summary.attendanceRate).toBe(100);
  });

  it("does not count a waitlisted attendee as a seat-holder", () => {
    const summary = summariseRoster([
      { status: "waitlisted", attended: true },
      { status: "registered", attended: true },
    ]);
    expect(summary.registered).toBe(1);
    expect(summary.attended).toBe(1);
    expect(summary.attendanceRate).toBe(100);
  });

  it("returns a null rate rather than dividing by zero", () => {
    const summary = summariseRoster([{ status: "cancelled", attended: null }]);
    expect(summary.attendanceRate).toBeNull();
  });

  it("treats unmarked attendance as not attended", () => {
    // Before anyone takes the register, nobody is recorded as having turned
    // up — which is the honest reading of "not yet marked".
    const summary = summariseRoster([
      { status: "registered", attended: null },
      { status: "registered", attended: null },
    ]);
    expect(summary.attended).toBe(0);
    expect(summary.attendanceRate).toBe(0);
  });
});
