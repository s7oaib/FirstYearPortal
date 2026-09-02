import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EventForm } from "@/components/events/EventForm";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getLookups } from "@/lib/queries/student";

export const metadata: Metadata = { title: "New event" };

export default async function NewHodEventPage() {
  const staff = await getOwnStaff();
  if (!staff) redirect("/account-blocked?reason=no-staff-record");

  const { departments } = await getLookups();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/hod/events"
        className="inline-block rounded text-sm font-medium text-indigo-700 hover:underline"
      >
        &larr; Back to events
      </Link>

      <Card as="section">
        <CardHeader
          title="New event"
          description="Set it up, then publish it so students in its audience can register."
        />
        <CardBody>
          <EventForm departments={departments} />
        </CardBody>
      </Card>
    </div>
  );
}
