import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardBody, CardHeader, ProgressBar, StatTile } from "@/components/ui/Card";
import { ExamForm } from "@/components/assessments/ExamForm";
import { getOwnStudent } from "@/lib/queries/student";
import {
  getAnswers,
  getAssessment,
  getAttempt,
  getExamPaper,
} from "@/lib/queries/assessments";
import {
  PSYCHOMETRIC_DISCLOSURE,
  assessmentKindLabel,
  attemptStatusLabel,
} from "@/config/assessments";

export const metadata: Metadata = { title: "Assessment" };

export default async function AttemptPage({
  params,
}: {
  params: { id: string; attemptId: string };
}) {
  const student = await getOwnStudent();
  if (!student) redirect("/login");

  const [attempt, assessment] = await Promise.all([
    getAttempt(params.attemptId),
    getAssessment(params.id),
  ]);

  // RLS already restricts attempts to their owner, so a mismatch here means
  // a hand-edited URL rather than a real record. Treated as not-found for the
  // same reason the student directory is: the difference between "no such
  // attempt" and "not yours" is itself information.
  if (!attempt || !assessment || attempt.studentId !== student.id) notFound();
  if (attempt.assessmentId !== assessment.id) notFound();

  const [questions, answers] = await Promise.all([
    getExamPaper(assessment.id),
    getAnswers(attempt.id),
  ]);

  const inProgress = attempt.status === "in_progress";
  const isPsychometric = assessment.kind === "psychometric";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/assessments"
        className="inline-block rounded text-sm font-medium text-indigo-700 hover:underline"
      >
        ← Back to my assessments
      </Link>

      <header>
        <p className="text-sm font-medium text-brass-600">
          {assessmentKindLabel(assessment.kind)}
        </p>
        <h1 className="mt-1 text-2xl text-indigo-950 sm:text-3xl">
          {assessment.title}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Attempt {attempt.attemptNumber} · {attemptStatusLabel(attempt.status)}
          {assessment.durationMinutes
            ? ` · ${assessment.durationMinutes} minutes`
            : ""}
        </p>
      </header>

      {inProgress ? (
        <ExamForm
          attemptId={attempt.id}
          questions={questions}
          existing={answers}
          isPsychometric={isPsychometric}
        />
      ) : (
        <div className="space-y-5">
          {isPsychometric ? (
            // A psychometric result is not a score to be passed or failed,
            // and presenting one as a percentage invites exactly the reading
            // PRD section 2 rules out. So it is deliberately not shown that
            // way here.
            <Card as="section">
              <CardHeader
                title="Your responses are recorded"
                description="Your mentor can see these and will discuss them with you."
              />
              <CardBody>
                <p className="text-sm leading-relaxed text-ink-muted">
                  {PSYCHOMETRIC_DISCLOSURE}
                </p>
              </CardBody>
            </Card>
          ) : (
            <>
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
                      ? "Awaiting marking"
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

              {attempt.percentage !== null && (
                <Card as="section">
                  <CardBody>
                    <ProgressBar value={attempt.percentage} label="Your score" />
                  </CardBody>
                </Card>
              )}

              {attempt.status === "submitted" && (
                <p className="rounded-lg border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-sm text-warning">
                  Some answers still need a person to mark them. Your final
                  score appears once that is done.
                </p>
              )}
            </>
          )}

          <Card as="section">
            <CardHeader
              title="Your answers"
              description="What you submitted, with any remarks from your marker."
            />
            <CardBody>
              <ol className="space-y-4">
                {questions.map((question, index) => {
                  const answer = answers.find(
                    (a) => a.questionId === question.id,
                  );
                  const chosen = new Set(answer?.selectedOptionIds ?? []);
                  const labels = question.options
                    .filter((o) => chosen.has(o.id))
                    .map((o) => o.label);

                  return (
                    <li
                      key={question.id}
                      className="border-b border-indigo-100 pb-4 last:border-0 last:pb-0"
                    >
                      <p className="text-sm font-medium text-indigo-950">
                        {index + 1}. {question.prompt}
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {answer?.textAnswer
                          ? answer.textAnswer
                          : labels.length > 0
                            ? labels.join(", ")
                            : "Not answered."}
                      </p>
                      {!isPsychometric && (
                        <p className="mt-1 text-xs text-ink-faint">
                          {answer?.awardedPoints === null ||
                          answer?.awardedPoints === undefined
                            ? "Awaiting marking"
                            : `${answer.awardedPoints} of ${question.points}`}
                        </p>
                      )}
                      {answer?.graderRemarks && (
                        <p className="mt-1.5 rounded-md border border-indigo-100 bg-indigo-50/60 px-2.5 py-1.5 text-xs text-indigo-900">
                          {answer.graderRemarks}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
