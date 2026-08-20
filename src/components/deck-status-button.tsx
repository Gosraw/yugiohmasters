"use client";

import {
  CheckCircle2,
  LoaderCircle,
  Pencil,
  Play,
} from "lucide-react";

import { useFormStatus } from "react-dom";

type DeckStatusButtonProps = {
  action:
    | "ready"
    | "active"
    | "edit";

  disabled?: boolean;

  label?: string;
};

export function DeckStatusButton({
  action,
  disabled = false,
  label,
}: DeckStatusButtonProps) {
  const { pending } =
    useFormStatus();

  const content = (() => {
    if (pending) {
      return {
        icon: (
          <LoaderCircle
            size={16}
            className="animate-spin"
          />
        ),
        text:
          action === "ready"
            ? "Validating..."
            : action === "active"
              ? "Activating..."
              : "Opening editor...",
      };
    }

    if (action === "ready") {
      return {
        icon: (
          <CheckCircle2
            size={16}
          />
        ),
        text:
          label ??
          "Mark as Ready",
      };
    }

    if (action === "active") {
      return {
        icon: (
          <Play size={16} />
        ),
        text:
          label ??
          "Set Active Deck",
      };
    }

    return {
      icon: (
        <Pencil size={16} />
      ),
      text:
        label ??
        "Edit Deck Again",
    };
  })();

  const style =
    action === "active"
      ? `
        border-emerald-400/30
        bg-emerald-400/10
        text-emerald-200
        hover:border-emerald-300/50
        hover:bg-emerald-400/20
      `
      : action === "edit"
        ? `
          border-white/10
          bg-white/[0.03]
          text-zinc-300
          hover:border-white/20
          hover:bg-white/[0.07]
          hover:text-white
        `
        : `
          border-amber-300/30
          bg-amber-300/10
          text-amber-200
          hover:border-amber-300/50
          hover:bg-amber-300/20
        `;

  return (
    <button
      type="submit"
      disabled={
        disabled ||
        pending
      }
      className={`
        inline-flex cursor-pointer items-center justify-center gap-2
        rounded-xl border px-4 py-2.5
        text-sm font-black
        transition-all duration-150
        hover:-translate-y-0.5
        active:translate-y-0
        active:scale-[0.97]
        disabled:cursor-not-allowed
        disabled:opacity-40
        ${style}
      `}
    >
      {content.icon}
      {content.text}
    </button>
  );
}