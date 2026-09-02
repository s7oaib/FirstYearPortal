"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MarkAllReadButton, MarkReadButton } from "./MarkReadButtons";
import { Card, CardBody, EmptyState } from "@/components/ui/Card";
import { notificationLabel } from "@/config/notifications";
import type { Notification } from "@/lib/queries/notifications";

/**
 * The inbox, with a live subscription rather than polling (PRD 5.11).
 *
 * The subscription carries no data of its own: an insert event triggers
 * `router.refresh()`, and the server re-renders the list under RLS. That is
 * deliberate — trusting the payload would mean rendering a row the server
 * never authorised, and the realtime stream is not the place to be deciding
 * who may see what. The cost is one extra round trip per notification, which
 * is nothing at this volume.
 */
export function NotificationList({
  initial,
}: {
  initial: Notification[];
}) {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => router.refresh(),
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  const unread = initial.filter((n) => n.readAt === null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {unread.length === 0
            ? "Nothing unread."
            : `${unread.length} unread`}
          {/* Stated plainly rather than hidden: if the live connection drops,
              the page still works but stops updating on its own, and the
              reader should know which they are looking at. */}
          <span className="ml-2 text-xs text-ink-faint">
            {live ? "· updating live" : "· refresh to see new items"}
          </span>
        </p>

        {unread.length > 0 && <MarkAllReadButton />}
      </div>

      {initial.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="Nothing yet"
              description="You will hear here when an achievement is verified, an assessment is marked, a place opens up at an event, or your roadmap is ready."
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-2">
          {initial.map((notification) => (
            <li key={notification.id}>
              <Card>
                <CardBody
                  className={[
                    "flex flex-wrap items-start justify-between gap-3",
                    notification.readAt === null ? "" : "opacity-70",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-brass-600">
                      {notificationLabel(notification.kind)}
                      {notification.readAt === null && (
                        <span className="ml-2 rounded-full bg-brass-500 px-1.5 py-0.5 text-[0.625rem] text-white">
                          New
                        </span>
                      )}
                    </p>
                    <h2 className="mt-1 text-sm font-medium text-indigo-950">
                      {notification.title}
                    </h2>
                    {notification.body && (
                      <p className="mt-1 text-sm text-ink-muted">
                        {notification.body}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-ink-faint">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {notification.link && (
                      <Link
                        href={notification.link}
                        className="rounded text-sm font-medium text-indigo-700 hover:underline"
                      >
                        Open
                      </Link>
                    )}
                    {notification.readAt === null && (
                      <MarkReadButton
                        notificationId={notification.id}
                        title={notification.title}
                      />
                    )}
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
