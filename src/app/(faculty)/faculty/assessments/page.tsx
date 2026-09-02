import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AssessmentsIndex } from "@/components/assessments/AssessmentsIndex";
import { getOwnStaff } from "@/lib/queries/faculty";
import { listAssessments } from "@/lib/queries/assessments";

export const metadata: Metadata = { title: "Assessments" };

export default async function FacultyAssessmentsPage() {
  const staff = await getOwnStaff();
  if (!staff) redirect("/login");

  const assessments = await listAssessments();

  return (
    <AssessmentsIndex
      assessments={assessments}
      basePath="/faculty/assessments"
      intro="Papers you have written, and any set for your department. Publish one to make it visible to the students in its audience."
    />
  );
}
