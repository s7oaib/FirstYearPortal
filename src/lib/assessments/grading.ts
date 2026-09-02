/**
 * Auto-grading (PRD 5.7).
 *
 * Pure and dependency-free, for the same reason `profile-completion.ts` and
 * `admin/analytics.ts` are: this arithmetic decides what a student is told
 * they scored. It is exactly the kind of logic that goes quietly wrong and is
 * then reported to a student, and a mentor, as fact — so it is testable
 * without a database anywhere near it.
 *
 * Subjective questions are deliberately *not* guessed at. A short or long
 * answer returns `null` rather than zero, because "not marked yet" and
 * "marked and worth nothing" are different claims, and collapsing them would
 * show a student a failing score for work nobody has read.
 */

import { isObjective } from "@/config/assessments";

export type GradableOption = {
  id: string;
  isCorrect: boolean | null;
  scoreValue: number;
};

export type GradableQuestion = {
  id: string;
  kind: string;
  points: number;
  options: GradableOption[];
};

export type SubmittedAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  textAnswer: string | null;
};

export type QuestionOutcome = {
  questionId: string;
  /** null when a human still has to mark it. */
  awardedPoints: number | null;
  maxPoints: number;
  autoMarked: boolean;
};

/**
 * Marks one objective question.
 *
 * Multiple-choice is all-or-nothing: every correct option selected and no
 * incorrect one. Partial credit is defensible but has to be a deliberate
 * institutional choice rather than a silent default, because it changes what
 * a pass mark means.
 */
export function gradeQuestion(
  question: GradableQuestion,
  answer: SubmittedAnswer | undefined,
): QuestionOutcome {
  const maxPoints = Number(question.points) || 0;

  if (!isObjective(question.kind)) {
    // Likert items carry a scale value rather than a correct answer, so they
    // are scored here even though they are not "objective" in the marking
    // sense — there is nothing for a human to judge.
    if (question.kind === "likert") {
      const selected = new Set(answer?.selectedOptionIds ?? []);
      const value = question.options
        .filter((option) => selected.has(option.id))
        .reduce((sum, option) => sum + (Number(option.scoreValue) || 0), 0);

      return {
        questionId: question.id,
        awardedPoints: value,
        maxPoints,
        autoMarked: true,
      };
    }

    return {
      questionId: question.id,
      awardedPoints: null,
      maxPoints,
      autoMarked: false,
    };
  }

  const correctIds = new Set(
    question.options.filter((o) => o.isCorrect === true).map((o) => o.id),
  );

  // A question whose author never marked an option correct cannot be graded
  // against anything. Treating it as "everyone scores zero" would punish
  // students for an authoring mistake, so it goes to a human instead.
  if (correctIds.size === 0) {
    return {
      questionId: question.id,
      awardedPoints: null,
      maxPoints,
      autoMarked: false,
    };
  }

  const selected = new Set(answer?.selectedOptionIds ?? []);

  // An unanswered question scores zero — it was marked, and the mark is nil.
  if (selected.size === 0) {
    return {
      questionId: question.id,
      awardedPoints: 0,
      maxPoints,
      autoMarked: true,
    };
  }

  const everyCorrectChosen = [...correctIds].every((id) => selected.has(id));
  const noIncorrectChosen = [...selected].every((id) => correctIds.has(id));
  const right = everyCorrectChosen && noIncorrectChosen;

  return {
    questionId: question.id,
    awardedPoints: right ? maxPoints : 0,
    maxPoints,
    autoMarked: true,
  };
}

export type AttemptResult = {
  outcomes: QuestionOutcome[];
  /** Points awarded so far, counting only what has actually been marked. */
  score: number;
  /** Total points available across every question. */
  maxScore: number;
  /** Percentage of the whole paper, or null while marking is outstanding. */
  percentage: number | null;
  passed: boolean | null;
  /** True when a human still has to mark at least one answer. */
  needsManualMarking: boolean;
};

export function gradeAttempt(
  questions: GradableQuestion[],
  answers: SubmittedAnswer[],
  passPercentage: number | null,
): AttemptResult {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  const outcomes = questions.map((question) =>
    gradeQuestion(question, byQuestion.get(question.id)),
  );

  const score = outcomes.reduce((sum, o) => sum + (o.awardedPoints ?? 0), 0);
  const maxScore = outcomes.reduce((sum, o) => sum + o.maxPoints, 0);
  const needsManualMarking = outcomes.some((o) => !o.autoMarked);

  // The percentage is withheld while anything is unmarked rather than
  // computed from a partial score. A student who sees "40%" on a paper half
  // of which nobody has read has been told something false.
  const percentage =
    needsManualMarking || maxScore === 0
      ? null
      : Math.round((score / maxScore) * 10000) / 100;

  const passed =
    percentage === null || passPercentage === null
      ? null
      : percentage >= passPercentage;

  return { outcomes, score, maxScore, percentage, passed, needsManualMarking };
}

/**
 * Recomputes an attempt once a human has marked the outstanding answers.
 *
 * Takes the marks as given rather than re-deriving them: a mentor's judgement
 * on a long answer is the input here, not something to second-guess.
 */
export function finaliseAttempt(
  marks: Array<{ awardedPoints: number | null; maxPoints: number }>,
  passPercentage: number | null,
): Omit<AttemptResult, "outcomes"> {
  const needsManualMarking = marks.some((m) => m.awardedPoints === null);
  const score = marks.reduce((sum, m) => sum + (m.awardedPoints ?? 0), 0);
  const maxScore = marks.reduce((sum, m) => sum + m.maxPoints, 0);

  const percentage =
    needsManualMarking || maxScore === 0
      ? null
      : Math.round((score / maxScore) * 10000) / 100;

  const passed =
    percentage === null || passPercentage === null
      ? null
      : percentage >= passPercentage;

  return { score, maxScore, percentage, passed, needsManualMarking };
}

/**
 * Whether a paper is open for sitting right now.
 *
 * Window checks live here rather than in the query so the student's list, the
 * "start attempt" action, and the results view all agree — and so the reason
 * a paper is unavailable can be shown, instead of it simply not appearing.
 */
export type Availability =
  | { open: true }
  | { open: false; reason: "not_published" | "not_yet_open" | "closed" | "no_attempts_left" };

export function availability(
  assessment: {
    isPublished: boolean;
    opensAt: string | null;
    closesAt: string | null;
    maxAttempts: number;
  },
  attemptsUsed: number,
  now: Date = new Date(),
): Availability {
  if (!assessment.isPublished) return { open: false, reason: "not_published" };

  if (assessment.opensAt && new Date(assessment.opensAt) > now) {
    return { open: false, reason: "not_yet_open" };
  }
  if (assessment.closesAt && new Date(assessment.closesAt) <= now) {
    return { open: false, reason: "closed" };
  }
  if (attemptsUsed >= assessment.maxAttempts) {
    return { open: false, reason: "no_attempts_left" };
  }

  return { open: true };
}

export const AVAILABILITY_COPY: Record<
  Exclude<Availability, { open: true }>["reason"],
  string
> = {
  not_published: "Not published yet.",
  not_yet_open: "Opens later.",
  closed: "This assessment has closed.",
  no_attempts_left: "You have used all your attempts.",
};
