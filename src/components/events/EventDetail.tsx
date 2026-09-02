import Link from "next/link";
import { Card, CardBody, CardHeader, StatTile } from "@/components/ui/Card";
import { EventForm } from "./EventForm";
import { AttendanceForm } from "./AttendanceForm";
import { PublishEventToggle } from "./EventActions";
import { eventKindLabel, registrationLabel } from "@/config/events";
import { summariseRoster } from "@/lib/events/registration";
import type { EventSummary, RosterEntry } from "@/lib/queries/events";

/**
 * One event: who signed up, who turned up, and what they thought.
 *
 * The register only appears once the event has started. Marking attendance
 * for something that has not happened yet records a fact nobody could know,
 * and an accidental early save would show students as absent from an event
 * they were still planning to attend.
 */
export function EventDetail({
  event,
  roster,
  departments,
  basePath,
}: {
  event: EventSummary;
  roster: RosterEntry[];
  departments: Array<{ code: string; name: string }>;
  basePath: string;
}) {
  const summary = summariseRoster(roster);
  const hasStarted = new Date(event.startsAt) <= new Date();

  const feedback = roster.filter((r) => r.feedbackRating !== null);
  const averageRating =
    feedback.length === 0
      ? null
      : Math.round(
          (feedback.reduce((sum, r) => sum + (r.feedbackRating ?? 0), 0) /
            feedback.length) *
            10,
        ) / 10;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={basePath}
        className="inline-block rounded text-sm font-medium text-indigo-700 hover:underline"
      >
        ← Back to events
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brass-600">
            {eventKindLabel(event.kind)}
          </p>
          <h1 className="mt-1 text-2xl text-indigo-950 sm:text-3xl">
            {event.title}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {new Date(event.startsAt).toLocaleString()}
            {event.venue ? ` · ${event.venue}` : ""}
          </p>
        </div>
        <PublishEventToggle
          eventId={event.id}
          isPublished={event.isPublished}
        />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Registered"
          value={String(summary.registered)}
          hint={
            event.capacity === null
              ? "No limit"
              : `of ${event.capacity} places`
          }
        />
        <StatTile
          label="Waiting list"
          value={String(summary.waitlisted)}
          hint={event.allowWaitlist ? undefined : "Waiting list off"}
        />
        <StatTile
          label="Attended"
          value={
            summary.attendanceRate === null
              ? "—"
              : `${summary.attended} (${summary.attendanceRate}%)`
          }
        />
        <StatTile
          label="Feedback"
          value={averageRating === null ? "—" : `${averageRating} / 5`}
          hint={
            feedback.length === 0
              ? "None yet"
              : `${feedback.length} response${feedback.length === 1 ? "" : "s"}`
          }
        />
      </div>

      <Card as="section">
        <CardHeader
          title="Register"
          description={
            hasStarted
              ? "Tick everyone who turned up, then save. You can change it later."
              : "Available once the event has started."
          }
        />
        <CardBody>
          {hasStarted ? (
            <AttendanceForm eventId={event.id} roster={roster} />
          ) : (
            <p className="text-sm text-ink-faint">
              This event has not started yet, so there is nothing to record.
            </p>
          )}
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader
          title="Everyone signed up"
          description="Including the waiting list and anyone who has cancelled."
        />
        <CardBody className={roster.length === 0 ? undefined : "px-0 py-0"}>
          {roster.length === 0 ? (
            <p className="text-sm text-ink-faint">Nobody has registered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">
                  Everyone registered for {event.title}
                </caption>
                <thead>
                  <tr className="border-b border-indigo-100 text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th scope="col" className="px-5 py-3 font-medium">Student</th>
                    <th scope="col" className="px-3 py-3 font-medium">Status</th>
                    <th scope="col" className="px-3 py-3 font-medium">Attended</th>
                    <th scope="col" className="px-5 py-3 font-medium">Feedback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-100">
                  {roster.map((entry) => (
                    <tr key={entry.id} className="hover:bg-indigo-50/40">
                      <td className="px-5 py-3">
                        <p className="font-medium text-indigo-900">
                          {entry.studentName}
                        </p>
                        <p className="text-xs text-ink-faint">
                          {entry.studentUsn}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-ink-muted">
                        {registrationLabel(entry.status)}
                      </td>
                      <td className="px-3 py-3 text-ink-muted">
                        {entry.attended === null
                          ? "—"
                          : entry.attended
                            ? "Yes"
                            : "No"}
                      </td>
                      <td className="px-5 py-3 text-ink-muted">
                        {entry.feedbackRating === null ? (
                          "—"
                        ) : (
                          <>
                            <span className="tabular-nums">
                              {entry.feedbackRating}/5
                            </span>
                            {entry.feedbackComment && (
                              <span className="block text-xs text-ink-faint">
                                {entry.feedbackComment}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader
          title="Settings"
          description="Changing the audience changes who can see this from now on."
        />
        <CardBody>
          <EventForm departments={departments} event={event} />
        </CardBody>
      </Card>
    </div>
  );
}
