"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getOwnStudent } from "@/lib/queries/student";
import { getEvent, getOwnRegistrations } from "@/lib/queries/events";
import { eventSchema, feedbackSchema } from "@/lib/validation/event";
import { fieldErrorsFrom, type ActionState } from "./form-state";

/**
 * Event mutations (PRD 5.8).
 *
 * Registration deliberately does *not* re-check capacity here. The trigger in
 * migration 0014 locks the event row and counts inside that lock, which is
 * the only place the count can be trusted — two students clicking at once
 * would both pass a check made here. What this action does is turn the
 * database's refusal into a sentence a student can act on.
 */

function readEventForm(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description"),
    kind: formData.get("kind"),
    venue: formData.get("venue"),
    departmentCode: formData.get("departmentCode"),
    semester: formData.get("semester"),
    section: formData.get("section"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    registrationDeadline: formData.get("registrationDeadline"),
    capacity: formData.get("capacity"),
    allowWaitlist: formData.get("allowWaitlist") === "on",
  };
}

/** `datetime-local` has no timezone; interpret it in the server's zone. */
function toIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function createEvent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const parsed = eventSchema.safeParse(readEventForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const values = parsed.data;
  const startsAt = toIso(values.startsAt);
  if (!startsAt) {
    return {
      status: "error",
      message: "Check the start time.",
      fieldErrors: { startsAt: "Enter a valid date and time." },
    };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      title: values.title,
      description: values.description,
      kind: values.kind,
      venue: values.venue,
      created_by: staff.id,
      department_code: values.departmentCode,
      semester: values.semester,
      section: values.section ? values.section.toUpperCase() : null,
      starts_at: startsAt,
      ends_at: toIso(values.endsAt),
      registration_deadline: toIso(values.registrationDeadline),
      capacity: values.capacity,
      allow_waitlist: values.allowWaitlist,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: "Could not create that event." };
  }

  revalidatePath("/faculty/events");
  redirect(`/faculty/events/${data.id}`);
}

