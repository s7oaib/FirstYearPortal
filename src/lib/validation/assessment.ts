import { z } from "zod";
import {
  ASSESSMENT_KIND_VALUES,
  QUESTION_KIND_VALUES,
  hasOptions,
} from "@/config/assessments";

/**
 * Assessment schemas (PRD 5.7), shared client and server as everything else
 * in this folder is. The server run is the one that counts.
 */

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable(),
  );

/** An empty datetime-local field must become null, not an invalid date. */
const optionalTimestamp = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time."))
    .nullable(),
);

const optionalNumber = (min: number, max: number, message: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number({ invalid_type_error: message }).min(min, message).max(max, message).nullable(),
  );

export const assessmentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Give the assessment a title.")
      .max(200, "That title is too long."),
    description: optionalText(2000),
    kind: z.enum(ASSESSMENT_KIND_VALUES, {
      errorMap: () => ({ message: "Choose an assessment type." }),
    }),
    departmentCode: optionalText(10),
    semester: optionalNumber(1, 2, "First-year students are in semester 1 or 2."),
    section: optionalText(4),
    opensAt: optionalTimestamp,
    closesAt: optionalTimestamp,
    durationMinutes: optionalNumber(1, 600, "Between 1 and 600 minutes."),
    maxAttempts: z.coerce
      .number()
      .int()
      .min(1, "At least one attempt.")
      .max(10, "At most ten attempts."),
    passPercentage: optionalNumber(0, 100, "A pass mark is a percentage."),
    randomiseQuestions: z.boolean(),
  })
  .refine(
    (v) =>
      !v.opensAt || !v.closesAt || new Date(v.closesAt) > new Date(v.opensAt),
    { path: ["closesAt"], message: "Closing time must be after opening time." },
  );

export type AssessmentValues = z.infer<typeof assessmentSchema>;

/**
 * One question and its options.
 *
 * The refinements below are what stop an assessment being published in a
 * state that cannot be marked: a choice question with no options, or an
 * auto-markable question where the author never said which option is right.
 * Catching it here means the author is told at authoring time, rather than a
 * class discovering it mid-paper.
 */
export const questionOptionSchema = z.object({
  label: z.string().trim().min(1, "Every option needs a label.").max(500),
  isCorrect: z.boolean().nullable(),
  scoreValue: z.coerce.number().default(0),
});

export const questionSchema = z
  .object({
    kind: z.enum(QUESTION_KIND_VALUES, {
      errorMap: () => ({ message: "Choose a question type." }),
    }),
    prompt: z
      .string()
      .trim()
      .min(3, "Write the question.")
      .max(2000, "That question is too long."),
    helpText: optionalText(500),
    points: z.coerce.number().min(0, "Points cannot be negative.").max(1000),
    required: z.boolean(),
    options: z.array(questionOptionSchema),
  })
  .superRefine((value, ctx) => {
    if (!hasOptions(value.kind)) return;

    if (value.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Give this question at least two options.",
      });
      return;
    }

    // Likert items score on a scale rather than against a right answer, so
    // "which one is correct" is not a question worth asking of them.
    if (value.kind === "likert") return;

    if (!value.options.some((option) => option.isCorrect === true)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message:
          "Mark at least one option correct, or this question cannot be graded.",
      });
    }

    if (
      value.kind !== "multiple_choice" &&
      value.options.filter((option) => option.isCorrect === true).length > 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message:
          "Only a multiple-choice question may have more than one correct option.",
      });
    }
  });

export type QuestionValues = z.infer<typeof questionSchema>;

/** One student's answer to one question, as posted from the sitting screen. */
export const answerSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptionIds: z.array(z.string().uuid()).default([]),
  textAnswer: optionalText(5000),
});

export const gradeAnswerSchema = z.object({
  answerId: z.string().uuid("Unknown answer."),
  awardedPoints: z.coerce
    .number({ invalid_type_error: "Enter a mark." })
    .min(0, "A mark cannot be negative."),
  remarks: optionalText(1000),
});

export type GradeAnswerValues = z.infer<typeof gradeAnswerSchema>;
