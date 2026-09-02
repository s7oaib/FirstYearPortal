/**
 * Resource recommendations (PRD 5.9).
 *
 * Pure and dependency-free, like the grading and registration modules, and
 * for a sharper reason than either: PRD 5.9 requires every recommendation to
 * show *why* it was made. That turns "why" from a UI string into a value this
 * function has to return, and something a test can hold it to.
 *
 * There is no scoring model, no weights fitted to anything, and no
 * personalisation beyond what the student themselves entered at registration.
 * A resource matches because the student said they were interested in that
 * subject, or chose that goal, or are in that department — each of which is a
 * fact the student can recognise and disagree with. Anything cleverer would
 * be harder to explain and no more honest.
 */

export type ResourceForMatching = {
  id: string;
  departmentCode: string | null;
  semester: number | null;
  interestIds: number[];
  goalIds: number[];
  domainIds: number[];
  isVerified: boolean;
};

export type StudentProfileForMatching = {
  departmentCode: string;
  semester: number | null;
  interestIds: number[];
  goalIds: number[];
  domainIds: number[];
};

/** A single, student-readable justification. */
export type MatchReason = {
  kind: "department" | "semester" | "interest" | "goal" | "domain";
  /** The lookup id behind it, so the caller can name it. */
  id: number | null;
};

export type Recommendation = {
  resourceId: string;
  /** Higher is a closer match. Only meaningful for ordering. */
  score: number;
  reasons: MatchReason[];
};

const WEIGHTS = {
  // A named goal is the strongest signal a first-year student gives: it is
  // the thing they said they are working towards, rather than a topic they
  // find interesting.
  goal: 4,
  domain: 3,
  interest: 2,
  department: 1,
  semester: 1,
} as const;

function overlap(a: number[], b: number[]): number[] {
  const set = new Set(b);
  return a.filter((id) => set.has(id));
}

/**
 * Matches one resource against one student.
 *
 * Returns null when nothing connects them. A resource with no tags and no
 * department is *not* recommended to everyone by default — an untagged entry
 * is one nobody has finished curating, and padding a student's list with it
 * would make the explanation "because it exists".
 */
export function matchResource(
  resource: ResourceForMatching,
  student: StudentProfileForMatching,
): Recommendation | null {
  const reasons: MatchReason[] = [];
  let score = 0;

  for (const id of overlap(resource.goalIds, student.goalIds)) {
    reasons.push({ kind: "goal", id });
    score += WEIGHTS.goal;
  }
  for (const id of overlap(resource.domainIds, student.domainIds)) {
    reasons.push({ kind: "domain", id });
    score += WEIGHTS.domain;
  }
  for (const id of overlap(resource.interestIds, student.interestIds)) {
    reasons.push({ kind: "interest", id });
    score += WEIGHTS.interest;
  }

  if (
    resource.departmentCode !== null &&
    resource.departmentCode === student.departmentCode
  ) {
    reasons.push({ kind: "department", id: null });
    score += WEIGHTS.department;
  }

  if (
    resource.semester !== null &&
    student.semester !== null &&
    resource.semester === student.semester
  ) {
    reasons.push({ kind: "semester", id: null });
    score += WEIGHTS.semester;
  }

  if (reasons.length === 0) return null;

  // A verified resource outranks an unverified one at the same relevance.
  // Deliberately a tie-break rather than a filter: a faculty member's
  // unchecked suggestion should still reach the student, just below the
  // things somebody has confirmed.
  if (resource.isVerified) score += 0.5;

  return { resourceId: resource.id, score, reasons };
}

/**
 * Ranks the catalogue for one student, best match first.
 *
 * Ties break on resource id rather than falling back to insertion order, so
 * the same student sees the same list twice — a recommendation list that
 * reshuffles between page loads reads as arbitrary, which undermines the
 * explanation attached to it.
 */
export function recommendResources(
  resources: ResourceForMatching[],
  student: StudentProfileForMatching,
  limit = 20,
): Recommendation[] {
  return resources
    .map((resource) => matchResource(resource, student))
    .filter((match): match is Recommendation => match !== null)
    .sort(
      (a, b) => b.score - a.score || a.resourceId.localeCompare(b.resourceId),
    )
    .slice(0, limit);
}

/**
 * Turns reasons into the sentence a student reads.
 *
 * `nameOf` resolves a lookup id to its label; when it cannot, that reason is
 * dropped rather than rendered as "#7". A recommendation that cannot explain
 * itself in words is not one worth showing the explanation for.
 */
export function explain(
  reasons: MatchReason[],
  nameOf: (kind: "interest" | "goal" | "domain", id: number) => string | null,
): string[] {
  const parts: string[] = [];

  for (const reason of reasons) {
    if (reason.kind === "department") {
      parts.push("Matches your department");
      continue;
    }
    if (reason.kind === "semester") {
      parts.push("Set for your semester");
      continue;
    }

    if (reason.id === null) continue;
    const name = nameOf(reason.kind, reason.id);
    if (!name) continue;

    parts.push(
      reason.kind === "goal"
        ? `Supports your goal: ${name}`
        : reason.kind === "domain"
          ? `In a domain you chose: ${name}`
          : `Matches an interest: ${name}`,
    );
  }

  return parts;
}
