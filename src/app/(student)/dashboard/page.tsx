import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ProgressBar,
  StatTile,
  Tag,
} from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import {
  getLookups,
  getOwnStudent,
  getProfileSnapshot,
} from "@/lib/queries/student";
import { createClient } from "@/lib/supabase/server";
import {
  computeCompletionPercent,
  evaluateSections,
} from "@/lib/profile-completion";
import { RESIDENCE_FIELD_LABEL, residenceLabel } from "@/config/residence";
import {
  getOwnAchievements,
  summariseAchievements,
} from "@/lib/queries/achievements";

export const metadata: Metadata = { title: "Dashboard" };

const QUOTA_LABELS: Record<string, string> = {
  cet: "KCET",
  comedk: "COMEDK",
  jee: "JEE / Central counselling",
  management: "Management quota",
  diploma_lateral: "Diploma lateral entry",
  other: "Other",
};

function nameById(options: Array<{ id: number; name: string }>, ids: number[]) {
  const lookup = new Map(options.map((o) => [o.id, o.name]));
  return ids.map((id) => lookup.get(id)).filter(Boolean) as string[];
}

function formatGreetingName(fullName: string, usn: string): string {
  if (!fullName || fullName.toUpperCase() === usn.toUpperCase()) {
    return "Student";
  }
  return fullName.trim();
}

export default async function DashboardPage() {
  const student = await getOwnStudent();
  if (!student) redirect("/login");

  const supabase = createClient();
  const [snapshot, lookups, academicRow, achievements] = await Promise.all([
    getProfileSnapshot(student),
    getLookups(),
    supabase
      .from("student_academic_profiles")
      .select("*")
      .eq("student_id", student.id)
      .maybeSingle(),
    getOwnAchievements(student.id),
  ]);

  const achievementSummary = summariseAchievements(achievements);

  const percent = computeCompletionPercent(snapshot);
  const sections = evaluateSections(snapshot);
  const academic = academicRow.data;

  const interests = nameById(lookups.interests, snapshot.interestIds);
  const goals = nameById(lookups.goals, snapshot.goalIds);
  const domains = nameById(lookups.domains, snapshot.domainIds);

  const greetingName = formatGreetingName(student.fullName, student.usn);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-medium text-brass-600">
          {student.departmentName}
        </p>
        <h1 className="mt-1 text-2xl text-indigo-950 sm:text-3xl">
          Welcome back, {greetingName}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {student.usn} · Semester {academic?.semester ?? "—"} · Section{" "}
          {academic?.section ?? "—"}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="10th"
          value={academic?.tenth_percentage ? `${academic.tenth_percentage}%` : "—"}
        />
        <StatTile
          label="12th / PUC"
          value={
            academic?.twelfth_percentage ? `${academic.twelfth_percentage}%` : "—"
          }
        />
        <StatTile
          label="Quota"
          value={academic?.quota ? QUOTA_LABELS[academic.quota] : "—"}
          hint={
            academic?.entrance_rank != null
              ? `Rank ${academic.entrance_rank}`
              : undefined
          }
        />
        <StatTile
          label={RESIDENCE_FIELD_LABEL}
          value={residenceLabel(student.residenceType)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card as="section">
            <CardHeader
              title="Your profile"
              description="What the college and your mentor know about you."
              action={
                <ButtonLink href="/complete-profile" variant="secondary" size="sm">
                  Edit
                </ButtonLink>
              }
            />
            <CardBody className="space-y-5">
              <div>
                <h3 className="mb-2 text-sm font-medium text-ink-muted">
                  Career goals
                </h3>
                {goals.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {goals.map((goal) => (
                      <Tag key={goal}>{goal}</Tag>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-faint">Not set yet.</p>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-ink-muted">
                  Technical domains
                </h3>
                {domains.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {domains.map((domain) => (
                      <Tag key={domain}>{domain}</Tag>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-faint">Not set yet.</p>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-ink-muted">
                  Areas of interest
                </h3>
                {interests.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {interests.map((interest) => (
                      <Tag key={interest}>{interest}</Tag>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-faint">Not set yet.</p>
                )}
              </div>
            </CardBody>
          </Card>

          <Card as="section">
            <CardHeader
              title="Achievements"
              description="Sports, certifications, competitions — anything you have earned."
              action={
                <ButtonLink href="/achievements" variant="secondary" size="sm">
                  {achievementSummary.total > 0 ? "Manage" : "Add one"}
                </ButtonLink>
              }
            />
            <CardBody>
              {achievementSummary.total === 0 ? (
                <EmptyState
                  title="Nothing recorded yet"
                  description="Add your certificates and competition results so your mentor can verify them."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatTile
                    label="Verified"
                    value={String(achievementSummary.verified)}
                  />
                  <StatTile
                    label="Awaiting review"
                    value={String(achievementSummary.pending)}
                  />
                  <StatTile
                    label="Not verified"
                    value={String(achievementSummary.rejected)}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          <Card as="section">
            <CardHeader
              title="Your development roadmap"
              description="Generated from your profile and reviewed by your mentor before you see it as final."
            />
            <CardBody>
              <EmptyState
                title="Not available yet"
                description="The roadmap engine is part of a later phase of this portal. Your profile is already being stored in the shape it needs."
              />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card as="section">
            <CardBody>
              <ProgressBar
                value={percent}
                label="Profile completion"
                milestones={sections.map((section) => ({
                  label: section.label,
                  complete: section.complete,
                }))}
              />
            </CardBody>
          </Card>

          <Card as="section">
            <CardHeader title="Contact on file" />
            <CardBody className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-ink-faint">Email</p>
                <p className="break-all text-ink">{student.email}</p>
              </div>
              <div>
                <p className="text-xs text-ink-faint">Mobile</p>
                <p className="text-ink">{student.phone}</p>
              </div>
              <div>
                <p className="text-xs text-ink-faint">Home</p>
                <p className="text-ink">
                  {student.city}, {student.state}
                </p>
              </div>
              <div className="rule pt-3">
                <p className="text-xs text-ink-faint">
                  Guardian — visible only to you, your assigned mentor, and
                  administrators
                </p>
                <p className="mt-1 text-ink">{student.guardianName}</p>
                <p className="text-ink">{student.guardianPhone}</p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
