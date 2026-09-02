import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/Card";
import { StartAttemptButton } from "@/components/assessments/StartAttemptButton";
import { getOwnStudent } from "@/lib/queries/student";
import { getStudentAssessments } from "@/lib/queries/assessments";
import {
  assessmentKindLabel,
  attemptStatusLabel,
} from "@/config/assessments";
import { AVAILABILITY_COPY } from "@/lib/assessments/grading";

export const metadata: Metadata = { title: "My assessments" };

export default async function StudentAssessmentsPage() {
  const student = await getOwnStudent();
  if (!student) redirect("/login");

  const items = await getStudentAssessments();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl text-indigo-950 sm:text-3xl">My assessments</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Assessments set for your department, semester, and section. Your
          results appear here once they have been marked.
        </p>
      </header>

      {items.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="Nothing set yet"
              description="When a faculty member publishes an assessment for your class, it appears here."
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-4">
          {items.map(({ assessment, attempts, availability }) => {
            const latest = attempts[0];

            return (
              <li key={assessment.id}>
                <Card as="section">
                  <CardHeader
                    title={assessment.title}
                    description={assessment.description ?? undefined}
                    eyebrow={assessmentKindLabel(assessment.kind)}
                  />
                  <CardBody className="space-y-3">
                    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-faint">
                      {assessment.durationMinutes && (
                        <div>
                          <dt className="inline">Time: </dt>
                          <dd className="inline text-ink-muted">
                            {assessment.durationMinutes} minutes
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="inline">Attempts: </dt>
                        <dd className="inline text-ink-muted">
                          {attempts.length} of {assessment.maxAttempts} used
                        </dd>
                      </div>
                      {assessment.closesAt && (
                        <div>
                          <dt className="inline">Closes: </dt>
                          <dd className="inline text-ink-muted">
                            {new Date(assessment.closesAt).toLocaleString()}
                          </dd>
                        </div>
                      )}
                    </dl>

                    {latest && (
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-sm">
                        <p className="text-ink-muted">
                          Last attempt: {attemptStatusLabel(latest.status)}
                          {latest.percentage !== null && (
                            <>
                              {" · "}
                              <span className="font-medium tabular-nums text-indigo-900">
                                {latest.percentage}%
                              </span>
                              {latest.passed !== null &&
                                (latest.passed ? " · passed" : " · not passed")}
                            </>
                          )}
                        </p>
                        <Link
                          href={`/assessments/${assessment.id}/attempt/${latest.id}`}
                          className="rounded text-xs font-medium text-indigo-700 hover:underline"
                        >
                          {latest.status === "in_progress"
                            ? "Continue this attempt"
                            : "See your answers"}
                        </Link>
                      </div>
                    )}

                    {availability.open ? (
                      <StartAttemptButton
                        assessmentId={assessment.id}
                        kind={assessment.kind}
                        resuming={latest?.status === "in_progress"}
                      />
                    ) : (
                      <p className="text-sm text-ink-faint">
                        {AVAILABILITY_COPY[availability.reason]}
                      </p>
                    )}
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
