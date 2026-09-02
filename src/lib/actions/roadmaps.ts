"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getOwnStudent } from "@/lib/queries/student";
import { generateWithFallback } from "@/lib/roadmap/provider";
import type { RoadmapInput } from "@/lib/roadmap/generate";
import { fieldErrorsFrom, type ActionState } from "./form-state";

/**
 * Roadmap mutations (PRD 5.10).
 *
 * Generation is a staff action, not a student one. A student cannot conjure
 * themselves a plan and mark it approved — the review is the point of the
 * feature, and the database enforces it too.
 */

/** Gathers what the generator is allowed to see about one student. */
async function collectInput(studentId: string): Promise<RoadmapInput | null> {
  const supabase = createClient();

  const { data: student } = await supabase
    .from("student_directory")
    .select("id, department_code, semester, tenth_percentage, twelfth_percentage")
    .eq("id", studentId)
    .maybeSingle();

  if (!student) return null;

  // Deliberately narrow. Guardian contact, phone, address, and date of birth
  // are all readable here and none of them belong in a development plan —
  // ARCHITECTURE 6.3 asks for the minimum necessary fields, and this is the
  // place that decision gets made.
  const [goals, domains, interests, department, achievements] = await Promise.all([
    supabase.from("student_goals").select("goal_id").eq("student_id", studentId),
    supabase.from("student_domains").select("domain_id").eq("student_id", studentId),
    supabase.from("student_interests").select("interest_id").eq("student_id", studentId),
    supabase.from("departments").select("name").eq("code", student.department_code).maybeSingle(),
    supabase
      .from("achievements")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("verification_status", "verified"),
  ]);

  const [goalNames, domainNames, interestNames] = await Promise.all([
    supabase.from("career_goals").select("id, name"),
    supabase.from("technical_domains").select("id, name"),
    supabase.from("interests").select("id, name"),
  ]);

  const resolve = (
    options: Array<{ id: number; name: string }> | null,
    ids: number[],
  ) => {
    const map = new Map((options ?? []).map((o) => [o.id, o.name]));
    return ids.map((id) => map.get(id)).filter(Boolean) as string[];
  };

  return {
    departmentName: department.data?.name ?? student.department_code,
    semester: student.semester,
    goals: resolve(goalNames.data, (goals.data ?? []).map((r) => r.goal_id)),
    domains: resolve(domainNames.data, (domains.data ?? []).map((r) => r.domain_id)),
    interests: resolve(interestNames.data, (interests.data ?? []).map((r) => r.interest_id)),
    tenthPercentage: student.tenth_percentage,
    twelfthPercentage: student.twelfth_percentage,
    verifiedAchievements: achievements.count ?? 0,
  };
}

const generateSchema = z.object({
  studentId: z.string().uuid("Unknown student."),
});

/**
 * Generates a roadmap and puts it in the review queue.
 *
 * Any previously pending or approved roadmap for the student is marked
 * 'superseded' rather than edited, so whatever a mentor approved stays
 * exactly as they approved it.
 */
