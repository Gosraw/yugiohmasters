"use client";

import {
  useState,
} from "react";

import {
  Crown,
  Skull,
  Sparkles,
  Swords,
  Trophy,
  X,
} from "lucide-react";

type SamoRivalIntroProps = {
  username:
    | string
    | null
    | undefined;
};

export function SamoRivalIntro({
  username,
}: SamoRivalIntroProps) {
  const isSamo =
    username
      ?.trim()
      .toLowerCase() ===
    "samo";

  const [
    dismissed,
    setDismissed,
  ] = useState(false);

  if (
    !isSamo ||
    dismissed
  ) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/95 px-4 py-8 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-180px] h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-red-600/10 blur-[120px]" />

        <div className="absolute bottom-[-200px] left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-amber-400/[0.07] blur-[120px]" />
      </div>

      <div className="relative w-full max-w-2xl overflow-hidden rounded-[30px] border border-red-400/20 bg-gradient-to-b from-red-950/40 via-zinc-950 to-black shadow-[0_0_120px_rgba(239,68,68,0.12)]">
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-red-400/70 to-transparent" />

        <button
          type="button"
          onClick={() =>
            setDismissed(true)
          }
          aria-label="Close"
          className="absolute right-4 top-5 z-10 rounded-full border border-white/10 bg-black/40 p-2 text-zinc-600 transition hover:border-white/20 hover:text-zinc-200"
        >
          <X size={16} />
        </button>

        <div className="p-6 text-center sm:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-red-400/25 bg-red-400/[0.07] shadow-[0_0_50px_rgba(239,68,68,0.12)]">
            <Skull
              size={38}
              className="text-red-300"
            />
          </div>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-400/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[.22em] text-red-300">
            <Swords size={13} />

            Rival Detected
          </div>

          <h1 className="mt-5 text-4xl font-black uppercase tracking-tight text-zinc-100 sm:text-5xl">
            Samo
          </h1>

          <p className="mt-2 text-xs font-black uppercase tracking-[.25em] text-amber-300">
            A familiar challenger has appeared
          </p>

          <div className="mx-auto mt-8 max-w-xl space-y-4 text-sm leading-7 text-zinc-400 sm:text-base">
            <p>
              Ben je er klaar mee
              om altijd{" "}
              <span className="font-black text-zinc-100">
                Joey
              </span>{" "}
              te zijn en nooit{" "}
              <span className="font-black text-amber-300">
                Yugi
              </span>
              ?
            </p>

            <p>
              Moe van dat moment
              waarop iedereen al
              weet hoe het duel
              eindigt voordat je
              überhaupt je eerste
              kaart hebt getrokken?
            </p>

            <p>
              Geen zorgen. Vandaag
              krijg je opnieuw een
              kans.
            </p>
          </div>

          <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-amber-300">
                <Trophy
                  size={16}
                />

                <span className="text-[10px] font-black uppercase tracking-wider">
                  Mission
                </span>
              </div>

              <p className="mt-3 text-sm font-black text-zinc-200">
                Versla Gos één keer
              </p>
            </div>

            <div className="rounded-2xl border border-red-400/15 bg-red-400/[0.025] p-4">
              <div className="flex items-center gap-2 text-red-300">
                <Crown
                  size={16}
                />

                <span className="text-[10px] font-black uppercase tracking-wider">
                  Difficulty
                </span>
              </div>

              <p className="mt-3 text-sm font-black text-red-200">
                Legendary
              </p>
            </div>

            <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.025] p-4">
              <div className="flex items-center gap-2 text-violet-300">
                <Sparkles
                  size={16}
                />

                <span className="text-[10px] font-black uppercase tracking-wider">
                  Win Chance
                </span>
              </div>

              <p className="mt-3 text-sm font-black text-violet-200">
                Classified
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-amber-300/15 bg-amber-300/[0.035] px-5 py-4">
            <p className="text-sm font-semibold italic leading-6 text-zinc-300">
              &ldquo;Maar hé...
              elke Yugi heeft een
              Joey nodig.&rdquo;
            </p>
          </div>

          <p className="mt-7 text-xl font-black text-zinc-100">
            Welkom terug, rival.
          </p>

          <button
            type="button"
            onClick={() =>
              setDismissed(true)
            }
            className="primary-button mt-7 inline-flex min-w-56 items-center justify-center gap-2"
          >
            <Swords size={17} />

            Ik ben er klaar voor
          </button>

          <p className="mt-2 text-[10px] font-bold uppercase tracking-[.16em] text-zinc-700">
            Waarschijnlijk.
          </p>
        </div>
      </div>
    </div>
  );
}