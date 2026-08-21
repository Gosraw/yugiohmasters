"use client";

import type {
  ReactNode,
} from "react";

import {
  SubmitButton,
} from "@/components/submit-button";

// =========================================================
// CONFIRM SUBMIT BUTTON
//
// A SubmitButton that first asks for a plain yes/no confirm
// before the form is allowed to submit. Used for destructive
// or hard-to-undo actions (declining a challenge, cancelling
// a trade) so a stray tap can't fire them by accident. Reuses
// all of SubmitButton's pending/disabled behaviour — this only
// adds the confirm gate on top.
// =========================================================

type ConfirmSubmitButtonProps = {
  children: ReactNode;

  confirmMessage: string;

  pendingLabel?: ReactNode;

  className?: string;

  disabled?: boolean;

  formAction?: (
    formData: FormData
  ) => void;

  formNoValidate?: boolean;
};

export function ConfirmSubmitButton({
  children,
  confirmMessage,
  pendingLabel,
  className,
  disabled,
  formAction,
  formNoValidate,
}: ConfirmSubmitButtonProps) {
  return (
    <SubmitButton
      pendingLabel={
        pendingLabel
      }
      className={
        className
      }
      disabled={
        disabled
      }
      formAction={
        formAction
      }
      formNoValidate={
        formNoValidate
      }
      onClick={(
        event
      ) => {
        if (
          !window.confirm(
            confirmMessage
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </SubmitButton>
  );
}
