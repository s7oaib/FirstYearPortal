"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnAdmin } from "@/lib/queries/admin";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getOwnStudent } from "@/lib/queries/student";
import { RESOURCE_KIND_VALUES } from "@/config/resources";
import { fieldErrorsFrom, type ActionState } from "./form-state";

/**
 * Resource mutations (PRD 5.9).
 *
 * Faculty may suggest; only an administrator may verify. That split is
 * enforced by a trigger in migration 0015 as well as here, because "an
 * administrator has checked this link" is the one claim in the catalogue a
 * student is being asked to rely on.
 */

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable(),
  );

const resourceSchema = z.object({
  title: z.string().trim().min(3, "Give the resource a title.").max(200),
  description: optionalText(2000),
  kind: z.enum(RESOURCE_KIND_VALUES, {
    errorMap: () => ({ message: "Choose a resource type." }),
  }),
  provider: optionalText(120),
  // Checked here as well as by the database constraint so the person adding
  // it gets a sentence rather than a constraint violation. `http` is allowed
  // because some VTU-hosted documents are still served over it, and refusing
  // them would push people to paste the link somewhere worse.
  url: z
    .string()
    .trim()
    .url("Enter a full link, starting http:// or https://")
    .max(2000),
  departmentCode: optionalText(10),
  semester: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().int().min(1).max(2).nullable(),
  ),
  estimatedHours: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().int().min(0).max(2000).nullable(),
  ),
  isFree: z.boolean(),
  interestIds: z.array(z.coerce.number().int().positive()),
  goalIds: z.array(z.coerce.number().int().positive()),
  domainIds: z.array(z.coerce.number().int().positive()),
});

function readForm(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description"),
    kind: formData.get("kind"),
    provider: formData.get("provider"),
    url: formData.get("url"),
    departmentCode: formData.get("departmentCode"),
    semester: formData.get("semester"),
    estimatedHours: formData.get("estimatedHours"),
    isFree: formData.get("isFree") === "on",
    interestIds: formData.getAll("interestIds").map(Number),
    goalIds: formData.getAll("goalIds").map(Number),
    domainIds: formData.getAll("domainIds").map(Number),
  };
}

async function currentUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function replaceTags(
  resourceId: string,
  values: {
    interestIds: number[];
    goalIds: number[];
    domainIds: number[];
  },
) {
  const supabase = createClient();

  // Replaced wholesale rather than diffed: the tag set is small, always
  // edited as a whole, and a partial update that drops one tag would quietly
  // change who the resource is recommended to.
  await Promise.all([
    supabase.from("resource_interests").delete().eq("resource_id", resourceId),
    supabase.from("resource_goals").delete().eq("resource_id", resourceId),
    supabase.from("resource_domains").delete().eq("resource_id", resourceId),
  ]);

  // PromiseLike, not Promise: postgrest-js query builders are thenable but
  // are not Promise instances, so they lack `catch` and `finally`.
  const inserts: Array<PromiseLike<unknown>> = [];
  if (values.interestIds.length > 0) {
    inserts.push(
      supabase.from("resource_interests").insert(
        values.interestIds.map((interest_id) => ({
          resource_id: resourceId,
          interest_id,
        })),
      ),
    );
  }
  if (values.goalIds.length > 0) {
    inserts.push(
      supabase.from("resource_goals").insert(
        values.goalIds.map((goal_id) => ({ resource_id: resourceId, goal_id })),
      ),
    );
  }
  if (values.domainIds.length > 0) {
    inserts.push(
      supabase.from("resource_domains").insert(
        values.domainIds.map((domain_id) => ({
          resource_id: resourceId,
          domain_id,
        })),
      ),
    );
  }

  await Promise.all(inserts);
}

export async function createResource(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const [staff, admin] = await Promise.all([getOwnStaff(), getOwnAdmin()]);
  if (!staff && !admin) {
    return { status: "error", message: "Staff access required." };
  }

  const parsed = resourceSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const values = parsed.data;
  const supabase = createClient();

  const { data, error } = await supabase
    .from("resources")
    .insert({
      title: values.title,
      description: values.description,
      kind: values.kind,
      provider: values.provider,
      url: values.url,
      department_code: values.departmentCode,
      semester: values.semester,
      estimated_hours: values.estimatedHours,
      is_free: values.isFree,
      added_by: await currentUserId(),
    })
    .select("id")
    .single();

  if (error || !data) {
    const message = /duplicate key|unique/i.test(error?.message ?? "")
      ? "That link is already in the catalogue."
      : "Could not add that resource.";
    return { status: "error", message };
  }

  await replaceTags(data.id, values);

  revalidatePath("/admin/resources");
  revalidatePath("/resources");

  return {
    status: "success",
    message: admin
      ? "Added. Mark it verified once you have opened the link."
      : "Added, and shown to students as unverified until an administrator checks it.",
  };
}

const verifySchema = z.object({
  resourceId: z.string().uuid("Unknown resource."),
  verified: z.boolean(),
});

/**
 * Marks a resource checked, or un-checks it.
 *
 * Administrator-only, in this action and again in the database. The badge
 * means "somebody accountable opened this link"; if anyone could set it, it
 * would mean nothing at all.
 */
export async function setResourceVerified(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getOwnAdmin();
  if (!admin) {
    return { status: "error", message: "Administrator access required." };
  }

  const parsed = verifySchema.safeParse({
    resourceId: formData.get("resourceId"),
    verified: formData.get("verified") === "true",
  });

  if (!parsed.success) {
    return { status: "error", message: "Could not update that resource." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("resources")
    .update({
      is_verified: parsed.data.verified,
      verified_by: parsed.data.verified ? admin.id : null,
      verified_at: parsed.data.verified ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.resourceId);

  if (error) {
    return { status: "error", message: "Could not update that resource." };
  }

  revalidatePath("/admin/resources");
  revalidatePath("/resources");

  return {
    status: "success",
    message: parsed.data.verified
      ? "Marked as checked."
      : "Verification removed — students will see it as unchecked.",
  };
}

export async function setResourceActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getOwnAdmin();
  if (!admin) {
    return { status: "error", message: "Administrator access required." };
  }

  const resourceId = String(formData.get("resourceId") ?? "");
  const active = formData.get("active") === "true";
  if (!resourceId) return { status: "error", message: "Unknown resource." };

  const supabase = createClient();
  // Retired rather than deleted: a student may have saved it, and removing
  // the row would silently empty their list.
  const { error } = await supabase
    .from("resources")
    .update({ is_active: active })
    .eq("id", resourceId);

  if (error) {
    return { status: "error", message: "Could not update that resource." };
  }

  revalidatePath("/admin/resources");
  return {
    status: "success",
    message: active ? "Restored to the catalogue." : "Retired from the catalogue.",
  };
}

export async function toggleSavedResource(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const student = await getOwnStudent();
  if (!student) {
    return { status: "error", message: "Student access required." };
  }

  const resourceId = String(formData.get("resourceId") ?? "");
  const save = formData.get("save") === "true";
  if (!resourceId) return { status: "error", message: "Unknown resource." };

  const supabase = createClient();
  const { error } = save
    ? await supabase
        .from("student_resources")
        .upsert(
          { student_id: student.id, resource_id: resourceId },
          { onConflict: "student_id,resource_id" },
        )
    : await supabase
        .from("student_resources")
        .delete()
        .eq("student_id", student.id)
        .eq("resource_id", resourceId);

  if (error) {
    return { status: "error", message: "Could not update your saved list." };
  }

  revalidatePath("/resources");
  return {
    status: "success",
    message: save ? "Saved to your list." : "Removed from your list.",
  };
}
