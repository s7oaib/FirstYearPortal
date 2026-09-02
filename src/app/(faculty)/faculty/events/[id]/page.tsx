import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EventDetail } from "@/components/events/EventDetail";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getLookups } from "@/lib/queries/student";
import { getEvent, getRoster } from "@/lib/queries/events";

export const metadata: Metadata = { title: "Event" };

export default async function FacultyEventPage({
  params,
}: {
  params: { id: string };
}) {
  const staff = await getOwnStaff();
  if (!staff) redirect("/login");

  const event = await getEvent(params.id);
  if (!event) notFound();

  const [roster, { departments }] = await Promise.all([
    getRoster(event.id),
    getLookups(),
  ]);

  return (
    <EventDetail
      event={event}
      roster={roster}
      departments={departments}
      basePath="/faculty/events"
    />
  );
}
