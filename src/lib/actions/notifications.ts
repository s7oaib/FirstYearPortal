"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "./form-state";

/**
 * Notification mutations (PRD 5.11).
 *
 * Only read state can change. There is no action to create a notification —
 * they come from database triggers, so no server action can forge one, and
 * none can be suppressed by the account it is about.
 */

export async function markRead(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("notificationId") ?? "");
  if (!id) return { status: "error", message: "Unknown notification." };

  const supabase = createClient();
  // No ownership check needed here beyond RLS: the policy restricts the row
  // to `user_id = auth.uid()`, so a posted id belonging to somebody else
  // matches nothing rather than updating their inbox.
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { status: "error", message: "Could not update that notification." };
  }

  revalidatePath("/notifications");
  return { status: "success", message: "Marked read." };
}

export async function markAllRead(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const supabase = createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) {
    return { status: "error", message: "Could not update your notifications." };
  }

  revalidatePath("/notifications");
  return { status: "success", message: "All marked read." };
}
