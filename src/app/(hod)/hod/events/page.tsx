import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EventsIndex } from "@/components/events/EventsIndex";
import { getOwnStaff } from "@/lib/queries/faculty";
import { listEvents } from "@/lib/queries/events";

export const metadata: Metadata = { title: "Events" };

export default async function HodEventsPage() {
  const staff = await getOwnStaff();
  if (!staff) redirect("/account-blocked?reason=no-staff-record");

  const events = await listEvents();

  return (
    <EventsIndex
      events={events}
      basePath="/hod/events"
      intro="Events you have organised, and any run for your department. Publish one to open registration."
    />
  );
}
