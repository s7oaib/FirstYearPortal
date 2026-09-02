import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { StudentProfile } from "@/components/directory/StudentProfile";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getStudentDetail } from "@/lib/queries/directory";
import { getAchievementsForStudent } from "@/lib/queries/achievements";
import { getRoadmapsForStudent } from "@/lib/queries/roadmaps";
import { RoadmapPanel } from "@/components/roadmap/RoadmapPanel";

export const metadata: Metadata = { title: "Student profile" };

export default async function StudentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const staff = await getOwnStaff();
  if (!staff) redirect("/login");

  const [detail, achievements, roadmaps] = await Promise.all([
    getStudentDetail(params.id),
    getAchievementsForStudent(params.id),
    getRoadmapsForStudent(params.id),
  ]);

  // RLS makes an unauthorised student's row simply not exist for this caller,
  // so this covers both "no such student" and "not yours" — and deliberately
  // does not distinguish them, since the difference would itself leak whether
  // a given student exists.
  if (!detail) notFound();

  return (
    <StudentProfile
      detail={detail}
      achievements={achievements}
      backHref="/faculty/students"
      backLabel="Back to my students"
      canVerify
      mentorBadge="You mentor this student"
      roadmapPanel={
        <RoadmapPanel studentId={params.id} roadmaps={roadmaps} />
      }
    />
  );
}
