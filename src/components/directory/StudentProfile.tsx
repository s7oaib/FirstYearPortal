import Link from "next/link";
import type { ReactNode } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  ProgressBar,
  StatTile,
  Tag,
} from "@/components/ui/Card";
import { RESIDENCE_FIELD_LABEL, residenceLabel } from "@/config/residence";
import { categoryLabel, levelLabel } from "@/config/achievements";
import {
  EvidenceList,
  StatusPill,
} from "@/components/achievements/AchievementCard";
import { VerifyForm } from "@/components/achievements/VerifyForm";
import type { StudentDetail } from "@/lib/queries/directory";
import type { Achievement } from "@/lib/queries/achievements";

const QUOTA_LABELS: Record<string, string> = {
  cet: "KCET",
  comedk: "COMEDK",
  jee: "JEE / Central counselling",
  management: "Management quota",
  diploma_lateral: "Diploma lateral entry",
  other: "Other",
};

function TagList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-faint">Not set yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Tag key={item}>{item}</Tag>
      ))}
    </div>
  );
}

/**
 * One student's full authorised profile — everything the caller is entitled
 * to see about them, in one view (PRD 5.5).
 *
 * Shared by the faculty, HOD, and admin detail routes. Guardian contact is
 * already NULL from the database when the caller is not entitled to it (the
 * `student_directory` view masks the column), so this component renders what
 * it is given rather than deciding visibility itself — the decision belongs in
 * one place, and that place is the database.
 */
export function StudentProfile({
  detail,
  achievements,
  backHref,
  backLabel,
  canVerify,
  mentorBadge,
  roadmapPanel,
}: {
  detail: StudentDetail;
  achievements: Achievement[];
  backHref: string;
  backLabel: string;
  /** Whether to offer the verify/reject control on each achievement. */
  canVerify: boolean;
  /** Shown when the reader has guardian-level access to this student. */
  mentorBadge?: string;
  /**
   * Roadmap controls for this student. Passed in rather than rendered here
   * so a reader with no mentoring relationship to act on can leave it out.
   */
  roadmapPanel?: ReactNode;
}) {
  const { row, departmentName } = detail;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={backHref}
        className="inline-block rounded text-sm font-medium text-indigo-700 hover:underline"
      >
        ← {backLabel}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brass-600">{departmentName}</p>
          <h1 className="mt-1 text-2xl text-indigo-950 sm:text-3xl">
            {row.fullName}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {row.usn} · Semester {row.semester ?? "—"} · Section{" "}
            {row.section ?? "—"}
          </p>
        </div>
        {row.guardianVisible && mentorBadge && (
          <span className="rounded-md border border-brass-300/60 bg-brass-50 px-2.5 py-1 text-xs font-medium text-brass-700">
            {mentorBadge}
          </span>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="10th"
          value={row.tenthPercentage ? `${row.tenthPercentage}%` : "—"}
        />
        <StatTile
          label="12th / PUC"
          value={row.twelfthPercentage ? `${row.twelfthPercentage}%` : "—"}
        />
        <StatTile
          label="Quota"
          value={row.quota ? QUOTA_LABELS[row.quota] ?? row.quota : "—"}
          hint={row.entranceRank != null ? `Rank ${row.entranceRank}` : undefined}
        />
        <StatTile
          label={RESIDENCE_FIELD_LABEL}
          value={residenceLabel(row.residenceType)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card as="section">
            <CardHeader
              title="Interests, goals and domains"
              description="What this student told the portal about where they want to go."
            />
            <CardBody className="space-y-5">
              <div>
                <h3 className="mb-2 text-sm font-medium text-ink-muted">
                  Career goals
                </h3>
                <TagList items={detail.goals} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-ink-muted">
                  Technical domains
                </h3>
                <TagList items={detail.domains} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-ink-muted">
                  Areas of interest
                </h3>
                <TagList items={detail.interests} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-ink-muted">
                  Languages
                </h3>
                <TagList items={detail.languages} />
              </div>
            </CardBody>
          </Card>

          <Card as="section">
            <CardHeader
              title="Achievements"
              description={
                canVerify
                  ? "Everything this student has recorded. You can change a decision at any time."
                  : "Everything this student has recorded."
              }
            />
            <CardBody>
              {achievements.length === 0 ? (
                <p className="text-sm text-ink-faint">Nothing recorded yet.</p>
              ) : (
                <ul className="space-y-5">
                  {achievements.map((achievement) => (
                    <li
                      key={achievement.id}
                      className="border-b border-indigo-100 pb-5 last:border-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-indigo-950">
                          {achievement.title}
                        </h3>
                        <StatusPill status={achievement.status} />
                      </div>
                      <p className="mt-1 text-xs text-ink-faint">
                        {categoryLabel(achievement.category)} ·{" "}
                        {levelLabel(achievement.level)} level ·{" "}
                        {new Date(achievement.achievedOn).toLocaleDateString()}
                      </p>
                      {achievement.description && (
                        <p className="mt-2 text-sm text-ink-muted">
                          {achievement.description}
                        </p>
                      )}
                      <EvidenceList documents={achievement.documents} />
                      {canVerify && (
                        <VerifyForm
                          achievementId={achievement.id}
                          studentName={row.fullName}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {roadmapPanel}
        </div>

        <div className="space-y-6">
          <Card as="section">
            <CardBody>
              <ProgressBar
                value={row.completionPercent}
                label="Profile completion"
              />
            </CardBody>
          </Card>

          <Card as="section">
            <CardHeader title="Contact" />
            <CardBody className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-ink-faint">Email</p>
                <p className="break-all text-ink">{row.email}</p>
              </div>
              <div>
                <p className="text-xs text-ink-faint">Mobile</p>
                <p className="text-ink">{row.phone}</p>
              </div>
              <div>
                <p className="text-xs text-ink-faint">Home</p>
                <p className="text-ink">
                  {row.city}, {row.state}
                </p>
              </div>

              <div className="rule pt-3">
                <p className="text-xs text-ink-faint">Guardian</p>
                {row.guardianVisible ? (
                  <>
                    <p className="mt-1 text-ink">{row.guardianName}</p>
                    <p className="text-ink">{row.guardianPhone}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-ink-faint">
                    Hidden — visible only to this student&apos;s assigned mentor,
                    their head of department, and administrators.
                  </p>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
