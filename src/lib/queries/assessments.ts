import "server-only";

import { createClient } from "@/lib/supabase/server";
import { availability, type Availability } from "@/lib/assessments/grading";
import type {
  AssessmentKind,
  AttemptStatus,
  QuestionKind,
} from "@/config/assessments";

/**
 * Assessment reads (PRD 5.7).
 *
 * Scoping comes from RLS, as everywhere else: a student sees published papers
 * aimed at them, an author sees their own, a head of department sees their
 * department's, an administrator sees all. None of these functions take a
 * role or a student id for that purpose.
 *
 * Students read questions through `exam_questions` / `exam_options`, which
 * omit `is_correct`. Reading the base tables here instead would hand out an
 * answer key, so the split is deliberate and the student paths never touch
 * `questions` or `question_options` directly.
 */

export type AssessmentSummary = {
  id: string;
  title: string;
  description: string | null;
  kind: AssessmentKind;
  departmentCode: string | null;
  semester: number | null;
  section: string | null;
  opensAt: string | null;
  closesAt: string | null;
  durationMinutes: number | null;
  maxAttempts: number;
  passPercentage: number | null;
  randomiseQuestions: boolean;
  isPublished: boolean;
  createdAt: string;
};

const ASSESSMENT_COLUMNS =
  "id, title, description, kind, department_code, semester, section, opens_at, closes_at, duration_minutes, max_attempts, pass_percentage, randomise_questions, is_published, created_at" as const;

type AssessmentDbRow = {
  id: string;
  title: string;
  description: string | null;
  kind: AssessmentKind;
  department_code: string | null;
  semester: number | null;
  section: string | null;
  opens_at: string | null;
  closes_at: string | null;
  duration_minutes: number | null;
  max_attempts: number;
  pass_percentage: number | null;
  randomise_questions: boolean;
  is_published: boolean;
  created_at: string;
};

function mapAssessment(row: AssessmentDbRow): AssessmentSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    departmentCode: row.department_code,
    semester: row.semester,
    section: row.section,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    durationMinutes: row.duration_minutes,
    maxAttempts: row.max_attempts,
    passPercentage: row.pass_percentage,
    randomiseQuestions: row.randomise_questions,
    isPublished: row.is_published,
    createdAt: row.created_at,
  };
}

/** Every assessment the caller may see, newest first. */
export async function listAssessments(): Promise<AssessmentSummary[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("assessments")
    .select(ASSESSMENT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);

  return (data ?? []).map(mapAssessment);
}

export async function getAssessment(
  id: string,
): Promise<AssessmentSummary | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  return data ? mapAssessment(data) : null;
}

// --- Authoring view (correct answers visible) --------------------------------

export type AuthoredOption = {
  id: string;
  label: string;
  position: number;
  isCorrect: boolean | null;
  scoreValue: number;
};

export type AuthoredQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  helpText: string | null;
  position: number;
  points: number;
  required: boolean;
  options: AuthoredOption[];
};

/**
 * The paper as its author sees it, correct answers included.
 *
 * RLS on `questions` resolves through the assessment, so a caller who cannot
 * see the assessment gets nothing here — but this reads the base tables, so
 * it must never be called from a student-facing path.
 */
export async function getAuthoredQuestions(
  assessmentId: string,
): Promise<AuthoredQuestion[]> {
  const supabase = createClient();

  const { data: questions } = await supabase
    .from("questions")
    .select("id, kind, prompt, help_text, position, points, required")
    .eq("assessment_id", assessmentId)
    .order("position", { ascending: true });

  if (!questions || questions.length === 0) return [];

  const { data: options } = await supabase
    .from("question_options")
    .select("id, question_id, label, position, is_correct, score_value")
    .in(
      "question_id",
      questions.map((q) => q.id),
    )
    .order("position", { ascending: true });

  const byQuestion = new Map<string, AuthoredOption[]>();
  for (const option of options ?? []) {
    byQuestion.set(option.question_id, [
      ...(byQuestion.get(option.question_id) ?? []),
      {
        id: option.id,
        label: option.label,
        position: option.position,
        isCorrect: option.is_correct,
        scoreValue: Number(option.score_value),
      },
    ]);
  }

  return questions.map((q) => ({
    id: q.id,
    kind: q.kind,
    prompt: q.prompt,
    helpText: q.help_text,
    position: q.position,
    points: Number(q.points),
    required: q.required,
    options: byQuestion.get(q.id) ?? [],
  }));
}

// --- Sitting view (no correct answers) ---------------------------------------

export type ExamOption = { id: string; label: string; position: number };

export type ExamQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  helpText: string | null;
  position: number;
  points: number;
  required: boolean;
  options: ExamOption[];
};

/**
 * The paper as a student sits it.
 *
 * Reads `exam_questions` / `exam_options`, which omit `is_correct` at the
 * database level. That is the whole point of those views: a student who can
 * read which option is correct does not have an assessment.
 */
