"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getOwnStudent } from "@/lib/queries/student";
import {
  getAnswers,
  getAssessment,
  getAttempt,
  getAuthoredQuestions,
  getOwnAttempts,
} from "@/lib/queries/assessments";
import {
  assessmentSchema,
  gradeAnswerSchema,
  questionSchema,
} from "@/lib/validation/assessment";
import { availability, finaliseAttempt, gradeAttempt } from "@/lib/assessments/grading";
import { hasOptions } from "@/config/assessments";
import { fieldErrorsFrom, type ActionState } from "./form-state";

/**
 * Assessment mutations (PRD 5.7).
 *
 * Every action re-derives its caller from the session — a student's own
 * `students` row, or a staff member's `faculty` row — and never trusts an id
 * posted by the client. RLS and the grading triggers from migration 0013 back
 * each of these up; the checks here exist to produce a sentence rather than a
 * silent zero-row write.
 */

// --- Authoring ---------------------------------------------------------------

function readAssessmentForm(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description"),
    kind: formData.get("kind"),
    departmentCode: formData.get("departmentCode"),
    semester: formData.get("semester"),
    section: formData.get("section"),
    opensAt: formData.get("opensAt"),
    closesAt: formData.get("closesAt"),
    durationMinutes: formData.get("durationMinutes"),
    maxAttempts: formData.get("maxAttempts") ?? 1,
    passPercentage: formData.get("passPercentage"),
    randomiseQuestions: formData.get("randomiseQuestions") === "on",
  };
}

/** Timestamps arrive from `datetime-local`, which has no timezone. */
function toIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function createAssessment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const parsed = assessmentSchema.safeParse(readAssessmentForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const values = parsed.data;
  const supabase = createClient();

  const { data, error } = await supabase
    .from("assessments")
    .insert({
      title: values.title,
      description: values.description,
      kind: values.kind,
      // Taken from the session, never from the form: the author is whoever is
      // signed in, and RLS's write policy keys off exactly this.
      created_by: staff.id,
      department_code: values.departmentCode,
      semester: values.semester,
      section: values.section ? values.section.toUpperCase() : null,
      opens_at: toIso(values.opensAt),
      closes_at: toIso(values.closesAt),
      duration_minutes: values.durationMinutes,
      max_attempts: values.maxAttempts,
      pass_percentage: values.passPercentage,
      randomise_questions: values.randomiseQuestions,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: "Could not create that assessment." };
  }

  revalidatePath("/faculty/assessments");
  redirect(`/faculty/assessments/${data.id}`);
}

export async function updateAssessment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const id = String(formData.get("assessmentId") ?? "");
  if (!id) return { status: "error", message: "Unknown assessment." };

  const parsed = assessmentSchema.safeParse(readAssessmentForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const values = parsed.data;
  const supabase = createClient();

  const { error } = await supabase
    .from("assessments")
    .update({
      title: values.title,
      description: values.description,
      kind: values.kind,
      department_code: values.departmentCode,
      semester: values.semester,
      section: values.section ? values.section.toUpperCase() : null,
      opens_at: toIso(values.opensAt),
      closes_at: toIso(values.closesAt),
      duration_minutes: values.durationMinutes,
      max_attempts: values.maxAttempts,
      pass_percentage: values.passPercentage,
      randomise_questions: values.randomiseQuestions,
    })
    .eq("id", id);

  if (error) {
    return { status: "error", message: "Could not save those changes." };
  }

  revalidatePath(`/faculty/assessments/${id}`);
  return { status: "success", message: "Saved." };
}

