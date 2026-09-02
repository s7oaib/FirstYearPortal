import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { NotificationKind } from "@/config/notifications";

/**
 * Notification reads (PRD 5.11).
 *
 * RLS restricts every query here to the caller's own rows, so none of these
 * take a user id — the same arrangement the rest of the portal uses.
 */

export type Notification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const COLUMNS = "id, kind, title, body, link, read_at, created_at" as const;

export async function listNotifications(limit = 50): Promise<Notification[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("notifications")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

/** Unread count for the sidebar badge. One indexed COUNT per render. */
export async function getUnreadCount(): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}
