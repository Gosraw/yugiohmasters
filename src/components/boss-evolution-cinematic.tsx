"use client";

import Image from "next/image";

import {
  ChevronRight,
  SkipForward,
} from "lucide-react";

import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  EyeOfWudjat,
  GlyphBand,
  SandParticles,
} from "@/components/millennium-glyphs";

import {
  play,
} from "@/lib/sound";

// =========================================================
// BOSS EVOLUTION CINEMATIC (2.0)
//
// Shown once right after evolve_boss_stage succeeds (the action
// redirects with ?evolved=<stage>). The route's arena fades in,
// the previous stage card dissolves into light, the new stage
// card rises, "Evolution complete". ~2.4s, skippable at any
// moment (Skip, Continue, Escape). Under reduced motion the CSS
// drops every movement and it becomes a plain fade showing the
// new card. Closing strips ?evolved so a refresh doesn't replay.
// =========================================================

type StageCard = {
  name: string;
  imageUrl:
    | string
    | null;
};

function CardFace({
  card,
}: {
  card: StageCard;
}) {
  if (card.imageUrl) {
    return (
      <Image
        src={card.imageUrl}
        alt={card.name}
        width={421}
        height={614}
        unoptimized
        className="h-full w-full rounded-xl object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl bg-[linear-gradient(160deg,#26346e,#101634_70%)] p-4 text-center">
      <EyeOfWudjat className="h-10 w-14 text-amber-300/70" />

      <p className="font-display text-sm font-bold text-amber-100">
        {card.name}
      </p>
    </div>
  );
}

export function BossEvolutionCinematic({
  arenaImage,
  stageNumber,
  oldCard,
  newCard,
}: {
  arenaImage: string;
  stageNumber: number;
  oldCard:
    | StageCard
    | null;
  newCard: StageCard;
}) {
  const router = useRouter();

  const pathname =
    usePathname();

  const searchParams =
    useSearchParams();

  const [
    open,
    setOpen,
  ] = useState(true);

  const close =
    useCallback(() => {
      setOpen(false);

      const next =
        new URLSearchParams(
          searchParams.toString()
        );

      next.delete("evolved");

      const query =
        next.toString();

      router.replace(
        query
          ? `${pathname}?${query}`
          : pathname,
        {
          scroll: false,
        }
      );
    }, [
      pathname,
      router,
      searchParams,
    ]);

  useEffect(() => {
    play("rise");
    play("evolution", 1800);
  }, []);

  // Drop ?evolved= from the address bar right away (no navigation,
  // so the cinematic keeps playing) - a refresh must not replay it.
  useEffect(() => {
    const url =
      new URL(
        window.location.href
      );

    if (
      !url.searchParams.has(
        "evolved"
      )
    ) {
      return;
    }

    url.searchParams.delete(
      "evolved"
    );

    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKey(
      event: KeyboardEvent
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        close();
      }
    }

    window.addEventListener(
      "keydown",
      onKey
    );

    return () =>
      window.removeEventListener(
        "keydown",
        onKey
      );
  }, [
    open,
    close,
  ]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Evolution complete: Stage ${stageNumber}, ${newCard.name}`}
      className="dc-evo-backdrop fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden overscroll-none bg-[#03050f] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]"
    >
      {/* Arena */}
      <div
        aria-hidden="true"
        className="dc-evo-arena absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${arenaImage})`,
        }}
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_45%,transparent,rgb(3_5_15/.85)_75%),linear-gradient(180deg,rgb(3_5_15/.55),transparent_35%,rgb(3_5_15/.9))]"
      />

      <GlyphBand
        units={4}
        className="absolute inset-x-6 top-[max(1rem,env(safe-area-inset-top))] mt-12 h-4 text-amber-300/30"
      />

      <button
        type="button"
        onClick={close}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300/25 bg-[#05081a]/70 px-3 text-xs font-black text-amber-200 transition-colors hover:bg-amber-300/10"
      >
        <SkipForward
          size={12}
        />
        Skip
      </button>

      {/* Stage */}
      <div className="relative aspect-[421/614] w-[min(62vw,280px)]">
        <div
          aria-hidden="true"
          className="dc-aura dc-aura-forever pointer-events-none absolute -inset-[30%] rounded-full"
          style={
            {
              "--aura":
                "rgb(255 216 110 / .5)",
            } as React.CSSProperties
          }
        />

        <SandParticles className="-inset-x-[40%] -top-[30%] bottom-0" />

        {oldCard && (
          <div className="dc-evo-old absolute inset-0 overflow-hidden rounded-2xl border border-amber-300/30 bg-[#05081a] p-2 shadow-[0_30px_80px_rgba(0,0,0,.6)]">
            <CardFace
              card={oldCard}
            />

            <div
              aria-hidden="true"
              className="dc-evo-old-glow absolute inset-0 bg-[radial-gradient(closest-side,#fffaf0,#ffd86e_70%,#f2c45a)]"
            />
          </div>
        )}

        {/* Column of light the old card dissolves into */}
        <div
          aria-hidden="true"
          className="dc-evo-light pointer-events-none absolute -inset-y-[30%] left-1/2 w-[70%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#fffaf0,rgb(255_216_110/.7)_45%,transparent)]"
        />

        <div
          aria-hidden="true"
          className="dc-rays pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[260%] -translate-x-1/2 -translate-y-1/2"
          style={
            {
              "--rays-opacity": 0.55,
            } as React.CSSProperties
          }
        />

        <div className="dc-evo-new absolute inset-0 overflow-hidden rounded-2xl border border-amber-200/60 bg-[#05081a] p-2 shadow-[0_0_60px_rgba(255,216,110,.35),0_30px_80px_rgba(0,0,0,.6)]">
          <CardFace
            card={newCard}
          />
        </div>
      </div>

      <div className="dc-evo-title relative mt-8 text-center">
        <p className="hud-label text-amber-300/80">
          Stage {stageNumber} reached
        </p>

        <h2 className="gold-text mt-2 text-3xl font-black">
          Evolution complete
        </h2>

        <p className="mt-2 text-sm font-bold text-zinc-200">
          {newCard.name}
        </p>
      </div>

      <div className="dc-evo-actions relative mt-6">
        <button
          type="button"
          onClick={close}
          autoFocus
          className="primary-button inline-flex cursor-pointer items-center gap-2 px-6"
        >
          Continue
          <ChevronRight
            size={16}
          />
        </button>
      </div>
    </div>
  );
}
