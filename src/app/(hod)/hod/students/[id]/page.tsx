import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { StudentProfile } from "@/components/directory/StudentProfile";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getStudentDetail } from "@/lib/queries/directory";
import { getAchievementsForStudent } from "@/lib/queries/achievements";
import { getRoadmapsForStudent } from "@/lib/queries/roadmaps";
import { RoadmapPanel } from "@/components/roadmap/RoadmapPanel";

export const metadata: Metadata = { title: "Student profile" };

export default async function HodStudentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const staff = await getOwnStaff();
  if (!staff) redirect("/account-blocked?reason=no-staff-record");

  const [detail, achievements, roadmaps] = await Promise.all([
    getStudentDetail(params.id),
    getAchievementsForStudent(params.id),
    getRoadmapsForStudent(params.id),
  ]);

  // RLS makes a student outside this department simply not exist for the
  // caller, so "no such student" and "not your department" are deliberately
  // indistinguishable here.
  if (!detail) notFound();

  return (
    <StudentProfile
      detail={detail}
      achievements={achievements}
      backHref="/hod/students"
      backLabel="Back to department students"
      canVerify
      mentorBadge={`${staff.departmentCode} department`}
      roadmapPanel={
        <RoadmapPanel studentId={params.id} roadmaps={roadmaps} />
      }
    />
  );
}
