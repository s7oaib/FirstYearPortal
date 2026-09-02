import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AssessmentForm } from "@/components/assessments/AssessmentForm";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getLookups } from "@/lib/queries/student";

export const metadata: Metadata = { title: "New assessment" };

export default async function NewHodAssessmentPage() {
  const staff = await getOwnStaff();
  if (!staff) redirect("/account-blocked?reason=no-staff-record");

  const { departments } = await getLookups();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/hod/assessments"
        className="inline-block rounded text-sm font-medium text-indigo-700 hover:underline"
      >
        &larr; Back to assessments
      </Link>

      <Card as="section">
        <CardHeader
          title="New assessment"
          description="Set it up first; you add the questions on the next screen, then publish."
        />
        <CardBody>
          <AssessmentForm departments={departments} />
        </CardBody>
      </Card>
    </div>
  );
}
