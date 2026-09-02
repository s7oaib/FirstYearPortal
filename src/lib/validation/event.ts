import { z } from "zod";
import { EVENT_KIND_VALUES } from "@/config/events";

/** Event schemas (PRD 5.8), shared client and server. */

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable(),
  );

const optionalTimestamp = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().min(1).nullable(),
);

const optionalInt = (min: number, max: number, message: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce
      .number({ invalid_type_error: message })
      .int(message)
      .min(min, message)
      .max(max, message)
      .nullable(),
  );

export const eventSchema = z
  .object({
    title: z.string().trim().min(3, "Give the event a title.").max(200),
    description: optionalText(4000),
    kind: z.enum(EVENT_KIND_VALUES, {
      errorMap: () => ({ message: "Choose an event type." }),
    }),
    venue: optionalText(200),
    departmentCode: optionalText(10),
    semester: optionalInt(1, 2, "First-year students are in semester 1 or 2."),
    section: optionalText(4),
    startsAt: z.string().min(1, "When does it start?"),
    endsAt: optionalTimestamp,
    registrationDeadline: optionalTimestamp,
    // Zero would mean "nobody may attend", which is a different and rarely
    // intended thing from "uncapped" — so it is refused rather than silently
    // read as one or the other.
    capacity: optionalInt(1, 100000, "Capacity must be at least 1."),
    allowWaitlist: z.boolean(),
  })
  .refine(
    (v) => !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt),
    { path: ["endsAt"], message: "The end time must be after the start." },
  )
  .refine(
    (v) =>
      !v.registrationDeadline ||
      new Date(v.registrationDeadline) <= new Date(v.startsAt),
    {
      path: ["registrationDeadline"],
      message: "Registration must close before the event starts.",
    },
  );

export type EventValues = z.infer<typeof eventSchema>;

export const feedbackSchema = z.object({
  registrationId: z.string().uuid("Unknown registration."),
  rating: z.coerce
    .number({ invalid_type_error: "Choose a rating." })
    .int()
    .min(1, "Choose a rating.")
    .max(5, "Choose a rating."),
  comment: optionalText(1000),
});

export type FeedbackValues = z.infer<typeof feedbackSchema>;