export async function addQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const assessmentId = String(formData.get("assessmentId") ?? "");
  if (!assessmentId) return { status: "error", message: "Unknown assessment." };

  const labels = formData.getAll("optionLabel").map(String);
  const correctRaw = formData.getAll("optionCorrect").map(String);
  const scores = formData.getAll("optionScore").map(String);
  const kind = String(formData.get("kind") ?? "");

  const options = labels
    .map((label, index) => ({
      label,
      // Checkboxes only post when ticked, so the correct set arrives as a
      // list of indices rather than one value per option.
      isCorrect: hasOptions(kind) && kind !== "likert"
        ? correctRaw.includes(String(index))
        : null,
      scoreValue: Number(scores[index] ?? 0) || 0,
    }))
    .filter((option) => option.label.trim().length > 0);

  const parsed = questionSchema.safeParse({
    kind,
    prompt: formData.get("prompt"),
    helpText: formData.get("helpText"),
    points: formData.get("points") ?? 1,
    required: formData.get("required") !== "off",
    options,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = createClient();

  const { data: existing } = await supabase
    .from("questions")
    .select("position")
    .eq("assessment_id", assessmentId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = (existing?.[0]?.position ?? -1) + 1;

  const { data: question, error } = await supabase
    .from("questions")
    .insert({
      assessment_id: assessmentId,
      kind: parsed.data.kind,
      prompt: parsed.data.prompt,
      help_text: parsed.data.helpText,
      points: parsed.data.points,
      required: parsed.data.required,
      position: nextPosition,
    })
    .select("id")
    .single();

  if (error || !question) {
    return { status: "error", message: "Could not add that question." };
  }

  if (parsed.data.options.length > 0) {
    const { error: optionError } = await supabase.from("question_options").insert(
      parsed.data.options.map((option, index) => ({
        question_id: question.id,
        label: option.label,
        position: index,
        is_correct: option.isCorrect,
        score_value: option.scoreValue,
      })),
    );

    if (optionError) {
      // The question exists but has no options, which is unmarkable. Remove
      // it rather than leave a half-built item in a live paper.
      await supabase.from("questions").delete().eq("id", question.id);
      return { status: "error", message: "Could not save the options." };
    }
  }

  revalidatePath(`/faculty/assessments/${assessmentId}`);
  return { status: "success", message: "Question added." };
}

export async function deleteQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const questionId = String(formData.get("questionId") ?? "");
  const assessmentId = String(formData.get("assessmentId") ?? "");
  if (!questionId) return { status: "error", message: "Unknown question." };

  const supabase = createClient();
  const { error } = await supabase.from("questions").delete().eq("id", questionId);

  if (error) {
    return { status: "error", message: "Could not remove that question." };
  }

  revalidatePath(`/faculty/assessments/${assessmentId}`);
  return { status: "success", message: "Question removed." };
}

const publishSchema = z.object({
  assessmentId: z.string().uuid("Unknown assessment."),
  publish: z.boolean(),
});

export async function setPublished(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const parsed = publishSchema.safeParse({
    assessmentId: formData.get("assessmentId"),
    publish: formData.get("publish") === "true",
  });

  if (!parsed.success) {
    return { status: "error", message: "Could not change that assessment." };
  }

  // Publishing an empty paper sends students to a blank screen, so it is
  // refused here rather than discovered by a class.
  if (parsed.data.publish) {
    const questions = await getAuthoredQuestions(parsed.data.assessmentId);
    if (questions.length === 0) {
      return {
        status: "error",
        message: "Add at least one question before publishing.",
      };
    }
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("assessments")
    .update({ is_published: parsed.data.publish })
    .eq("id", parsed.data.assessmentId);

  if (error) {
    return { status: "error", message: "Could not change that assessment." };
  }

  revalidatePath(`/faculty/assessments/${parsed.data.assessmentId}`);
  return {
    status: "success",
    message: parsed.data.publish
      ? "Published — students in the audience can now sit it."
      : "Unpublished — students can no longer see it.",
  };
}

// --- Sitting -----------------------------------------------------------------

export async function startAttempt(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const student = await getOwnStudent();
  if (!student) {
    return { status: "error", message: "Student access required." };
  }

  const assessmentId = String(formData.get("assessmentId") ?? "");
  const assessment = await getAssessment(assessmentId);
  if (!assessment) {
    return { status: "error", message: "That assessment is not available." };
  }

  // The window and attempt count are re-checked server-side. The button that
  // led here was rendered from the same rule, but a stale page or a hand-made
  // POST must not be able to open an attempt on a closed paper.
  const used = (await getOwnAttempts()).filter(
    (a) => a.assessmentId === assessmentId,
  );
  const state = availability(assessment, used.length);
  if (!state.open) {
    return { status: "error", message: "That assessment is not open." };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("assessment_attempts")
    .insert({
      assessment_id: assessmentId,
      student_id: student.id,
      attempt_number: used.length + 1,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: "Could not start that attempt." };
  }

  redirect(`/assessments/${assessmentId}/attempt/${data.id}`);
}

/**
 * Saves answers, and submits when asked.
 *
 * Answers are upserted as a set on every save rather than diffed: a paper is
 * small, and a partial write that loses one answer is far worse than writing
 * a few unchanged rows.
 */
export async function saveAnswers(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const student = await getOwnStudent();
  if (!student) {
    return { status: "error", message: "Student access required." };
  }

  const attemptId = String(formData.get("attemptId") ?? "");
  const submit = formData.get("submit") === "true";

  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.studentId !== student.id) {
    return { status: "error", message: "That attempt is not yours." };
  }
  if (attempt.status !== "in_progress") {
    return { status: "error", message: "This attempt has already been submitted." };
  }

  const assessment = await getAssessment(attempt.assessmentId);
  if (!assessment) {
    return { status: "error", message: "That assessment is no longer available." };
  }

  const questions = await getAuthoredQuestions(attempt.assessmentId);
  const supabase = createClient();

  const rows = questions.map((question) => ({
    attempt_id: attemptId,
    question_id: question.id,
    selected_option_ids: formData
      .getAll(`q:${question.id}`)
      .map(String)
      .filter((v) => v.length > 0),
    text_answer: (() => {
      const raw = formData.get(`text:${question.id}`);
      const text = typeof raw === "string" ? raw.trim() : "";
      return text.length > 0 ? text : null;
    })(),
  }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("student_answers")
      .upsert(rows, { onConflict: "attempt_id,question_id" });

    if (error) {
      return { status: "error", message: "Could not save your answers." };
    }
  }

  if (!submit) {
    revalidatePath(`/assessments/${attempt.assessmentId}/attempt/${attemptId}`);
    return { status: "success", message: "Saved. You can come back to this." };
  }

  // --- Submission: auto-mark what can be marked ----------------------------
  const answers = await getAnswers(attemptId);
  const result = gradeAttempt(
    questions.map((q) => ({
      id: q.id,
      kind: q.kind,
      points: q.points,
      options: q.options.map((o) => ({
        id: o.id,
        isCorrect: o.isCorrect,
        scoreValue: o.scoreValue,
      })),
    })),
    answers.map((a) => ({
      questionId: a.questionId,
      selectedOptionIds: a.selectedOptionIds,
      textAnswer: a.textAnswer,
    })),
    assessment.passPercentage,
  );

  // The student's own session cannot write marks — the trigger from 0013
  // refuses it — so the scoring pass runs with the service role, the same
  // narrow, audited use the audit log already makes of it.
  const { createAdminClient } = await import("@/lib/supabase/server");
  const service = createAdminClient();

  for (const outcome of result.outcomes) {
    if (outcome.awardedPoints === null) continue;
    await service
      .from("student_answers")
      .update({ awarded_points: outcome.awardedPoints })
      .eq("attempt_id", attemptId)
      .eq("question_id", outcome.questionId);
  }

  await service
    .from("assessment_attempts")
    .update({
      status: result.needsManualMarking ? "submitted" : "graded",
      submitted_at: new Date().toISOString(),
      score: result.score,
      max_score: result.maxScore,
      percentage: result.percentage,
      passed: result.passed,
      graded_at: result.needsManualMarking ? null : new Date().toISOString(),
    })
    .eq("id", attemptId);

  revalidatePath("/assessments");
  redirect(`/assessments/${attempt.assessmentId}/attempt/${attemptId}`);
}

// --- Marking -----------------------------------------------------------------

/**
 * Records a mentor's mark on one subjective answer, then recomputes the
 * attempt. Recomputing here rather than in a trigger keeps the arithmetic in
 * the pure, unit-tested `finaliseAttempt` instead of duplicated in PL/pgSQL.
 */
export async function gradeAnswer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const parsed = gradeAnswerSchema.safeParse({
    answerId: formData.get("answerId"),
    awardedPoints: formData.get("awardedPoints"),
    remarks: formData.get("remarks"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the mark you entered.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const attemptId = String(formData.get("attemptId") ?? "");
  const supabase = createClient();

  const { error } = await supabase
    .from("student_answers")
    .update({
      awarded_points: parsed.data.awardedPoints,
      graded_by: staff.id,
      graded_at: new Date().toISOString(),
      grader_remarks: parsed.data.remarks,
    })
    .eq("id", parsed.data.answerId);

  if (error) {
    return { status: "error", message: "Could not record that mark." };
  }

  const attempt = await getAttempt(attemptId);
  if (attempt) {
    const assessment = await getAssessment(attempt.assessmentId);
    const questions = await getAuthoredQuestions(attempt.assessmentId);
    const answers = await getAnswers(attemptId);
    const pointsByQuestion = new Map(questions.map((q) => [q.id, q.points]));

    const totals = finaliseAttempt(
      questions.map((question) => {
        const answer = answers.find((a) => a.questionId === question.id);
        return {
          awardedPoints: answer?.awardedPoints ?? null,
          maxPoints: pointsByQuestion.get(question.id) ?? 0,
        };
      }),
      assessment?.passPercentage ?? null,
    );

    await supabase
      .from("assessment_attempts")
      .update({
        status: totals.needsManualMarking ? "submitted" : "graded",
        score: totals.score,
        max_score: totals.maxScore,
        percentage: totals.percentage,
        passed: totals.passed,
        graded_at: totals.needsManualMarking ? null : new Date().toISOString(),
      })
      .eq("id", attemptId);
  }

  revalidatePath(`/faculty/assessments/attempts/${attemptId}`);
  return { status: "success", message: "Mark recorded." };
}
