import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/Card";
import {
  CancelButton,
  FeedbackForm,
  RegisterButton,
} from "@/components/events/EventActions";
import { getOwnStudent } from "@/lib/queries/student";
import { getStudentEvents } from "@/lib/queries/events";
import { eventKindLabel, registrationLabel } from "@/config/events";
import {
  REGISTRATION_BLOCKED_COPY,
  seatsRemaining,
} from "@/lib/events/registration";

export const metadata: Metadata = { title: "Events" };

function when(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!endsAt) return `${date}, ${time}`;
  const end = new Date(endsAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}, ${time}–${end}`;
}

export default async function StudentEventsPage() {
  const student = await getOwnStudent();
  if (!student) redirect("/login");

  const items = await getStudentEvents();
  const now = new Date();
  const upcoming = items.filter((i) => new Date(i.event.startsAt) > now);
  const past = items.filter((i) => new Date(i.event.startsAt) <= now);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl text-indigo-950 sm:text-3xl">Events</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Workshops, seminars, and drives open to your department, semester, and
          section.
        </p>
      </header>

      {items.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="Nothing scheduled yet"
              description="When a faculty member publishes an event for your class, it appears here."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <section aria-labelledby="upcoming-heading" className="space-y-3">
            <h2 id="upcoming-heading" className="text-lg text-indigo-950">
              Coming up
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing coming up.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map(({ event, registration, seatsTaken, outcome }) => {
                  const left = seatsRemaining(event.capacity, seatsTaken);

                  return (
                    <li key={event.id}>
                      <Card as="section">
                        <CardHeader
                          title={event.title}
                          description={event.description ?? undefined}
                          eyebrow={eventKindLabel(event.kind)}
                        />
                        <CardBody className="space-y-3">
                          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-faint">
                            <div>
                              <dt className="inline">When: </dt>
                              <dd className="inline text-ink-muted">
                                {when(event.startsAt, event.endsAt)}
                              </dd>
                            </div>
                            {event.venue && (
                              <div>
                                <dt className="inline">Where: </dt>
                                <dd className="inline text-ink-muted">
                                  {event.venue}
                                </dd>
                              </div>
                            )}
                            <div>
                              <dt className="inline">Places: </dt>
                              <dd className="inline text-ink-muted">
                                {left === null
                                  ? "No limit"
                                  : `${left} of ${event.capacity} left`}
                              </dd>
                            </div>
                          </dl>

                          {registration &&
                            registration.status !== "cancelled" && (
                              <p className="rounded-lg border border-success/25 bg-success/5 px-3 py-2 text-sm text-success">
                                {registrationLabel(registration.status)}
                              </p>
                            )}

                          {outcome.canRegister ? (
                            <RegisterButton
                              eventId={event.id}
                              willWaitlist={outcome.willWaitlist}
                            />
                          ) : outcome.reason === "already_registered" &&
                            registration ? (
                            <CancelButton registrationId={registration.id} />
                          ) : (
                            <p className="text-sm text-ink-faint">
                              {REGISTRATION_BLOCKED_COPY[outcome.reason]}
                            </p>
                          )}
                        </CardBody>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section aria-labelledby="past-heading" className="space-y-3">
              <h2 id="past-heading" className="text-lg text-indigo-950">
                Been and gone
              </h2>
              <ul className="space-y-3">
                {past.map(({ event, registration }) => (
                  <li key={event.id}>
                    <Card as="section">
                      <CardHeader
                        title={event.title}
                        description={when(event.startsAt, event.endsAt)}
                        eyebrow={eventKindLabel(event.kind)}
                      />
                      <CardBody className="space-y-2">
                        <p className="text-sm text-ink-muted">
                          {registration
                            ? registration.attended === true
                              ? "You attended."
                              : registration.attended === false
                                ? "Recorded as absent."
                                : `${registrationLabel(registration.status)} — attendance not taken.`
                            : "You did not register."}
                        </p>

                        {/* Feedback is only meaningful from someone who was
                            actually there. */}
                        {registration?.attended === true && (
                          <FeedbackForm
                            registrationId={registration.id}
                            rating={registration.feedbackRating}
                            comment={registration.feedbackComment}
                          />
                        )}
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
