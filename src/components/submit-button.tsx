"use client";

import {
  LoaderCircle,
} from "lucide-react";

import type {
  MouseEvent,
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

  // For a secondary action inside a form that has a
  // different default `action` (e.g. a "Decline" button
  // next to the main "Accept" submit).
  formAction?: (
    formData: FormData
  ) => void;

  formNoValidate?: boolean;

  title?: string;

  // Lets a wrapper (e.g. ConfirmSubmitButton) intercept the
  // click before the form submits, without every caller having
  // to reimplement useFormStatus itself.
  onClick?: (
    event: MouseEvent<HTMLButtonElement>
  ) => void;
};

export function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled = false,
  formAction,
  formNoValidate,
  title,
  onClick,
}: SubmitButtonProps) {
  const {
    pending,
  } = useFormStatus();

  return (
    <button
      type="submit"
      title={
        title
      }
      formAction={
        formAction
      }
      formNoValidate={
        formNoValidate
      }
      onClick={
        onClick
      }
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
