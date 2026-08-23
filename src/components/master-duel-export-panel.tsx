"use client";

import {
  useState,
} from "react";

import {
  ClipboardCopy,
  Download,
  Info,
} from "lucide-react";

export function MasterDuelExportPanel({
  deckName,
  disclaimer,
  ydkText,
  checklistText,
  missingPasscodeCount,
}: {
  deckName: string;
  disclaimer: string;
  ydkText: string;
  checklistText: string;
  missingPasscodeCount: number;
}) {
  const [
    copiedWhich,
    setCopiedWhich,
  ] = useState<
    | "checklist"
    | "ydk"
    | null
  >(null);

  async function copy(
    text: string,
    which:
      | "checklist"
      | "ydk"
  ) {
    try {
      await navigator.clipboard.writeText(
        text
      );
      setCopiedWhich(which);
      window.setTimeout(() => {
        setCopiedWhich(
          (current) =>
            current === which
              ? null
              : current
        );
      }, 2000);
    } catch {
      // Clipboard access can be denied by the browser - fall back
      // to selecting the text so the player can still copy it
      // manually via Ctrl/Cmd+C.
      window.alert(
        "Couldn't access the clipboard automatically. Select the text below and copy it manually."
      );
    }
  }

  function downloadYdk() {
    const blob = new Blob(
      [ydkText],
      {
        type: "text/plain",
      }
    );
    const url =
      URL.createObjectURL(
        blob
      );
    const anchor =
      document.createElement(
        "a"
      );
    anchor.href = url;
    anchor.download = `${deckName
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      ) || "deck"}.ydk`;
    document.body.appendChild(
      anchor
    );
    anchor.click();
    document.body.removeChild(
      anchor
    );
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-sky-300/15 bg-sky-300/[0.03] p-3">
        <Info
          size={15}
          className="mt-0.5 shrink-0 text-sky-300"
        />

        <p className="text-xs leading-5 text-zinc-400">
          {disclaimer}
        </p>
      </div>

      {missingPasscodeCount >
        0 && (
        <p className="text-xs font-bold text-amber-300">
          {
            missingPasscodeCount
          }{" "}
          card
          {missingPasscodeCount ===
          1
            ? ""
            : "s"}{" "}
          in this deck
          {" "}
          {missingPasscodeCount ===
          1
            ? "has"
            : "have"}{" "}
          no known card ID and{" "}
          {missingPasscodeCount ===
          1
            ? "is"
            : "are"}{" "}
          missing from the .ydk
          file below.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-zinc-300">
            Checklist
          </p>

          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Plain-text list to rebuild
            this deck in the
            Official TCG Database
            or NEURON.
          </p>

          <button
            type="button"
            onClick={() =>
              copy(
                checklistText,
                "checklist"
              )
            }
            className="
              mt-3 inline-flex w-full cursor-pointer items-center
              justify-center gap-2 rounded-lg border
              border-amber-300/30 bg-amber-300/10 px-3 py-2
              text-xs font-black text-amber-200
              transition-all duration-150
              hover:border-amber-300/50 hover:bg-amber-300/20
              active:scale-[0.97]
            "
          >
            <ClipboardCopy
              size={14}
            />
            {copiedWhich ===
            "checklist"
              ? "Copied!"
              : "Copy Checklist"}
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-zinc-300">
            .ydk File
          </p>

          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Standard deck file
            readable by most other
            Yu-Gi-Oh deck tools.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                copy(
                  ydkText,
                  "ydk"
                )
              }
              className="
                inline-flex cursor-pointer items-center
                justify-center gap-2 rounded-lg border
                border-white/15 bg-white/5 px-3 py-2
                text-xs font-black text-zinc-200
                transition-all duration-150
                hover:border-white/25 hover:bg-white/10
                active:scale-[0.97]
              "
            >
              <ClipboardCopy
                size={14}
              />
              {copiedWhich ===
              "ydk"
                ? "Copied!"
                : "Copy"}
            </button>

            <button
              type="button"
              onClick={
                downloadYdk
              }
              className="
                inline-flex cursor-pointer items-center
                justify-center gap-2 rounded-lg border
                border-white/15 bg-white/5 px-3 py-2
                text-xs font-black text-zinc-200
                transition-all duration-150
                hover:border-white/25 hover:bg-white/10
                active:scale-[0.97]
              "
            >
              <Download
                size={14}
              />
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
