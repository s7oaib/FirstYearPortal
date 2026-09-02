import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardBody, EmptyState, ProgressBar } from "@/components/ui/Card";
import { RoadmapView } from "@/components/roadmap/RoadmapView";
import { getOwnStudent } from "@/lib/queries/student";
import { getOwnRoadmap, roadmapProgress } from "@/lib/queries/roadmaps";
import { ROADMAP_REVIEW_NOTICE } from "@/config/roadmap";

export const metadata: Metadata = { title: "My roadmap" };

export default async function StudentRoadmapPage() {
  const student = await getOwnStudent();
  if (!student) redirect("/login");

  // RLS returns approved roadmaps only, so a draft or one awaiting review is
  // simply not here. "Nothing yet" therefore covers both "never generated"
  // and "generated but not yet reviewed" — which is correct, because from the
  // student's side those are the same thing.
  const roadmap = await getOwnRoadmap();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl text-indigo-950 sm:text-3xl">My roadmap</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          A development plan built from what you told the portal about
          yourself, at three horizons.
        </p>
      </header>

      {!roadmap ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No plan yet"
              description="Your mentor generates this and reviews it before you see it. If your profile is complete and you have not heard anything, ask them."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <p className="rounded-lg border border-brass-300/60 bg-brass-50 px-3.5 py-2.5 text-sm text-brass-800">
            {ROADMAP_REVIEW_NOTICE}
          </p>

          <Card as="section">
            <CardBody>
              <ProgressBar
                value={roadmapProgress(roadmap).percent}
                label="Milestones completed"
                milestones={[
                  {
                    label: `${roadmapProgress(roadmap).done} of ${
                      roadmapProgress(roadmap).total
                    } done`,
                    complete: roadmapProgress(roadmap).done > 0,
                  },
                ]}
              />
            </CardBody>
          </Card>

          <RoadmapView roadmap={roadmap} interactive />
        </>
      )}
    </div>
  );
}
