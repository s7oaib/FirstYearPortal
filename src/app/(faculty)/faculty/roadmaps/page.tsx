import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/roadmap/ReviewQueue";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getReviewQueue } from "@/lib/queries/roadmaps";

export const metadata: Metadata = { title: "Roadmaps to review" };

export default async function FacultyRoadmapsPage() {
  const staff = await getOwnStaff();
  if (!staff) redirect("/login");

  const pending = await getReviewQueue();

  return (
    <ReviewQueue pending={pending} studentBasePath="/faculty/students" />
  );
}
