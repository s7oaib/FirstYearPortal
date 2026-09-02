import Link from "next/link";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { eventKindLabel } from "@/config/events";
import type { EventSummary } from "@/lib/queries/events";

function audience(event: EventSummary): string {
  return [
    event.departmentCode ?? "All departments",
    event.semester ? `Semester ${event.semester}` : "all semesters",
    event.section ? `Section ${event.section}` : "all sections",
  ].join(" · ");
}

/**
 * The staff event list, shared by faculty and HOD — only `basePath` differs,
 * matching how the student directory and assessment list already work.
 *
 * Split into what is still to come and what has already happened, because
 * those are two different jobs: one is organising, the other is taking the
 * register and reading feedback.
 */
export function EventsIndex({
  events,
  basePath,
  intro,
}: {
  events: EventSummary[];
  basePath: string;
  intro: string;
}) {
  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.startsAt) > now);
  const past = events.filter((e) => new Date(e.startsAt) <= now);

  const row = (event: EventSummary) => (
    <li key={event.id}>
      <Card as="section">
        <CardHeader
          title={event.title}
          description={audience(event)}
          eyebrow={eventKindLabel(event.kind)}
          action={
            <span
              className={[
                "rounded-md border px-2 py-1 text-xs font-medium",
                event.isPublished
                  ? "border-success/30 bg-success/5 text-success"
                  : "border-indigo-100 bg-parchment-sunk text-ink-faint",
              ].join(" ")}
            >
              {event.isPublished ? "Published" : "Draft"}
            </span>
          }
        />
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {new Date(event.startsAt).toLocaleString()}
            {event.venue ? ` · ${event.venue}` : ""}
            {event.capacity === null
              ? " · no limit"
              : ` · ${event.capacity} places`}
          </p>
          <Link
            href={`${basePath}/${event.id}`}
            className="rounded text-sm font-medium text-indigo-700 hover:underline"
          >
            Open
          </Link>
        </CardBody>
      </Card>
    </li>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-indigo-950 sm:text-3xl">Events</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">{intro}</p>
        </div>
        <ButtonLink href={`${basePath}/new`}>New event</ButtonLink>
      </header>

      {events.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No events yet"
              description="Create one, then publish it so the students in its audience can register."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <section aria-labelledby="staff-upcoming" className="space-y-3">
            <h2 id="staff-upcoming" className="text-lg text-indigo-950">
              Coming up
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-3">{upcoming.map(row)}</ul>
            )}
          </section>

          {past.length > 0 && (
            <section aria-labelledby="staff-past" className="space-y-3">
              <h2 id="staff-past" className="text-lg text-indigo-950">
                Past events
              </h2>
              <ul className="space-y-3">{past.map(row)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
