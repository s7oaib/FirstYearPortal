import Link from "next/link";
import { Card, CardBody, CardHeader, StatTile } from "@/components/ui/Card";
import { MarkAnswerForm } from "./MarkAnswerForm";
import {
  PSYCHOMETRIC_DISCLOSURE,
  attemptStatusLabel,
  isObjective,
} from "@/config/assessments";
import type {
  AssessmentSummary,
  AuthoredQuestion,
  Attempt,
  StoredAnswer,
} from "@/lib/queries/assessments";

/**
 * Marking one attempt.
 *
 * Objective questions arrive already marked — the machine did them at
 * submission — so they are shown read-only with the correct answer alongside.
 * Only the written answers carry a mark box, because those are the ones a
 * person actually has to judge.
 */
export function AttemptMarking({
  assessment,
  attempt,
  questions,
  answers,
  studentName,
  studentUsn,
  backHref,
}: {
  assessment: AssessmentSummary;
  attempt: Attempt;
  questions: AuthoredQuestion[];
  answers: StoredAnswer[];
  studentName: string;
  studentUsn: string;
  backHref: string;
}) {
  const isPsychometric = assessment.kind === "psychometric";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={backHref}
        className="inline-block rounded text-sm font-medium text-indigo-700 hover:underline"
      >
        ← Back to the assessment
      </Link>

      <header>
        <p className="text-sm font-medium text-brass-600">{assessment.title}</p>
        <h1 className="mt-1 text-2xl text-indigo-950 sm:text-3xl">
          {studentName}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {studentUsn} · attempt {attempt.attemptNumber} ·{" "}
          {attemptStatusLabel(attempt.status)}
        </p>
      </header>

      {isPsychometric ? (
        <p className="rounded-lg border border-brass-300/60 bg-brass-50 px-3.5 py-2.5 text-sm text-brass-800">
          {PSYCHOMETRIC_DISCLOSURE}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Score"
            value={
              attempt.score === null || attempt.maxScore === null
                ? "—"
                : `${attempt.score} / ${attempt.maxScore}`
            }
          />
          <StatTile
            label="Percentage"
            value={
              attempt.percentage === null
                ? "Incomplete"
                : `${attempt.percentage}%`
            }
          />
          <StatTile
            label="Outcome"
            value={
              attempt.passed === null
                ? "—"
                : attempt.passed
                  ? "Passed"
                  : "Not passed"
            }
          />
        </div>
      )}

      <ol className="space-y-4">
        {questions.map((question, index) => {
          const answer = answers.find((a) => a.questionId === question.id);
          const chosen = new Set(answer?.selectedOptionIds ?? []);
          const chosenLabels = question.options
            .filter((o) => chosen.has(o.id))
            .map((o) => o.label);
          const correctLabels = question.options
            .filter((o) => o.isCorrect === true)
            .map((o) => o.label);

          return (
            <li key={question.id}>
              <Card as="section">
                <CardHeader
                  title={`${index + 1}. ${question.prompt}`}
                  eyebrow={`${question.points} point${
                    question.points === 1 ? "" : "s"
                  }`}
                />
                <CardBody className="space-y-3">
                  <div>
                    <p className="text-xs text-ink-faint">Their answer</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">
                      {answer?.textAnswer
                        ? answer.textAnswer
                        : chosenLabels.length > 0
                          ? chosenLabels.join(", ")
                          : "Not answered."}
                    </p>
                  </div>

                  {isObjective(question.kind) && correctLabels.length > 0 && (
                    <div>
                      <p className="text-xs text-ink-faint">Correct answer</p>
                      <p className="mt-0.5 text-sm text-success">
                        {correctLabels.join(", ")}
                      </p>
                    </div>
                  )}

                  {isObjective(question.kind) || question.kind === "likert" ? (
                    <p className="text-sm text-ink-muted">
                      Marked automatically:{" "}
                      <span className="font-medium tabular-nums">
                        {answer?.awardedPoints ?? 0} / {question.points}
                      </span>
                    </p>
                  ) : answer ? (
                    <MarkAnswerForm
                      answerId={answer.id}
                      attemptId={attempt.id}
                      maxPoints={question.points}
                      currentPoints={answer.awardedPoints}
                      currentRemarks={answer.graderRemarks}
                    />
                  ) : (
                    <p className="text-sm text-ink-faint">
                      Nothing was submitted for this question.
                    </p>
                  )}
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
