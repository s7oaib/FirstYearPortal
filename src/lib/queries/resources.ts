import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getOwnStudent } from "./student";
import {
  explain,
  recommendResources,
  type ResourceForMatching,
} from "@/lib/resources/recommend";
import type { ResourceKind } from "@/config/resources";

/**
 * Resource catalogue reads (PRD 5.9).
 *
 * The catalogue itself is readable by any signed-in user — including entries
 * nobody has verified, which travel with their flag so they can be shown
 * *and* labelled. Hiding them would leave a student unable to see something a
 * faculty member deliberately suggested; showing them unlabelled would be the
 * fabricated-metadata problem PRD 5.9 exists to prevent.
 */

export type Resource = {
  id: string;
  title: string;
  description: string | null;
  kind: ResourceKind;
  provider: string | null;
  url: string;
  departmentCode: string | null;
  semester: number | null;
  estimatedHours: number | null;
  isFree: boolean | null;
  isVerified: boolean;
  interestIds: number[];
  goalIds: number[];
  domainIds: number[];
};

const RESOURCE_COLUMNS =
  "id, title, description, kind, provider, url, department_code, semester, estimated_hours, is_free, is_verified" as const;

/** The active catalogue, with its tags attached. */
export async function listResources(): Promise<Resource[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("resources")
    .select(RESOURCE_COLUMNS)
    .order("is_verified", { ascending: false })
    .order("title", { ascending: true })
    .limit(500);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [interests, goals, domains] = await Promise.all([
    supabase.from("resource_interests").select("resource_id, interest_id").in("resource_id", ids),
    supabase.from("resource_goals").select("resource_id, goal_id").in("resource_id", ids),
    supabase.from("resource_domains").select("resource_id, domain_id").in("resource_id", ids),
  ]);

  const group = <T extends { resource_id: string }>(
    list: T[] | null,
    pick: (row: T) => number,
  ) => {
    const map = new Map<string, number[]>();
    for (const row of list ?? []) {
      map.set(row.resource_id, [...(map.get(row.resource_id) ?? []), pick(row)]);
    }
    return map;
  };

  const byInterest = group(interests.data, (r) => r.interest_id);
  const byGoal = group(goals.data, (r) => r.goal_id);
  const byDomain = group(domains.data, (r) => r.domain_id);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    provider: row.provider,
    url: row.url,
    departmentCode: row.department_code,
    semester: row.semester,
    estimatedHours: row.estimated_hours,
    isFree: row.is_free,
    isVerified: row.is_verified,
    interestIds: byInterest.get(row.id) ?? [],
    goalIds: byGoal.get(row.id) ?? [],
    domainIds: byDomain.get(row.id) ?? [],
  }));
}

export type RecommendedResource = {
  resource: Resource;
  reasons: string[];
};

/**
 * The catalogue ranked for the signed-in student, each entry carrying the
 * sentences explaining why it appeared (PRD 5.9).
 *
 * Returns an empty list rather than falling back to "here is everything" when
 * nothing matches — a recommendation with no reason behind it is precisely
 * what the explainability requirement rules out. The page shows the full
 * catalogue separately, clearly labelled as such.
 */
export async function getRecommendations(
  limit = 12,
): Promise<RecommendedResource[]> {
  const student = await getOwnStudent();
  if (!student) return [];

  const supabase = createClient();

  const [resources, interests, goals, domains, academic, lookups] =
    await Promise.all([
      listResources(),
      supabase.from("student_interests").select("interest_id").eq("student_id", student.id),
      supabase.from("student_goals").select("goal_id").eq("student_id", student.id),
      supabase.from("student_domains").select("domain_id").eq("student_id", student.id),
      supabase
        .from("student_academic_profiles")
        .select("semester")
        .eq("student_id", student.id)
        .maybeSingle(),
      Promise.all([
        supabase.from("interests").select("id, name"),
        supabase.from("career_goals").select("id, name"),
        supabase.from("technical_domains").select("id, name"),
      ]),
    ]);

  const [interestOpts, goalOpts, domainOpts] = lookups;
  const nameMaps = {
    interest: new Map((interestOpts.data ?? []).map((o) => [o.id, o.name])),
    goal: new Map((goalOpts.data ?? []).map((o) => [o.id, o.name])),
    domain: new Map((domainOpts.data ?? []).map((o) => [o.id, o.name])),
  };

  const forMatching: ResourceForMatching[] = resources.map((r) => ({
    id: r.id,
    departmentCode: r.departmentCode,
    semester: r.semester,
    interestIds: r.interestIds,
    goalIds: r.goalIds,
    domainIds: r.domainIds,
    isVerified: r.isVerified,
  }));

  const ranked = recommendResources(
    forMatching,
    {
      departmentCode: student.departmentCode,
      semester: academic.data?.semester ?? null,
      interestIds: (interests.data ?? []).map((r) => r.interest_id),
      goalIds: (goals.data ?? []).map((r) => r.goal_id),
      domainIds: (domains.data ?? []).map((r) => r.domain_id),
    },
    limit,
  );

  const byId = new Map(resources.map((r) => [r.id, r]));

  return ranked
    .map((match) => {
      const resource = byId.get(match.resourceId);
      if (!resource) return null;
      return {
        resource,
        reasons: explain(
          match.reasons,
          (kind, id) => nameMaps[kind].get(id) ?? null,
        ),
      };
    })
    .filter((r): r is RecommendedResource => r !== null);
}

/** Resource ids the signed-in student has saved. */
export async function getSavedResourceIds(): Promise<Set<string>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("student_resources")
    .select("resource_id");
  return new Set((data ?? []).map((r) => r.resource_id));
}

/** Count for the admin badge: entries nobody has checked yet. */
export async function getUnverifiedResourceCount(): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from("resources")
    .select("id", { count: "exact", head: true })
    .eq("is_verified", false)
    .eq("is_active", true);
  return count ?? 0;
}