export async function updateEvent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const id = String(formData.get("eventId") ?? "");
  if (!id) return { status: "error", message: "Unknown event." };

  const parsed = eventSchema.safeParse(readEventForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const values = parsed.data;
  const startsAt = toIso(values.startsAt);
  if (!startsAt) {
    return {
      status: "error",
      message: "Check the start time.",
      fieldErrors: { startsAt: "Enter a valid date and time." },
    };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("events")
    .update({
      title: values.title,
      description: values.description,
      kind: values.kind,
      venue: values.venue,
      department_code: values.departmentCode,
      semester: values.semester,
      section: values.section ? values.section.toUpperCase() : null,
      starts_at: startsAt,
      ends_at: toIso(values.endsAt),
      registration_deadline: toIso(values.registrationDeadline),
      capacity: values.capacity,
      allow_waitlist: values.allowWaitlist,
    })
    .eq("id", id);

  if (error) {
    return { status: "error", message: "Could not save those changes." };
  }

  revalidatePath(`/faculty/events/${id}`);
  return { status: "success", message: "Saved." };
}

const publishSchema = z.object({
  eventId: z.string().uuid("Unknown event."),
  publish: z.boolean(),
});

export async function setEventPublished(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const parsed = publishSchema.safeParse({
    eventId: formData.get("eventId"),
    publish: formData.get("publish") === "true",
  });
  if (!parsed.success) {
    return { status: "error", message: "Could not change that event." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("events")
    .update({ is_published: parsed.data.publish })
    .eq("id", parsed.data.eventId);

  if (error) {
    return { status: "error", message: "Could not change that event." };
  }

  revalidatePath(`/faculty/events/${parsed.data.eventId}`);
  return {
    status: "success",
    message: parsed.data.publish
      ? "Published — students in the audience can now register."
      : "Unpublished — students can no longer see it.",
  };
}

// --- Student registration ----------------------------------------------------

export async function registerForEvent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const student = await getOwnStudent();
  if (!student) {
    return { status: "error", message: "Student access required." };
  }

  const eventId = String(formData.get("eventId") ?? "");
  const event = await getEvent(eventId);
  if (!event) {
    return { status: "error", message: "That event is not available." };
  }

  const supabase = createClient();
  const existing = (await getOwnRegistrations()).find(
    (r) => r.eventId === eventId,
  );

  // Re-registering after cancelling reuses the row, because the unique
  // constraint keeps one row per student per event and the history is worth
  // keeping.
  const { error } = existing
    ? await supabase
        .from("event_registrations")
        .update({ status: "registered", cancelled_at: null })
        .eq("id", existing.id)
    : await supabase.from("event_registrations").insert({
        event_id: eventId,
        student_id: student.id,
      });

  if (error) {
    // The capacity and window rules are enforced by the trigger, which raises
    // a readable message. Surfacing it beats a generic failure, since "that
    // event is full" is something the student can act on.
    const message = /full|closed|started|not open/i.test(error.message)
      ? error.message.replace(/^.*?:\s*/, "")
      : "Could not register you for that event.";
    return { status: "error", message };
  }

  revalidatePath("/events");

  // The trigger may have placed them on the waiting list instead, so the
  // outcome is read back rather than assumed.
  const updated = (await getOwnRegistrations()).find(
    (r) => r.eventId === eventId,
  );

  return {
    status: "success",
    message:
      updated?.status === "waitlisted"
        ? "That event was full, so you are on the waiting list. You'll get a place if someone cancels."
        : "You're registered.",
  };
}

export async function cancelRegistration(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const student = await getOwnStudent();
  if (!student) {
    return { status: "error", message: "Student access required." };
  }

  const registrationId = String(formData.get("registrationId") ?? "");
  if (!registrationId) {
    return { status: "error", message: "Unknown registration." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("event_registrations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", registrationId)
    .eq("student_id", student.id);

  if (error) {
    return { status: "error", message: "Could not cancel that registration." };
  }

  revalidatePath("/events");
  return { status: "success", message: "Cancelled. Your place has been freed." };
}

export async function submitFeedback(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const student = await getOwnStudent();
  if (!student) {
    return { status: "error", message: "Student access required." };
  }

  const parsed = feedbackSchema.safeParse({
    registrationId: formData.get("registrationId"),
    rating: formData.get("rating"),
    comment: formData.get("comment"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check your feedback.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("event_registrations")
    .update({
      feedback_rating: parsed.data.rating,
      feedback_comment: parsed.data.comment,
    })
    .eq("id", parsed.data.registrationId)
    .eq("student_id", student.id);

  if (error) {
    return { status: "error", message: "Could not save your feedback." };
  }

  revalidatePath("/events");
  return { status: "success", message: "Thank you — feedback saved." };
}

// --- Attendance ---------------------------------------------------------------

export async function markAttendance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const eventId = String(formData.get("eventId") ?? "");
  const present = new Set(formData.getAll("present").map(String));
  const allIds = formData.getAll("registrationId").map(String);

  if (allIds.length === 0) {
    return { status: "error", message: "Nobody to mark." };
  }

  const supabase = createClient();
  const markedAt = new Date().toISOString();

  // Written in two statements rather than one per student: a register is
  // taken for a whole room at once, and a partial failure halfway down a list
  // is worse than either outcome.
  const attended = allIds.filter((id) => present.has(id));
  const absent = allIds.filter((id) => !present.has(id));

  if (attended.length > 0) {
    await supabase
      .from("event_registrations")
      .update({ attended: true, marked_by: staff.id, marked_at: markedAt })
      .in("id", attended);
  }
  if (absent.length > 0) {
    await supabase
      .from("event_registrations")
      .update({ attended: false, marked_by: staff.id, marked_at: markedAt })
      .in("id", absent);
  }

  revalidatePath(`/faculty/events/${eventId}`);
  return {
    status: "success",
    message: `Register taken — ${attended.length} present, ${absent.length} absent.`,
  };
}
