"use client";

import {
  LoaderCircle,
} from "lucide-react";

import {
  ReactNode,
} from "react";

import {
  useFormStatus,
} from "react-dom";

// =========================================================
// SUBMIT BUTTON
//
// Generic submit button for use inside a <form action={...}>.
// Shows an immediate spinner + disables itself while the
// server action is running, so a tap always gives visible
// feedback and can't be fired twice by an impatient double
// click. Wraps the same react-dom useFormStatus pattern
// already used by DeckActionButton / DeckStatusButton.
// =========================================================

type SubmitButtonProps = {
  children: ReactNode;

  pendingLabel?: ReactNode;

  className?: string;

  disabled?: boolean;
};

export function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled = false,
}: SubmitButtonProps) {
  const {
    pending,
  } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={
        disabled ||
        pending
      }
      aria-busy={
        pending
      }
      className={`${className ?? ""} transition-transform duration-150 active:scale-[0.97] disabled:cursor-wait disabled:opacity-60`}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <LoaderCircle
            size={14}
            className="animate-spin"
          />

          {pendingLabel ??
            "Even geduld..."}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
