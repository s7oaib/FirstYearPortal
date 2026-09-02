import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  registrationOutcome,
  summariseRoster,
  type AttendanceSummary,
  type RegistrationOutcome,
} from "@/lib/events/registration";
import type { EventKind, RegistrationStatus } from "@/config/events";

/**
 * Event reads (PRD 5.8).
 *
 * Scoping comes from RLS as everywhere else: a student sees published events
 * aimed at them, an author sees their own, a head of department sees their
 * department's, an administrator sees all.
 */

export type EventSummary = {
  id: string;
  title: string;
  description: string | null;
  kind: EventKind;
  venue: string | null;
  departmentCode: string | null;
  semester: number | null;
  section: string | null;
  startsAt: string;
  endsAt: string | null;
  registrationDeadline: string | null;
  capacity: number | null;
  allowWaitlist: boolean;
  isPublished: boolean;
};

const EVENT_COLUMNS =
  "id, title, description, kind, venue, department_code, semester, section, starts_at, ends_at, registration_deadline, capacity, allow_waitlist, is_published" as const;

type EventDbRow = {
  id: string;
  title: string;
  description: string | null;
  kind: EventKind;
  venue: string | null;
  department_code: string | null;
  semester: number | null;
  section: string | null;
  starts_at: string;
  ends_at: string | null;
  registration_deadline: string | null;
  capacity: number | null;
  allow_waitlist: boolean;
  is_published: boolean;
};

function mapEvent(row: EventDbRow): EventSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    venue: row.venue,
    departmentCode: row.department_code,
    semester: row.semester,
    section: row.section,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    registrationDeadline: row.registration_deadline,
    capacity: row.capacity,
    allowWaitlist: row.allow_waitlist,
    isPublished: row.is_published,
  };
}

/** Every event the caller may see, soonest first. */
export async function listEvents(): Promise<EventSummary[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .order("starts_at", { ascending: true })
    .limit(200);

  return (data ?? []).map(mapEvent);
}

export async function getEvent(id: string): Promise<EventSummary | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  return data ? mapEvent(data) : null;
}

export type Registration = {
  id: string;
  eventId: string;
  studentId: string;
  status: RegistrationStatus;
  registeredAt: string;
  attended: boolean | null;
  feedbackRating: number | null;
  feedbackComment: string | null;
};

const REGISTRATION_COLUMNS =
  "id, event_id, student_id, status, registered_at, attended, feedback_rating, feedback_comment" as const;

type RegistrationDbRow = {
  id: string;
  event_id: string;
  student_id: string;
  status: RegistrationStatus;
  registered_at: string;
  attended: boolean | null;
  feedback_rating: number | null;
  feedback_comment: string | null;
};

function mapRegistration(row: RegistrationDbRow): Registration {
  return {
    id: row.id,
    eventId: row.event_id,
    studentId: row.student_id,
    status: row.status,
    registeredAt: row.registered_at,
    attended: row.attended,
    feedbackRating: row.feedback_rating,
    feedbackComment: row.feedback_comment,
  };
}

/** The signed-in student's own registrations. RLS restricts this to them. */
export async function getOwnRegistrations(): Promise<Registration[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("event_registrations")
    .select(REGISTRATION_COLUMNS)
    .order("registered_at", { ascending: false });

  return (data ?? []).map(mapRegistration);
}

/**
 * Confirmed seats taken per event.
 *
 * Counted here so the student list can say how many places are left. This is
 * for display only — the authoritative capacity check is the trigger in
 * migration 0014, which locks the event row first. A count read here and
 * acted on later is exactly the race that trigger exists to close.
 */
async function seatCounts(eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();

  const supabase = createClient();
  const { data } = await supabase
    .from("event_registrations")
    .select("event_id, status")
    .in("event_id", eventIds)
    .eq("status", "registered");

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
  }
  return counts;
}

export type StudentEvent = {
  event: EventSummary;
  registration: Registration | null;
  seatsTaken: number;
  outcome: RegistrationOutcome;
};

/**
 * What a student sees on their events page.
 *
 * Events that cannot be joined still appear, with the reason — an event that
 * silently vanishes reads as a bug to the person who was told about it.
 */
export async function getStudentEvents(): Promise<StudentEvent[]> {
  const [events, registrations] = await Promise.all([
    listEvents(),
    getOwnRegistrations(),
  ]);

  const counts = await seatCounts(events.map((e) => e.id));
  const byEvent = new Map(registrations.map((r) => [r.eventId, r]));

  return events.map((event) => {
    const registration = byEvent.get(event.id) ?? null;
    const seatsTaken = counts.get(event.id) ?? 0;

    return {
      event,
      registration,
      seatsTaken,
      outcome: registrationOutcome(
        event,
        seatsTaken,
        registration?.status ?? null,
      ),
    };
  });
}

export type RosterEntry = Registration & {
  studentName: string;
  studentUsn: string;
};

export async function getRoster(eventId: string): Promise<RosterEntry[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("event_registrations")
    .select(REGISTRATION_COLUMNS)
    .eq("event_id", eventId)
    .order("registered_at", { ascending: true })
    .limit(1000);

  const rows = (data ?? []).map(mapRegistration);
  if (rows.length === 0) return [];

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, usn")
    .in("id", Array.from(new Set(rows.map((r) => r.studentId))));

  const byId = new Map((students ?? []).map((s) => [s.id, s]));

  return rows.map((row) => ({
    ...row,
    studentName: byId.get(row.studentId)?.full_name ?? "Unknown student",
    studentUsn: byId.get(row.studentId)?.usn ?? "—",
  }));
}

export function rosterSummary(roster: RosterEntry[]): AttendanceSummary {
  return summariseRoster(roster);
}

/** Count for the staff sidebar badge: published events still to come. */
export async function getUpcomingEventCount(): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("is_published", true)
    .gt("starts_at", new Date().toISOString());
  return count ?? 0;
}
