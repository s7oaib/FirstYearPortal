import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Horizon } from "@/lib/roadmap/generate";
import type { RoadmapSource, RoadmapStatus } from "@/config/roadmap";

/**
 * Roadmap reads (PRD 5.10).
 *
 * A student's own query returns only approved roadmaps — not because this
 * code filters, but because the RLS policy in migration 0016 does. That
 * distinction matters: the promise that no student sees unreviewed advice
 * survives a mistake in this file.
 */

export type Milestone = {
  id: string;
  horizon: Horizon;
  title: string;
  detail: string | null;
  rationale: string;
  position: number;
  completedAt: string | null;
};

export type Roadmap = {
  id: string;
  studentId: string;
  generatedBy: RoadmapSource;
  provider: string | null;
  model: string | null;
  inputsSummary: string | null;
  approvalStatus: RoadmapStatus;
  reviewedAt: string | null;
  mentorRemarks: string | null;
  createdAt: string;
  milestones: Milestone[];
};

const ROADMAP_COLUMNS =
  "id, student_id, generated_by, provider, model, inputs_summary, approval_status, reviewed_at, mentor_remarks, created_at" as const;

type RoadmapDbRow = {
  id: string;
  student_id: string;
  generated_by: RoadmapSource;
  provider: string | null;
  model: string | null;
  inputs_summary: string | null;
  approval_status: RoadmapStatus;
  reviewed_at: string | null;
  mentor_remarks: string | null;
  created_at: string;
};

async function attachMilestones(rows: RoadmapDbRow[]): Promise<Roadmap[]> {
  if (rows.length === 0) return [];

  const supabase = createClient();
  const { data } = await supabase
    .from("roadmap_milestones")
    .select("id, roadmap_id, horizon, title, detail, rationale, position, completed_at")
    .in(
      "roadmap_id",
      rows.map((r) => r.id),
    )
    .order("position", { ascending: true });

  const byRoadmap = new Map<string, Milestone[]>();
  for (const m of data ?? []) {
    byRoadmap.set(m.roadmap_id, [
      ...(byRoadmap.get(m.roadmap_id) ?? []),
      {
        id: m.id,
        horizon: m.horizon,
        title: m.title,
        detail: m.detail,
        rationale: m.rationale,
        position: m.position,
        completedAt: m.completed_at,
      },
    ]);
  }

  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_id,
    generatedBy: row.generated_by,
    provider: row.provider,
    model: row.model,
    inputsSummary: row.inputs_summary,
    approvalStatus: row.approval_status,
    reviewedAt: row.reviewed_at,
    mentorRemarks: row.mentor_remarks,
    createdAt: row.created_at,
    milestones: byRoadmap.get(row.id) ?? [],
  }));
}

/**
 * The signed-in student's roadmap.
 *
 * RLS returns approved rows only, so an unreviewed draft is simply not there.
 * Returning null means "nothing approved yet", which is what the page says.
 */
export async function getOwnRoadmap(): Promise<Roadmap | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("student_roadmaps")
    .select(ROADMAP_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(1);

  const roadmaps = await attachMilestones(data ?? []);
  return roadmaps[0] ?? null;
}

/** Every roadmap for one student, for a reviewer. Newest first. */
export async function getRoadmapsForStudent(
  studentId: string,
): Promise<Roadmap[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("student_roadmaps")
    .select(ROADMAP_COLUMNS)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(20);

  return attachMilestones(data ?? []);
}

export async function getRoadmap(id: string): Promise<Roadmap | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("student_roadmaps")
    .select(ROADMAP_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  const roadmaps = await attachMilestones([data]);
  return roadmaps[0] ?? null;
}

export type ReviewQueueEntry = Roadmap & {
  studentName: string;
  studentUsn: string;
};

/**
 * Roadmaps waiting for a mentor, oldest first.
 *
 * RLS narrows this to students the caller can see, so the query asks for
 * every pending roadmap and gets back only the ones they may review — the
 * same arrangement the achievement queue uses.
 */
export async function getReviewQueue(): Promise<ReviewQueueEntry[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("student_roadmaps")
    .select(ROADMAP_COLUMNS)
    .eq("approval_status", "pending_mentor_review")
    .order("created_at", { ascending: true })
    .limit(200);

  const roadmaps = await attachMilestones(data ?? []);
  if (roadmaps.length === 0) return [];

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, usn")
    .in("id", Array.from(new Set(roadmaps.map((r) => r.studentId))));

  const byId = new Map((students ?? []).map((s) => [s.id, s]));

  return roadmaps.map((roadmap) => ({
    ...roadmap,
    studentName: byId.get(roadmap.studentId)?.full_name ?? "Unknown student",
    studentUsn: byId.get(roadmap.studentId)?.usn ?? "—",
  }));
}

/** Count for the staff sidebar badge. */
export async function getPendingRoadmapCount(): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from("student_roadmaps")
    .select("id", { count: "exact", head: true })
    .eq("approval_status", "pending_mentor_review");
  return count ?? 0;
}

/** Progress over an approved roadmap, for the student's own view. */
export function roadmapProgress(roadmap: Roadmap): {
  done: number;
  total: number;
  percent: number;
} {
  const total = roadmap.milestones.length;
  const done = roadmap.milestones.filter((m) => m.completedAt !== null).length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}