export async function generateRoadmapForStudent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const parsed = generateSchema.safeParse({
    studentId: formData.get("studentId"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Unknown student.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const input = await collectInput(parsed.data.studentId);
  if (!input) {
    // RLS makes a student outside the caller's scope simply not exist, so
    // this covers "no such student" and "not yours" without distinguishing
    // them — the same reasoning as the directory.
    return { status: "error", message: "That student is not available to you." };
  }

  const { roadmap, generator } = await generateWithFallback(input);
  const supabase = createClient();

  await supabase
    .from("student_roadmaps")
    .update({ approval_status: "superseded" })
    .eq("student_id", parsed.data.studentId)
    .in("approval_status", ["draft", "pending_mentor_review", "approved"]);

  const { data: created, error } = await supabase
    .from("student_roadmaps")
    .insert({
      student_id: parsed.data.studentId,
      generated_by: generator.source,
      provider: generator.provider,
      model: generator.model,
      inputs_summary: roadmap.inputsSummary,
      approval_status: "pending_mentor_review",
    })
    .select("id")
    .single();

  if (error || !created) {
    return { status: "error", message: "Could not generate that roadmap." };
  }

  const { error: milestoneError } = await supabase
    .from("roadmap_milestones")
    .insert(
      roadmap.milestones.map((m, index) => ({
        roadmap_id: created.id,
        horizon: m.horizon,
        title: m.title,
        detail: m.detail,
        rationale: m.rationale,
        position: index,
      })),
    );

  if (milestoneError) {
    // A roadmap with no milestones is not a roadmap. Remove the shell rather
    // than leave an empty plan in the review queue.
    await supabase.from("student_roadmaps").delete().eq("id", created.id);
    return { status: "error", message: "Could not save the milestones." };
  }

  revalidatePath("/faculty/roadmaps");
  revalidatePath("/hod/roadmaps");

  return {
    status: "success",
    message: `Draft ready with ${roadmap.milestones.length} milestones. Review it before the student sees anything.`,
  };
}

const reviewSchema = z.object({
  roadmapId: z.string().uuid("Unknown roadmap."),
  decision: z.enum(["approved", "rejected"], {
    errorMap: () => ({ message: "Approve it or send it back." }),
  }),
  remarks: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(2000).nullable(),
  ),
});

export async function reviewRoadmap(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await getOwnStaff();
  if (!staff) {
    return { status: "error", message: "Teaching staff access required." };
  }

  const parsed = reviewSchema.safeParse({
    roadmapId: formData.get("roadmapId"),
    decision: formData.get("decision"),
    remarks: formData.get("remarks"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  // Sending a plan back without saying why leaves nobody able to act on it —
  // the same rule the achievement queue applies to a rejection.
  if (parsed.data.decision === "rejected" && !parsed.data.remarks) {
    return {
      status: "error",
      message: "Say what needs changing before sending it back.",
      fieldErrors: { remarks: "A remark is required when sending a plan back." },
    };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("student_roadmaps")
    .update({
      approval_status: parsed.data.decision,
      reviewed_by: staff.id,
      reviewed_at: new Date().toISOString(),
      mentor_remarks: parsed.data.remarks,
    })
    .eq("id", parsed.data.roadmapId);

  if (error) {
    return { status: "error", message: "Could not record that decision." };
  }

  revalidatePath("/faculty/roadmaps");
  revalidatePath("/hod/roadmaps");

  return {
    status: "success",
    message:
      parsed.data.decision === "approved"
        ? "Approved — the student can see it now."
        : "Sent back. The student still sees nothing.",
  };
}

export async function toggleMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const student = await getOwnStudent();
  if (!student) {
    return { status: "error", message: "Student access required." };
  }

  const milestoneId = String(formData.get("milestoneId") ?? "");
  const done = formData.get("done") === "true";
  if (!milestoneId) return { status: "error", message: "Unknown milestone." };

  const supabase = createClient();
  const { error } = await supabase
    .from("roadmap_milestones")
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq("id", milestoneId);

  if (error) {
    return { status: "error", message: "Could not update that milestone." };
  }

  revalidatePath("/roadmap");
  return {
    status: "success",
    message: done ? "Marked done." : "Marked not done.",
  };
}

/** Lets a student ask their mentor for a plan when they have none. */
export async function requestRoadmap(): Promise<ActionState> {
  const student = await getOwnStudent();
  if (!student) {
    return { status: "error", message: "Student access required." };
  }

  // Deliberately does not create anything. A student cannot generate their
  // own plan — that would put an unreviewed document in front of them, which
  // is the one thing PRD 5.10 rules out. This exists so the empty state can
  // tell them what to do next.
  return {
    status: "success",
    message:
      "Ask your mentor to generate your roadmap. They review it before you see it.",
  };
}
