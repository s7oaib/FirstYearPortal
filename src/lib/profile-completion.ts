/**
 * Profile completion (PRD 5.2).
 *
 * Pure and dependency-free on purpose: this is the single source of truth
 * for "is this profile done", and it is called from a Server Action after
 * every section save, from the dashboard, and indirectly from middleware via
 * the stored `profile_completion_percent`. Keeping it pure is what makes it
 * cheap to unit-test the gate logic without a database.
 *
 * The percentage is stored rather than derived on read (ARCHITECTURE 5.1) —
 * so the write and the recompute must always happen in the same action.
 */

export type ProfileSectionKey =
  | "identity"
  | "academic"
  | "interests"
  | "goals"
  | "domains";

export type ProfileSnapshot = {
  /** Captured at registration; present for any student row that exists. */
  identity: {
    fullName?: string | null;
    usn?: string | null;
    departmentCode?: string | null;
    guardianName?: string | null;
    guardianPhone?: string | null;
    residenceType?: string | null;
  };
  academic: {
    tenthPercentage?: number | null;
    twelfthPercentage?: number | null;
    quota?: string | null;
    semester?: number | null;
    section?: string | null;
    admissionYear?: number | null;
  };
  interestIds: number[];
  goalIds: number[];
  domainIds: number[];
};

export type SectionStatus = {
  key: ProfileSectionKey;
  label: string;
  complete: boolean;
  /** Human-readable reason the section is not yet complete. */
  missing: string | null;
};

export const SECTION_LABELS: Record<ProfileSectionKey, string> = {
  identity: "Personal, guardian & residence details",
  academic: "Academic background",
  interests: "Areas of interest",
  goals: "Career goals",
  domains: "Technical domains",
};

/**
 * Sections that must all be complete before the student dashboard unlocks.
 * `identity` is included: it is filled during registration, so a student who
 * completes the other four is at 100%, but a partially-migrated or manually
 * created row still gets an accurate reading rather than a false pass.
 */
export const REQUIRED_SECTIONS: ProfileSectionKey[] = [
  "identity",
  "academic",
  "interests",
  "goals",
  "domains",
];

const MIN_SELECTIONS = 1;

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

export function evaluateSections(snapshot: ProfileSnapshot): SectionStatus[] {
  const identityFields = [
    snapshot.identity.fullName,
    snapshot.identity.usn,
    snapshot.identity.departmentCode,
    snapshot.identity.guardianName,
    snapshot.identity.guardianPhone,
    snapshot.identity.residenceType,
  ];
  const identityComplete = identityFields.every(isFilled);

  // Entrance rank is intentionally not required — a management-quota student
  // legitimately has none, and requiring it would make their profile
  // permanently incompletable.
  const academicFields = [
    snapshot.academic.tenthPercentage,
    snapshot.academic.twelfthPercentage,
    snapshot.academic.quota,
    snapshot.academic.semester,
    snapshot.academic.section,
    snapshot.academic.admissionYear,
  ];
  const academicComplete = academicFields.every(isFilled);

  return [
    {
      key: "identity",
      label: SECTION_LABELS.identity,
      complete: identityComplete,
      missing: identityComplete
        ? null
        : "Add your parent/guardian details, contact number, and residence type.",
    },
    {
      key: "academic",
      label: SECTION_LABELS.academic,
      complete: academicComplete,
      missing: academicComplete
        ? null
        : "Add your 10th and 12th percentages, quota, semester, section, and admission year.",
    },
    {
      key: "interests",
      label: SECTION_LABELS.interests,
      complete: snapshot.interestIds.length >= MIN_SELECTIONS,
      missing:
        snapshot.interestIds.length >= MIN_SELECTIONS
          ? null
          : "Select at least one area of interest.",
    },
    {
      key: "goals",
      label: SECTION_LABELS.goals,
      complete: snapshot.goalIds.length >= MIN_SELECTIONS,
      missing:
        snapshot.goalIds.length >= MIN_SELECTIONS
          ? null
          : "Select at least one career goal.",
    },
    {
      key: "domains",
      label: SECTION_LABELS.domains,
      complete: snapshot.domainIds.length >= MIN_SELECTIONS,
      missing:
        snapshot.domainIds.length >= MIN_SELECTIONS
          ? null
          : "Select at least one technical domain.",
    },
  ];
}

/**
 * Returns 0–100, rounded. Every required section carries equal weight, so
 * the number a student sees maps directly onto "how many boxes are left",
 * which is what makes the progress bar honest rather than motivational.
 */
export function computeCompletionPercent(snapshot: ProfileSnapshot): number {
  const sections = evaluateSections(snapshot);
  const required = sections.filter((s) => REQUIRED_SECTIONS.includes(s.key));
  if (required.length === 0) return 0;

  const done = required.filter((s) => s.complete).length;
  return Math.round((done / required.length) * 100);
}

/** The dashboard gate (PRD 5.2). */
export function isProfileComplete(snapshot: ProfileSnapshot): boolean {
  return computeCompletionPercent(snapshot) === 100;
}
