import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { GenerateRoadmapButton } from "./RoadmapActions";
import { roadmapStatusLabel } from "@/config/roadmap";
import type { Roadmap } from "@/lib/queries/roadmaps";

/**
 * Roadmap controls on a student's profile, for a mentor.
 *
 * Shows the history rather than only the current plan, because "superseded"
 * is a meaningful state: it says a plan was replaced, not that it never
 * existed, and a mentor asking "what did we agree in March?" should be able
 * to find out.
 */
export function RoadmapPanel({
  studentId,
  roadmaps,
}: {
  studentId: string;
  roadmaps: Roadmap[];
}) {
  const current = roadmaps.find(
    (r) =>
      r.approvalStatus === "approved" ||
      r.approvalStatus === "pending_mentor_review",
  );
  const history = roadmaps.filter((r) => r.id !== current?.id);

  return (
    <Card as="section">
      <CardHeader
        title="Development roadmap"
        description="Generated from this student's profile. Nothing reaches them until you approve it."
      />
      <CardBody className="space-y-4">
        {current ? (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
            <p className="text-sm font-medium text-indigo-900">
              {roadmapStatusLabel(current.approvalStatus)}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {current.milestones.length} milestones · generated{" "}
              {new Date(current.createdAt).toLocaleDateString()}
            </p>
            {current.approvalStatus === "pending_mentor_review" && (
              <p className="mt-1.5 text-xs text-warning">
                Waiting for review — the student cannot see it yet.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            No plan yet. Generating one builds it from this student&apos;s
            department, goals, domains, interests, and recorded marks.
          </p>
        )}

        <GenerateRoadmapButton
          studentId={studentId}
          hasExisting={Boolean(current)}
        />

        {history.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-indigo-900">
              Earlier plans ({history.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {history.map((roadmap) => (
                <li key={roadmap.id} className="text-xs text-ink-muted">
                  {new Date(roadmap.createdAt).toLocaleDateString()} —{" "}
                  {roadmapStatusLabel(roadmap.approvalStatus)},{" "}
                  {roadmap.milestones.length} milestones
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardBody>
    </Card>
  );
}
