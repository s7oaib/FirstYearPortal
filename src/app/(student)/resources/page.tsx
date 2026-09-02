import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardBody, EmptyState } from "@/components/ui/Card";
import { ResourceCard } from "@/components/resources/ResourceCard";
import { getOwnStudent } from "@/lib/queries/student";
import {
  getRecommendations,
  getSavedResourceIds,
  listResources,
} from "@/lib/queries/resources";

export const metadata: Metadata = { title: "Resources" };

export default async function StudentResourcesPage() {
  const student = await getOwnStudent();
  if (!student) redirect("/login");

  const [recommended, all, saved] = await Promise.all([
    getRecommendations(),
    listResources(),
    getSavedResourceIds(),
  ]);

  const recommendedIds = new Set(recommended.map((r) => r.resource.id));
  const rest = all.filter((r) => !recommendedIds.has(r.id));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl text-indigo-950 sm:text-3xl">Resources</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Syllabus documents, courses, and certifications your department has
          collected. Anything an administrator has not opened and confirmed is
          marked as unchecked.
        </p>
      </header>

      {all.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="The catalogue is empty"
              description="Nothing has been added yet. Faculty and administrators build this list, and every entry is a link somebody chose deliberately."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <section aria-labelledby="recommended-heading" className="space-y-3">
            <h2 id="recommended-heading" className="text-lg text-indigo-950">
              Suggested for you
            </h2>

            {recommended.length === 0 ? (
              <Card>
                <CardBody>
                  {/* No fallback to "here is everything": a suggestion with no
                      reason behind it is exactly what the explainability rule
                      in PRD 5.9 rules out. */}
                  <p className="text-sm text-ink-muted">
                    Nothing in the catalogue matches your interests, goals, or
                    domains yet. Adding more of them to your profile will
                    improve this, and everything available is listed below in
                    the meantime.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <ul className="space-y-3">
                {recommended.map(({ resource, reasons }) => (
                  <li key={resource.id}>
                    <ResourceCard
                      resource={resource}
                      reasons={reasons}
                      saved={saved.has(resource.id)}
                      canSave
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {rest.length > 0 && (
            <section aria-labelledby="all-heading" className="space-y-3">
              <h2 id="all-heading" className="text-lg text-indigo-950">
                Everything else in the catalogue
              </h2>
              <p className="text-sm text-ink-muted">
                Not matched to your profile — browse if you want to.
              </p>
              <ul className="space-y-3">
                {rest.map((resource) => (
                  <li key={resource.id}>
                    <ResourceCard
                      resource={resource}
                      saved={saved.has(resource.id)}
                      canSave
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
