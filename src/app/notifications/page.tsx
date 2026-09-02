import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotificationList } from "@/components/notifications/NotificationList";
import { listNotifications } from "@/lib/queries/notifications";
import { getViewer } from "@/lib/queries/roles";
import { Logo } from "@/components/ui/Logo";
import { homeForRole } from "@/config/roles";

export const metadata: Metadata = { title: "Notifications" };

/**
 * Everyone's inbox.
 *
 * Deliberately outside every role group. An account-approved notification
 * goes to staff as well as students, and the student shell requires a
 * `students` row — putting this page inside it would have made notifications
 * unreachable for exactly the people the portal also writes to.
 *
 * RLS restricts the rows to the caller, so there is no role check here beyond
 * having a session.
 */
export default async function NotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const notifications = await listNotifications();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Logo size="sm" />
        <Link
          href={homeForRole(viewer.primaryRole)}
          className="rounded text-sm font-medium text-indigo-700 hover:underline"
        >
          ← Back to the portal
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl text-indigo-950 sm:text-3xl">Notifications</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Things the portal has told you about, newest first.
        </p>
      </header>

      <NotificationList initial={notifications} />
    </main>
  );
}
