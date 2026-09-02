import Link from "next/link";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { assessmentKindLabel } from "@/config/assessments";
import type { AssessmentSummary } from "@/lib/queries/assessments";

/** Describes an assessment's audience in the words an author would use. */
function describeAudience(assessment: AssessmentSummary): string {
  const parts = [
    assessment.departmentCode ?? "All departments",
    assessment.semester ? `Semester ${assessment.semester}` : "all semesters",
    assessment.section ? `Section ${assessment.section}` : "all sections",
  ];
  return parts.join(" · ");
}

/**
 * The staff assessment list, shared by faculty and HOD — only `basePath`
 * differs, the same arrangement the student directory uses.
 */
export function AssessmentsIndex({
  assessments,
  basePath,
  intro,
}: {
  assessments: AssessmentSummary[];
  basePath: string;
  intro: string;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-indigo-950 sm:text-3xl">Assessments</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">{intro}</p>
        </div>
        <ButtonLink href={`${basePath}/new`}>New assessment</ButtonLink>
      </header>

      {assessments.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No assessments yet"
              description="Create one, add its questions, then publish it for the students in its audience."
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {assessments.map((assessment) => (
            <li key={assessment.id}>
              <Card as="section">
                <CardHeader
                  title={assessment.title}
                  description={describeAudience(assessment)}
                  eyebrow={assessmentKindLabel(assessment.kind)}
                  action={
                    <span
                      className={[
                        "rounded-md border px-2 py-1 text-xs font-medium",
                        assessment.isPublished
                          ? "border-success/30 bg-success/5 text-success"
                          : "border-indigo-100 bg-parchment-sunk text-ink-faint",
                      ].join(" ")}
                    >
                      {assessment.isPublished ? "Published" : "Draft"}
                    </span>
                  }
                />
                <CardBody>
                  <Link
                    href={`${basePath}/${assessment.id}`}
                    className="rounded text-sm font-medium text-indigo-700 hover:underline"
                  >
                    Open
                  </Link>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
