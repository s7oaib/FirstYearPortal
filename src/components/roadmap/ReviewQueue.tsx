import Link from "next/link";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/Card";
import { RoadmapView } from "./RoadmapView";
import { ReviewRoadmapForm } from "./RoadmapActions";
import type { ReviewQueueEntry } from "@/lib/queries/roadmaps";

/**
 * Roadmaps awaiting a mentor, shared by faculty and HOD.
 *
 * The whole plan is shown inline rather than behind a link. Approving a
 * document you have not read is the failure this queue exists to prevent, and
 * a one-line summary with an Approve button beside it invites exactly that.
 */
export function ReviewQueue({
  pending,
  studentBasePath,
}: {
  pending: ReviewQueueEntry[];
  /** Where a student's name links to for this role. */
  studentBasePath: string;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl text-indigo-950 sm:text-3xl">
          Roadmaps to review
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Nothing here has been seen by the student it belongs to. Approving it
          is what makes it visible to them, so read it first — including the
          reasons attached to each milestone.
        </p>
      </header>

      {pending.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="Nothing waiting"
              description="Generate a plan from a student's profile page and it appears here for review."
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-6">
          {pending.map((roadmap) => (
            <li key={roadmap.id}>
              <Card as="section">
                <CardHeader
                  title={roadmap.studentName}
                  description={`${roadmap.studentUsn} · ${roadmap.milestones.length} milestones · generated ${new Date(
                    roadmap.createdAt,
                  ).toLocaleDateString()}`}
                  eyebrow="Awaiting review"
                  action={
                    <Link
                      href={`${studentBasePath}/${roadmap.studentId}`}
                      className="rounded text-sm font-medium text-indigo-700 hover:underline"
                    >
                      Their profile
                    </Link>
                  }
                />
                <CardBody className="space-y-4">
                  <RoadmapView roadmap={roadmap} interactive={false} />
                  <ReviewRoadmapForm roadmapId={roadmap.id} />
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
