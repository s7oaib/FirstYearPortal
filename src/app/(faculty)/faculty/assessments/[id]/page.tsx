import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AssessmentDetail } from "@/components/assessments/AssessmentDetail";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getLookups } from "@/lib/queries/student";
import {
  getAssessment,
  getAttemptsForAssessment,
  getAuthoredQuestions,
} from "@/lib/queries/assessments";

export const metadata: Metadata = { title: "Assessment" };

export default async function FacultyAssessmentPage({
  params,
}: {
  params: { id: string };
}) {
  const staff = await getOwnStaff();
  if (!staff) redirect("/login");

  const assessment = await getAssessment(params.id);
  if (!assessment) notFound();

  const [questions, attempts, { departments }] = await Promise.all([
    getAuthoredQuestions(assessment.id),
    getAttemptsForAssessment(assessment.id),
    getLookups(),
  ]);

  return (
    <AssessmentDetail
      assessment={assessment}
      questions={questions}
      attempts={attempts}
      departments={departments}
      basePath="/faculty/assessments"
    />
  );
}
