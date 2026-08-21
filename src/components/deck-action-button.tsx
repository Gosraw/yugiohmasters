"use client";

import {
  LoaderCircle,
  Minus,
  Plus,
} from "lucide-react";

import {
  useFormStatus,
} from "react-dom";

type DeckActionButtonProps = {
  type:
    | "add"
    | "remove";

  label?: string;

  disabled?: boolean;
};

export function DeckActionButton({
  type,
  label,
  disabled = false,
}: DeckActionButtonProps) {
  const {
    pending,
  } = useFormStatus();

  const isAdd =
    type === "add";

  return (
    <button
      type="submit"
      disabled={
        disabled ||
        pending
      }
      className={
        isAdd
          ? `
            inline-flex w-full cursor-pointer items-center justify-center gap-2
            rounded-xl border border-amber-300/20 bg-amber-300/10
            px-3 py-2 text-xs font-black text-amber-200
            transition-all duration-150
            hover:-translate-y-0.5 hover:border-amber-300/40 hover:bg-amber-300/20
            active:translate-y-0 active:scale-[0.97]
            disabled:cursor-wait disabled:opacity-50
          `
          : `
            inline-flex h-10 w-10 cursor-pointer items-center justify-center
            rounded-lg border border-red-400/30 bg-black/90
            text-red-300 shadow-lg
            transition-all duration-150
            hover:scale-110 hover:border-red-300/50 hover:bg-red-400/20
            active:scale-90
            disabled:cursor-wait disabled:opacity-50
          `
      }
    >
      {pending ? (
        <>
          <LoaderCircle
            size={
              isAdd
                ? 14
                : 15
            }
            className="animate-spin"
          />

          {isAdd && (
            <span>
              Adding...
            </span>
          )}
        </>
      ) : isAdd ? (
        <>
          <Plus
            size={14}
          />

          {label ??
            "Add"}
        </>
      ) : (
        <Minus
          size={15}
        />
      )}
    </button>
  );
}
