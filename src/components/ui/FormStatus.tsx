"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./Button";
import type { ActionState } from "@/lib/actions/form-state";

/**
 * Submit button wired to the parent form's pending state. Disabling during
 * submission is what stops a double-submit creating two rows — worth having
 * in one place rather than per form.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "primary",
  size = "md",
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  className?: string;
  /**
   * Forwarded so one form can carry several submit buttons that mean
   * different things — saving a draft versus submitting it. The posted
   * name/value is what the server action reads to tell them apart.
   */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

/**
 * Form-level result banner. `role="status"` (not `alert`) for success and
 * `role="alert"` for errors, so an assistive-tech user hears the failure
 * immediately but is not interrupted by routine confirmations.
 */
export function FormMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;

  const isError = state.status === "error";

  return (
    <p
      role={isError ? "alert" : "status"}
      className={[
        "rounded-lg border px-3.5 py-2.5 text-sm",
        isError
          ? "border-danger/25 bg-danger/5 text-danger"
          : "border-success/25 bg-success/5 text-success",
      ].join(" ")}
    >
      {state.message}
    </p>
  );
}