export async function getExamPaper(
  assessmentId: string,
): Promise<ExamQuestion[]> {
  const supabase = createClient();

  const { data: questions } = await supabase
    .from("exam_questions")
    .select("id, kind, prompt, help_text, position, points, required")
    .eq("assessment_id", assessmentId)
    .order("position", { ascending: true });

  if (!questions || questions.length === 0) return [];

  const { data: options } = await supabase
    .from("exam_options")
    .select("id, question_id, label, position")
    .in(
      "question_id",
      questions.map((q) => q.id),
    )
    .order("position", { ascending: true });

  const byQuestion = new Map<string, ExamOption[]>();
  for (const option of options ?? []) {
    byQuestion.set(option.question_id, [
      ...(byQuestion.get(option.question_id) ?? []),
      { id: option.id, label: option.label, position: option.position },
    ]);
  }

  return questions.map((q) => ({
    id: q.id,
    kind: q.kind,
    prompt: q.prompt,
    helpText: q.help_text,
    position: q.position,
    points: Number(q.points),
    required: q.required,
    options: byQuestion.get(q.id) ?? [],
  }));
}

// --- Attempts ----------------------------------------------------------------

export type Attempt = {
  id: string;
  assessmentId: string;
  studentId: string;
  attemptNumber: number;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
};

const ATTEMPT_COLUMNS =
  "id, assessment_id, student_id, attempt_number, status, started_at, submitted_at, score, max_score, percentage, passed" as const;

type AttemptDbRow = {
  id: string;
  assessment_id: string;
  student_id: string;
  attempt_number: number;
  status: AttemptStatus;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  passed: boolean | null;
};

function mapAttempt(row: AttemptDbRow): Attempt {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    studentId: row.student_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    score: row.score === null ? null : Number(row.score),
    maxScore: row.max_score === null ? null : Number(row.max_score),
    percentage: row.percentage === null ? null : Number(row.percentage),
    passed: row.passed,
  };
}

/** The signed-in student's own attempts. RLS restricts this to them. */
export async function getOwnAttempts(): Promise<Attempt[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("assessment_attempts")
    .select(ATTEMPT_COLUMNS)
    .order("started_at", { ascending: false });

  return (data ?? []).map(mapAttempt);
}

export async function getAttempt(id: string): Promise<Attempt | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("assessment_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  return data ? mapAttempt(data) : null;
}

/** Every attempt at one assessment, for its author or a reviewer. */
export async function getAttemptsForAssessment(
  assessmentId: string,
): Promise<Array<Attempt & { studentName: string; studentUsn: string }>> {
  const supabase = createClient();

  const { data } = await supabase
    .from("assessment_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("assessment_id", assessmentId)
    .order("started_at", { ascending: false })
    .limit(500);

  const attempts = (data ?? []).map(mapAttempt);
  if (attempts.length === 0) return [];

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, usn")
    .in("id", Array.from(new Set(attempts.map((a) => a.studentId))));

  const byId = new Map((students ?? []).map((s) => [s.id, s]));

  return attempts.map((attempt) => ({
    ...attempt,
    studentName: byId.get(attempt.studentId)?.full_name ?? "Unknown student",
    studentUsn: byId.get(attempt.studentId)?.usn ?? "—",
  }));
}

export type StoredAnswer = {
  id: string;
  questionId: string;
  selectedOptionIds: string[];
  textAnswer: string | null;
  awardedPoints: number | null;
  graderRemarks: string | null;
};

export async function getAnswers(attemptId: string): Promise<StoredAnswer[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("student_answers")
    .select(
      "id, question_id, selected_option_ids, text_answer, awarded_points, grader_remarks",
    )
    .eq("attempt_id", attemptId);

  return (data ?? []).map((row) => ({
    id: row.id,
    questionId: row.question_id,
    selectedOptionIds: row.selected_option_ids ?? [],
    textAnswer: row.text_answer,
    awardedPoints:
      row.awarded_points === null ? null : Number(row.awarded_points),
    graderRemarks: row.grader_remarks,
  }));
}

// --- The student's assessment list -------------------------------------------

export type StudentAssessment = {
  assessment: AssessmentSummary;
  attempts: Attempt[];
  availability: Availability;
};

/**
 * What a student sees on their assessments page.
 *
 * Availability is resolved here rather than by filtering the list, so a paper
 * that is closed or used up still appears with the reason why. A paper that
 * silently vanishes reads as a bug to the person who was told to sit it.
 */
export async function getStudentAssessments(): Promise<StudentAssessment[]> {
  const [assessments, attempts] = await Promise.all([
    listAssessments(),
    getOwnAttempts(),
  ]);

  const byAssessment = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    byAssessment.set(attempt.assessmentId, [
      ...(byAssessment.get(attempt.assessmentId) ?? []),
      attempt,
    ]);
  }

  return assessments.map((assessment) => {
    const own = byAssessment.get(assessment.id) ?? [];
    return {
      assessment,
      attempts: own,
      availability: availability(assessment, own.length),
    };
  });
}

/** Count for the staff sidebar badge: attempts waiting to be marked. */
export async function getPendingMarkingCount(): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from("assessment_attempts")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted");
  return count ?? 0;
}
