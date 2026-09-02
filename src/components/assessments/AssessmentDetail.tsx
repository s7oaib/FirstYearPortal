import Link from "next/link";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/Card";
import { AssessmentForm } from "./AssessmentForm";
import { QuestionForm } from "./QuestionForm";
import { PublishToggle, RemoveQuestionButton } from "./AssessmentControls";
import {
  assessmentKindLabel,
  attemptStatusLabel,
  questionKindLabel,
} from "@/config/assessments";
import type {
  AssessmentSummary,
  AuthoredQuestion,
  Attempt,
} from "@/lib/queries/assessments";

/**
 * The authoring view: settings, questions, and who has sat it.
 *
 * Correct answers are visible here because the reader is the author or a
 * reviewer — this composes `getAuthoredQuestions`, which reads the base
 * tables. The student's path reads the `exam_*` views instead, which omit
 * `is_correct` at the database level rather than trusting a component not to
 * render it.
 */
export function AssessmentDetail({
  assessment,
  questions,
  attempts,
  departments,
  basePath,
}: {
  assessment: AssessmentSummary;
  questions: AuthoredQuestion[];
  attempts: Array<Attempt & { studentName: string; studentUsn: string }>;
  departments: Array<{ code: string; name: string }>;
  basePath: string;
}) {
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={basePath}
        className="inline-block rounded text-sm font-medium text-indigo-700 hover:underline"
      >
        ← Back to assessments
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brass-600">
            {assessmentKindLabel(assessment.kind)}
          </p>
          <h1 className="mt-1 text-2xl text-indigo-950 sm:text-3xl">
            {assessment.title}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {questions.length} question{questions.length === 1 ? "" : "s"} ·{" "}
            {totalPoints} point{totalPoints === 1 ? "" : "s"} ·{" "}
            {attempts.length} attempt{attempts.length === 1 ? "" : "s"}
          </p>
        </div>
        <PublishToggle
          assessmentId={assessment.id}
          isPublished={assessment.isPublished}
          questionCount={questions.length}
        />
      </header>

      <Card as="section">
        <CardHeader
          title="Questions"
          description="Students see these in order, unless you asked for them to be shuffled."
        />
        <CardBody>
          {questions.length === 0 ? (
            <EmptyState
              title="No questions yet"
              description="Add the first one below. An assessment cannot be published while it is empty."
            />
          ) : (
            <ol className="space-y-4">
              {questions.map((question, index) => (
                <li
                  key={question.id}
                  className="border-b border-indigo-100 pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium text-indigo-950">
                      {index + 1}. {question.prompt}
                    </p>
                    <RemoveQuestionButton
                      questionId={question.id}
                      assessmentId={assessment.id}
                    />
                  </div>
                  <p className="mt-1 text-xs text-ink-faint">
                    {questionKindLabel(question.kind)} · {question.points} point
                    {question.points === 1 ? "" : "s"}
                    {question.required ? "" : " · optional"}
                  </p>
                  {question.options.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {question.options.map((option) => (
                        <li
                          key={option.id}
                          className="flex items-center gap-2 text-sm text-ink-muted"
                        >
                          <span
                            aria-hidden="true"
                            className={[
                              "grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[0.5rem] font-bold",
                              option.isCorrect
                                ? "border-success bg-success text-white"
                                : "border-indigo-200 bg-white text-transparent",
                            ].join(" ")}
                          >
                            ✓
                          </span>
                          <span>{option.label}</span>
                          {question.kind === "likert" && (
                            <span className="text-xs text-ink-faint">
                              ({option.scoreValue})
                            </span>
                          )}
                          {option.isCorrect && (
                            <span className="sr-only">(correct answer)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader title="Add a question" />
        <CardBody>
          <QuestionForm assessmentId={assessment.id} />
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader
          title="Attempts"
          description="Papers with written answers need marking before a final score exists."
        />
        <CardBody className={attempts.length === 0 ? undefined : "px-0 py-0"}>
          {attempts.length === 0 ? (
            <p className="text-sm text-ink-faint">Nobody has sat this yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">
                  Attempts at {assessment.title}
                </caption>
                <thead>
                  <tr className="border-b border-indigo-100 text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th scope="col" className="px-5 py-3 font-medium">Student</th>
                    <th scope="col" className="px-3 py-3 font-medium">Status</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Score</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Mark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-100">
                  {attempts.map((attempt) => (
                    <tr key={attempt.id} className="hover:bg-indigo-50/40">
                      <td className="px-5 py-3">
                        <p className="font-medium text-indigo-900">
                          {attempt.studentName}
                        </p>
                        <p className="text-xs text-ink-faint">
                          {attempt.studentUsn} · attempt {attempt.attemptNumber}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-ink-muted">
                        {attemptStatusLabel(attempt.status)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-muted">
                        {attempt.percentage === null
                          ? "—"
                          : `${attempt.percentage}%`}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {attempt.status === "in_progress" ? (
                          <span className="text-xs text-ink-faint">
                            Not submitted
                          </span>
                        ) : (
                          <Link
                            href={`${basePath}/attempts/${attempt.id}`}
                            className="rounded text-sm font-medium text-indigo-700 hover:underline"
                          >
                            Open
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader
          title="Settings"
          description="Changing the audience changes who can see this from now on."
        />
        <CardBody>
          <AssessmentForm departments={departments} assessment={assessment} />
        </CardBody>
      </Card>
    </div>
  );
}
