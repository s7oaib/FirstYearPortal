import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AttemptMarking } from "@/components/assessments/AttemptMarking";
import { getOwnStaff } from "@/lib/queries/faculty";
import {
  getAnswers,
  getAssessment,
  getAttempt,
  getAttemptsForAssessment,
  getAuthoredQuestions,
} from "@/lib/queries/assessments";

export const metadata: Metadata = { title: "Mark attempt" };

export default async function HodMarkAttemptPage({
  params,
}: {
  params: { attemptId: string };
}) {
  const staff = await getOwnStaff();
  if (!staff) redirect("/account-blocked?reason=no-staff-record");

  const attempt = await getAttempt(params.attemptId);
  if (!attempt) notFound();

  const assessment = await getAssessment(attempt.assessmentId);
  if (!assessment) notFound();

  const [questions, answers, roster] = await Promise.all([
    getAuthoredQuestions(assessment.id),
    getAnswers(attempt.id),
    getAttemptsForAssessment(assessment.id),
  ]);

  const row = roster.find((r) => r.id === attempt.id);

  return (
    <AttemptMarking
      assessment={assessment}
      attempt={attempt}
      questions={questions}
      answers={answers}
      studentName={row?.studentName ?? "Student"}
      studentUsn={row?.studentUsn ?? "\u2014"}
      backHref={`/hod/assessments/${assessment.id}`}
    />
  );
}
