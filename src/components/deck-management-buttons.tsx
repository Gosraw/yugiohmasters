"use client";

import {
  Archive,
  LoaderCircle,
  Save,
} from "lucide-react";

import {
  useFormStatus,
} from "react-dom";

export function RenameDeckButton() {
  const {
    pending,
  } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="
        inline-flex cursor-pointer items-center justify-center gap-2
        rounded-xl border border-amber-300/30
        bg-amber-300/10 px-4 py-2.5
        text-sm font-black text-amber-200
        transition-all duration-150
        hover:-translate-y-0.5
        hover:border-amber-300/50
        hover:bg-amber-300/20
        active:scale-[0.97]
        disabled:cursor-wait
        disabled:opacity-50
      "
    >
      {pending ? (
        <>
          <LoaderCircle
            size={16}
            className="animate-spin"
          />
          Saving...
        </>
      ) : (
        <>
          <Save size={16} />
          Save Name
        </>
      )}
    </button>
  );
}

export function ArchiveDeckButton({
  disabled = false,
}: {
  disabled?: boolean;
}) {
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
      onClick={(
        event
      ) => {
        if (
          !window.confirm(
            "Archive this deck? You can keep building other decks, but this one moves out of normal use."
          )
        ) {
          event.preventDefault();
        }
      }}
      className="
        inline-flex cursor-pointer items-center justify-center gap-2
        rounded-xl border border-red-400/30
        bg-red-400/10 px-4 py-2.5
        text-sm font-black text-red-200
        transition-all duration-150
        hover:-translate-y-0.5
        hover:border-red-300/50
        hover:bg-red-400/20
        active:scale-[0.97]
        disabled:cursor-not-allowed
        disabled:opacity-40
      "
    >
      {pending ? (
        <>
          <LoaderCircle
            size={16}
            className="animate-spin"
          />
          Archiving...
        </>
      ) : (
        <>
          <Archive size={16} />
          Archive Deck
        </>
      )}
    </button>
  );
}