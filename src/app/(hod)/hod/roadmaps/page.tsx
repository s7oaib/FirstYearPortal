import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReviewQueue } from "@/components/roadmap/ReviewQueue";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getReviewQueue } from "@/lib/queries/roadmaps";

export const metadata: Metadata = { title: "Roadmaps to review" };

export default async function HodRoadmapsPage() {
  const staff = await getOwnStaff();
  if (!staff) redirect("/account-blocked?reason=no-staff-record");

  const pending = await getReviewQueue();

  return (
    <ReviewQueue pending={pending} studentBasePath="/hod/students" />
  );
}
