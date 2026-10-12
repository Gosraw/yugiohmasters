"use client";

import {
  setCardForTrade,
} from "@/app/actions/cards";

import {
  SubmitButton,
} from "@/components/submit-button";

import Image from "next/image";
import Link from "next/link";

import {
  CheckCircle2,
  ChevronRight,
  Crown,
  Layers3,
  LoaderCircle,
  PackageOpen,
  RotateCcw,
  SkipForward,
  Sparkles,
  Star,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  createPortal,
} from "react-dom";

import {
  EyeOfWudjat,
  GlyphBand,
  SandParticles,
} from "@/components/millennium-glyphs";

import {
  PackArt,
} from "@/components/pack-art";

import {
  generateLegendaryFlavor,
} from "@/lib/shop/legendary-flavor";

import {
  play,
  preloadSounds,
} from "@/lib/sound";

// =========================================================
// RARITY-SCALED REVEAL EFFECTS
//
// Higher rank = more dramatic reveal (bigger glow, shake,
// sparkles, banner text). Rank comes from `rarityRank` below.
// =========================================================

// Soft light behind the revealed card, tinted per rarity
// (opacity/scale pulse of a radial gradient - no animated
// box-shadow, which repaints every frame on phones).
function auraForRank(
  rank: number
) {
  if (rank >= 6) return "rgb(255 216 110 / .7)";
  if (rank === 5) return "rgb(120 150 255 / .55)";
  if (rank === 4) return "rgb(242 196 90 / .55)";
  if (rank === 3) return "rgb(110 200 240 / .4)";
  if (rank === 2) return "rgb(96 140 230 / .3)";
  return null;
}

// Card backs fanned behind the pack, one per card still
// sealed (max 3 shown).
const FAN_LAYOUT = [
  {
    x: "-7%",
    rot: "-7deg",
    opacity: 0.8,
  },
  {
    x: "7%",
    rot: "6deg",
    opacity: 0.8,
  },
  {
    x: "-2%",
    rot: "-2.5deg",
    opacity: 0.9,
  },
];

function sparkleCountForRank(
  rank: number
) {
  if (rank >= 6) return 6;
  if (rank === 5) return 4;
  if (rank === 4) return 2;
  if (rank === 3) return 2;
  return 0;
}

// =========================================================
// REDUCED MOTION (JS-level)
//
// The CSS side already neutralizes every pull-*/legendary-*
// animation under `prefers-reduced-motion: reduce` (see
// globals.css) as a backstop, but Fase J calls for real JS-
// level handling too: under reduced motion we skip MOUNTING
// the flash/impact-shake/shimmer pieces at all (not just
// relying on their animation being turned off), and compress
// the Legendary cinematic's timeline so it resolves almost
// immediately instead of just playing motionlessly for 4+
// seconds.
// =========================================================

function subscribeToReducedMotion(
  onChange: () => void
) {
  if (
    typeof window ===
      "undefined" ||
    !window.matchMedia
  ) {
    return () => {};
  }

  const query =
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

  query.addEventListener(
    "change",
    onChange
  );

  return () =>
    query.removeEventListener(
      "change",
      onChange
    );
}

function getReducedMotionSnapshot() {
  if (
    typeof window ===
      "undefined" ||
    !window.matchMedia
  ) {
    return false;
  }

  return window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );
}

const sparklePositions = [
  "left-[8%] top-[10%]",
  "right-[10%] top-[16%]",
  "left-[14%] bottom-[14%]",
  "right-[8%] bottom-[10%]",
  "left-[46%] top-[4%]",
  "right-[42%] bottom-[4%]",
];

function bannerForRank(
  rank: number
) {
  if (rank >= 6) return "LEGENDARY PULL!";
  if (rank === 5) return "Secret Rare!";
  if (rank === 4) return "Ultra Rare!";
  return null;
}

type Pull = {
  id: string;

  card_catalog_id:
    string;

  // The actual owned copy this pull created - needed so the result
  // grid's "Offer For Trade" quick action can list this exact copy
  // without a second lookup.
  card_instance_id:
    string;

  pull_position:
    number;

  pulled_rarity:
    | string
    | null;

  is_first_for_player:
    | boolean
    | null;

  card: {
    id: string;

    name: string;

    image_url:
      | string
      | null;

    game_rarity:
      | string
      | null;

    rarity_score:
      | number
      | null;

    atk:
      | number
      | null;

    def:
      | number
      | null;

    card_type: string;

    attribute:
      | string
      | null;

    monster_type:
      | string
      | null;

    archetype:
      | string
      | null;

    level:
      | number
      | null;

    rank:
      | number
      | null;

    link_rating:
      | number
      | null;
  };
};

// =========================================================
// LEGENDARY CINEMATIC — steps and timelines
//
// A "first ever pull of this Legendary" gets the full 11-beat
// sequence (dim -> buildup -> flavor -> hint -> silhouette ->
// pause -> flash -> impact -> reveal -> nameplate -> added).
// A later duplicate of the same card gets a shorter sequence
// that starts at the silhouette beat - still a premium moment,
// just without the backstory buildup. See Fase I: under the
// game's current card-scarcity rules a Legendary is capped at
// exactly one copy per league (see card_copy_limit() - this
// predates this session's work), so in practice this duplicate
// branch is not reachable today. It's still implemented
// correctly and defensively, in case that scarcity rule ever
// changes.
// =========================================================

const LEGENDARY_STEP = {
  DIM: 0,
  BUILDUP: 1,
  HINT: 2,
  SILHOUETTE: 3,
  PAUSE: 4,
  FLASH: 5,
  IMPACT: 6,
  REVEAL: 7,
  ADDED: 8,
} as const;

const LEGENDARY_FINAL_STEP =
  LEGENDARY_STEP.ADDED;

// Step where Skip first becomes available for a first-ever
// pull - after the first buildup beat has had a moment to be
// seen, per "a short first buildup may be deliberately
// visible, but must then offer Skip."
const LEGENDARY_SKIP_UNLOCKS_AT =
  LEGENDARY_STEP.BUILDUP;

type LegendaryTimeline = Partial<
  Record<
    (typeof LEGENDARY_STEP)[keyof typeof LEGENDARY_STEP],
    number
  >
>;

const FIRST_PULL_TIMELINE: LegendaryTimeline =
  {
    [LEGENDARY_STEP.DIM]: 0,
    [LEGENDARY_STEP.BUILDUP]: 500,
    [LEGENDARY_STEP.HINT]: 1500,
    [LEGENDARY_STEP.SILHOUETTE]: 2300,
    [LEGENDARY_STEP.PAUSE]: 3000,
    [LEGENDARY_STEP.FLASH]: 3400,
    [LEGENDARY_STEP.IMPACT]: 3700,
    [LEGENDARY_STEP.REVEAL]: 4000,
    [LEGENDARY_STEP.ADDED]: 4700,
  };

const DUPLICATE_TIMELINE: LegendaryTimeline =
  {
    [LEGENDARY_STEP.SILHOUETTE]: 0,
    [LEGENDARY_STEP.PAUSE]: 500,
    [LEGENDARY_STEP.FLASH]: 900,
    [LEGENDARY_STEP.IMPACT]: 1200,
    [LEGENDARY_STEP.REVEAL]: 1500,
    [LEGENDARY_STEP.ADDED]: 2000,
  };

// Reduced motion: same beats, heavily compressed, so the
// sequence still "happens" (busy-lock, is_first_for_player
// captions etc. all stay consistent) but never sits on a
// flash/shake/particle-heavy frame for long.
const FIRST_PULL_TIMELINE_REDUCED: LegendaryTimeline =
  {
    [LEGENDARY_STEP.DIM]: 0,
    [LEGENDARY_STEP.BUILDUP]: 120,
    [LEGENDARY_STEP.HINT]: 320,
    [LEGENDARY_STEP.SILHOUETTE]: 480,
    [LEGENDARY_STEP.PAUSE]: 560,
    [LEGENDARY_STEP.FLASH]: 600,
    [LEGENDARY_STEP.IMPACT]: 640,
    [LEGENDARY_STEP.REVEAL]: 680,
    [LEGENDARY_STEP.ADDED]: 900,
  };

const DUPLICATE_TIMELINE_REDUCED: LegendaryTimeline =
  {
    [LEGENDARY_STEP.SILHOUETTE]: 0,
    [LEGENDARY_STEP.PAUSE]: 80,
    [LEGENDARY_STEP.FLASH]: 120,
    [LEGENDARY_STEP.IMPACT]: 160,
    [LEGENDARY_STEP.REVEAL]: 200,
    [LEGENDARY_STEP.ADDED]: 350,
  };

function legendaryTimelineFor(
  isFirstPull: boolean,
  reducedMotion: boolean
): LegendaryTimeline {
  if (isFirstPull) {
    return reducedMotion
      ? FIRST_PULL_TIMELINE_REDUCED
      : FIRST_PULL_TIMELINE;
  }

  return reducedMotion
    ? DUPLICATE_TIMELINE_REDUCED
    : DUPLICATE_TIMELINE;
}

type PackOpeningRevealProps = {
  packName: string;

  packCode: string;

  pulls: Pull[];
};

const rarityRank: Record<
  string,
  number
> = {
  Normal: 1,
  Rare: 2,
  "Super Rare": 3,
  "Ultra Rare": 4,
  "Secret Rare": 5,
  Legendary: 6,
};

const rarityStyles: Record<
  string,
  string
> = {
  Normal:
    "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",

  Rare:
    "border-blue-400/30 bg-blue-400/10 text-blue-300",

  "Super Rare":
    "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",

  "Ultra Rare":
    "border-amber-300/40 bg-amber-300/10 text-amber-200",

  "Secret Rare":
    "border-violet-300/40 bg-violet-300/10 text-violet-200",

  Legendary:
    "border-yellow-300/50 bg-yellow-300/15 text-yellow-200 shadow-[0_0_40px_rgba(250,204,21,.14)]",
};

function packLabel(
  code: string
) {
  if (code === "normal") {
    return "Normal Pack";
  }

  if (code === "premium") {
    return "Premium Pack";
  }

  if (code === "deluxe") {
    return "Deluxe Pack";
  }

  if (
    code ===
    "special_attribute"
  ) {
    return "Attribute Spotlight";
  }

  if (
    code ===
    "special_archetype"
  ) {
    return "Archetype Spotlight";
  }

  if (
    code ===
    "special_monster_type"
  ) {
    return "Monster Type Spotlight";
  }

  return "Special Pack";
}

export function PackOpeningReveal({
  packName,
  packCode,
  pulls,
}: PackOpeningRevealProps) {
  const [
    revealed,
    setRevealed,
  ] = useState(0);

  const [
    flipped,
    setFlipped,
  ] = useState(false);

  // Briefly locks the slot right after a flip so a fast
  // second tap can't skip past the card before it was
  // actually visible — this was the root cause of cards
  // never being seen: the flip used to re-mount the whole
  // element (via a React `key`) to restart the shake
  // animation, which also silently killed the CSS flip
  // transition (a freshly-mounted element has no "from"
  // state to animate from, so it just snapped straight to
  // the end state), making it easy to tap twice and jump
  // straight past the reveal.
  const [
    busy,
    setBusy,
  ] = useState(false);

  // Whether the current card's art has actually finished
  // loading yet — used both to show a small spinner instead
  // of a blank card while it loads, and to gate when the
  // slot unlocks (see markImageReady below). Card art can
  // genuinely take a second or more to load the first time,
  // and advancing before it has loaded is exactly what made
  // cards 1-2 look like they briefly flip then show nothing:
  // the card was swapped out again before its image ever
  // painted.
  const [
    imageLoaded,
    setImageLoaded,
  ] = useState(false);

  const busyTimeout =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const flipStartedAt =
    useRef(0);

  const reducedMotion =
    usePrefersReducedMotion();

  // Legendary cinematic step (0..8, see LEGENDARY_STEP above).
  // Only meaningful while the current card is a Legendary and
  // `flipped` is true - reset to 0 every time a new card is
  // flipped.
  const [
    legendaryStep,
    setLegendaryStep,
  ] = useState<number>(0);

  const [
    legendarySkipped,
    setLegendarySkipped,
  ] = useState(false);

  // Index from which the "Revealed Cards" grid fans in with a
  // stagger: the one card just revealed, or every card at once
  // after "Reveal all".
  const [
    staggerFrom,
    setStaggerFrom,
  ] = useState(0);

  const legendaryTimers =
    useRef<
      ReturnType<
        typeof setTimeout
      >[]
    >([]);

  const clearLegendaryTimers =
    useCallback(() => {
      legendaryTimers.current.forEach(
        (timer) =>
          clearTimeout(timer)
      );

      legendaryTimers.current =
        [];
    }, []);

  useEffect(() => {
    return () => {
      if (
        busyTimeout.current
      ) {
        clearTimeout(
          busyTimeout.current
        );
      }

      clearLegendaryTimers();
    };
  }, [
    clearLegendaryTimers,
  ]);

  // Warm the browser's image cache for every card in the
  // pack as soon as the reveal screen mounts, so that by the
  // time the player taps through to each card its art is
  // usually already downloaded and appears instantly instead
  // of popping in mid-reveal.
  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    preloadSounds(["seal", "whoosh", "chime"]);
    play("unseal");

    pulls.forEach((pull) => {
      if (
        pull.card.image_url
      ) {
        const preload =
          new window.Image();

        preload.src =
          pull.card.image_url;
      }
    });
  }, [pulls]);

  const clearBusyTimeout =
    useCallback(() => {
      if (
        busyTimeout.current
      ) {
        clearTimeout(
          busyTimeout.current
        );

        busyTimeout.current =
          null;
      }
    }, []);

  const complete =
    revealed >=
    pulls.length;

  const currentPull =
    pulls[
      Math.min(
        revealed,
        pulls.length - 1
      )
    ];

  const currentRarity =
    currentPull
      ? (currentPull.card
          .game_rarity ??
          currentPull.pulled_rarity ??
          "Normal")
      : "Normal";

  const currentRank =
    rarityRank[
      currentRarity
    ] ?? 1;

  // Unlocks the slot once the current card's art has loaded
  // AND at least 550ms have passed since the flip started
  // (so the flip animation itself always has time to play),
  // whichever finishes last. A 3s failsafe always releases
  // the lock even if the image never fires load/error, so a
  // broken image link can't soft-lock the reveal.
  const markImageReady =
    useCallback(() => {
      setImageLoaded(true);

      // Legendary pulls: the card art loading in the
      // background is not what gates the slot - the
      // cinematic sequence's own timeline (or a Skip) is.
      // Bail out here so this doesn't race ahead and clear
      // `busy` mid-cinematic.
      if (currentRank === 6) {
        return;
      }

      const elapsed =
        Date.now() -
        flipStartedAt.current;

      const remaining =
        Math.max(
          0,
          550 - elapsed
        );

      clearBusyTimeout();

      busyTimeout.current =
        setTimeout(() => {
          setBusy(false);
        }, remaining);
    }, [
      clearBusyTimeout,
      currentRank,
    ]);

  const highestPull =
    useMemo(() => {
      return [...pulls].sort(
        (a, b) => {
          const aRarity =
            a.card.game_rarity ??
            a.pulled_rarity ??
            "";

          const bRarity =
            b.card.game_rarity ??
            b.pulled_rarity ??
            "";

          const rankDiff =
            (rarityRank[
              bRarity
            ] ?? 0) -
            (rarityRank[
              aRarity
            ] ?? 0);

          if (rankDiff !== 0) {
            return rankDiff;
          }

          return (
            Number(
              b.card
                .rarity_score ??
                0
            ) -
            Number(
              a.card
                .rarity_score ??
                0
            )
          );
        }
      )[0] ?? null;
    }, [pulls]);

  // `is_first_for_player` is null for anything that isn't a
  // Legendary pull. Treat null/undefined as "assume first" -
  // showing the full cinematic is never the wrong call, while
  // silently downgrading an actual first pull to the short
  // duplicate version would be.
  const isFirstLegendaryPull =
    currentPull
      ?.is_first_for_player !==
    false;

  const legendaryFlavor =
    useMemo(() => {
      if (
        !currentPull ||
        currentRank !== 6
      ) {
        return [];
      }

      return generateLegendaryFlavor(
        {
          id: currentPull
            .card.id,

          name: currentPull
            .card.name,

          attribute:
            currentPull.card
              .attribute,

          monster_type:
            currentPull.card
              .monster_type,

          archetype:
            currentPull.card
              .archetype,

          card_type:
            currentPull.card
              .card_type,

          atk: currentPull
            .card.atk,

          def: currentPull
            .card.def,

          level: currentPull
            .card.level,

          rank: currentPull
            .card.rank,

          link_rating:
            currentPull.card
              .link_rating,
        }
      );
    }, [
      currentPull,
      currentRank,
    ]);

  const imageElementRef =
    useRef<HTMLImageElement | null>(
      null
    );

  // Safety net for a known React/browser race: when an
  // image is already in the browser cache, the native
  // `load` event can fire the instant the <img> is inserted
  // — sometimes before our onLoad handler is even attached,
  // so it's silently missed and the slot stays "waiting"
  // forever (only rescued by the 3s failsafe, which reads as
  // "this card just didn't work"). After each paint, check
  // the image's own `.complete` flag directly and unlock
  // immediately if it turns out it was already done.
  useEffect(() => {
    if (
      !flipped ||
      !currentPull?.card
        .image_url
    ) {
      return;
    }

    if (
      imageElementRef
        .current
        ?.complete
    ) {
      markImageReady();
    }
  }, [
    flipped,
    currentPull,
    markImageReady,
  ]);

  // Schedules the Legendary cinematic's step transitions per
  // the chosen timeline, and - since markImageReady bails out
  // for Legendary cards (see above) - is also what eventually
  // clears `busy`, at the timeline's final beat.
  const startLegendarySequence =
    useCallback(
      (
        isFirstPull: boolean
      ) => {
        clearLegendaryTimers();

        setLegendaryStep(0);
        setLegendarySkipped(
          false
        );

        const timeline =
          legendaryTimelineFor(
            isFirstPull,
            reducedMotion
          );

        Object.entries(
          timeline
        ).forEach(
          ([
            step,
            delay,
          ]) => {
            const timer =
              setTimeout(
                () => {
                  setLegendaryStep(
                    Number(
                      step
                    )
                  );

                  if (
                    Number(
                      step
                    ) ===
                    LEGENDARY_FINAL_STEP
                  ) {
                    setBusy(
                      false
                    );
                  }
                },
                delay
              );

            legendaryTimers.current.push(
              timer
            );
          }
        );
      },
      [
        clearLegendaryTimers,
        reducedMotion,
      ]
    );

  // Jumps straight to the end of the cinematic. Available from
  // LEGENDARY_SKIP_UNLOCKS_AT onward for a first-ever pull (the
  // "short first buildup" is allowed to play once), or
  // immediately for a duplicate (its sequence is already short).
  function skipLegendary() {
    clearLegendaryTimers();
    setLegendarySkipped(true);
    setLegendaryStep(
      LEGENDARY_FINAL_STEP
    );
    setBusy(false);
  }

  // P1B: the actual "move to the next card" transition - now
  // its own function so it can be triggered from two places: a
  // tap on the card slot (every non-Legendary rarity, unchanged
  // behavior - Secret Rare stays exactly as fast as before), or
  // the dedicated [Continue] button that appears once a
  // Legendary's cinematic has actually finished (see
  // handleSlotClick and the CONTINUE button in the render below).
  function advanceToNextPull() {
    play("whoosh");
    setStaggerFrom(revealed);
    setFlipped(false);
    setImageLoaded(false);
    clearLegendaryTimers();
    setLegendaryStep(0);
    setLegendarySkipped(
      false
    );

    setRevealed(
      (current) =>
        Math.min(
          current + 1,
          pulls.length
        )
    );
  }

  function handleSlotClick() {
    if (busy) {
      return;
    }

    if (!flipped) {
      setFlipped(true);
      setImageLoaded(false);
      setBusy(true);

      flipStartedAt.current =
        Date.now();

      const isLegendary =
        currentRank === 6;

      play("seal");
      play(isLegendary ? "boom" : currentRank >= 4 ? "chime" : "whoosh", isLegendary ? 900 : 350);
      if (isLegendary) play("legendary", 1600);
      else if (currentRank === 5) play("secretRare", 700);

      // Failsafe: always unlock even if something goes wrong,
      // so a broken card/animation can never soft-lock the
      // reveal screen. Legendary gets a longer window since
      // its own cinematic can legitimately run several
      // seconds - this failsafe is a backstop, not the normal
      // path (the cinematic's own final beat / Skip clears
      // `busy` first in the ordinary case).
      clearBusyTimeout();

      busyTimeout.current =
        setTimeout(
          () => {
            setBusy(false);
          },
          isLegendary
            ? 9000
            : 3000
        );

      if (isLegendary) {
        startLegendarySequence(
          currentPull
            ?.is_first_for_player !==
            false
        );
      } else if (
        // Cards with no art at all have nothing to wait for.
        !currentPull?.card
          .image_url
      ) {
        markImageReady();
      }

      return;
    }

    // P1B: a Legendary pull must show LEGENDARY + card art + name
    // and NOT auto-advance - a tap on the card slot itself never
    // advances a Legendary, however long ago the cinematic
    // finished. Only the explicit [Continue] button does. Every
    // other rarity (Secret Rare included) keeps the original
    // tap-anywhere-to-advance behavior, unchanged.
    if (currentRank === 6) {
      return;
    }

    advanceToNextPull();
  }

  function revealAll() {
    clearBusyTimeout();
    clearLegendaryTimers();
    setBusy(false);
    setFlipped(false);
    setImageLoaded(false);
    setLegendaryStep(0);
    setLegendarySkipped(
      false
    );

    setStaggerFrom(
      Math.min(
        revealed,
        pulls.length
      )
    );

    setRevealed(
      pulls.length
    );
  }

  function restart() {
    clearBusyTimeout();
    clearLegendaryTimers();
    setBusy(false);
    setFlipped(false);
    setImageLoaded(false);
    setLegendaryStep(0);
    setLegendarySkipped(
      false
    );
    setStaggerFrom(0);
    setRevealed(0);
  }

  return (
    <div>
      {/* ==================================================
          PACK HEADER
      ================================================== */}

      <section className="relative overflow-hidden rounded-[28px] border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.07] via-[#0a0e22]/70 to-[#2c4590]/[0.2] p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgb(242_196_90/.14),transparent)]" />

          <div className="absolute -bottom-24 left-[20%] h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(44_69_144/.35),transparent)]" />

          <GlyphBand
            units={4}
            className="absolute inset-x-6 bottom-2 h-4 text-amber-300/20"
          />
        </div>

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.2em] text-amber-200">
              <PackageOpen
                size={12}
              />

              Pack Opening
            </div>

            <h1 className="gold-text mt-4 text-3xl font-black sm:text-4xl">
              {packName ||
                packLabel(
                  packCode
                )}
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              Reveal your new physical cards one by one.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-black/30 px-5 py-4">
            <p className="text-[8px] font-black uppercase tracking-[.18em] text-zinc-600">
              Revealed
            </p>

            <p className="mt-1 text-2xl font-black text-amber-100">
              {Math.min(
                revealed,
                pulls.length
              )}{" "}
              /{" "}
              {pulls.length}
            </p>
          </div>
        </div>
      </section>

      {/* ==================================================
          MAIN REVEAL
      ================================================== */}

      {!complete &&
        currentPull && (
        <section className="mt-6 overflow-x-clip">
          <div className="mx-auto max-w-sm">
            <div
              className={
                reducedMotion
                  ? ""
                  : flipped &&
                      currentRank === 6
                    ? legendaryStep >=
                      LEGENDARY_STEP.IMPACT
                      ? "legendary-impact-shake"
                      : ""
                    : flipped &&
                        currentRank >= 4
                      ? "pull-shake-once"
                      : ""
              }
            >
              <button
                type="button"
                onClick={
                  handleSlotClick
                }
                disabled={
                  busy
                }
                aria-label={
                  flipped
                    ? "Next card"
                    : "Reveal card"
                }
                className="group block w-full cursor-pointer disabled:cursor-wait"
              >
                <div className="relative aspect-[421/614] w-full">
                  {/* CARDS STILL SEALED — card backs fanned
                      behind the pack, one fewer per reveal. */}
                  {FAN_LAYOUT.slice(
                    0,
                    Math.max(
                      0,
                      Math.min(
                        3,
                        pulls.length -
                          revealed -
                          1
                      )
                    )
                  ).map(
                    (
                      fan,
                      index
                    ) => (
                      <div
                        key={
                          index
                        }
                        aria-hidden="true"
                        className="dc-fan-card pointer-events-none absolute inset-[3%] flex items-center justify-center rounded-[22px]"
                        style={
                          {
                            "--fan-x":
                              fan.x,
                            "--fan-rot":
                              fan.rot,
                            "--fan-opacity":
                              fan.opacity,
                            animationDelay: `${index * 70}ms`,
                          } as React.CSSProperties
                        }
                      >
                        <EyeOfWudjat className="h-8 w-12 text-amber-300/25" />
                      </div>
                    )
                  )}

                  {/* RARITY LIGHT — behind the revealed card:
                      aura (Rare+), gold rays (Ultra+), lapis
                      mist (Secret), sand (Legendary). */}
                  {flipped &&
                    auraForRank(
                      currentRank
                    ) && (
                      <div
                        key={`aura-${currentPull.id}`}
                        aria-hidden="true"
                        className={`dc-aura pointer-events-none absolute -inset-[14%] rounded-full ${
                          currentRank >= 6
                            ? "dc-aura-forever"
                            : ""
                        }`}
                        style={
                          {
                            "--aura":
                              auraForRank(
                                currentRank
                              ),
                          } as React.CSSProperties
                        }
                      />
                    )}

                  {flipped &&
                    !reducedMotion &&
                    currentRank ===
                      5 && (
                      <>
                        <div
                          aria-hidden="true"
                          className="dc-mist pointer-events-none absolute -left-[30%] top-[5%] h-[70%] w-[90%] rounded-full"
                        />

                        <div
                          aria-hidden="true"
                          className="dc-mist pointer-events-none absolute -right-[30%] bottom-[0%] h-[70%] w-[90%] rounded-full"
                          style={{
                            animationDelay:
                              "-2.5s",
                          }}
                        />
                      </>
                    )}

                  {flipped &&
                    !reducedMotion &&
                    (currentRank ===
                      4 ||
                      currentRank ===
                        5 ||
                      (currentRank ===
                        6 &&
                        legendaryStep >=
                          LEGENDARY_STEP.IMPACT)) && (
                      <div
                        key={`rays-${currentPull.id}`}
                        aria-hidden="true"
                        className="dc-rays pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[175%] -translate-x-1/2 -translate-y-1/2"
                        style={
                          {
                            "--ray-color":
                              currentRank ===
                              5
                                ? "rgb(150 175 255 / .5)"
                                : "rgb(255 216 110 / .55)",
                            "--rays-opacity":
                              currentRank >=
                              6
                                ? 1
                                : 0.7,
                          } as React.CSSProperties
                        }
                      />
                    )}

                  {flipped &&
                    !reducedMotion &&
                    currentRank ===
                      6 &&
                    legendaryStep >=
                      LEGENDARY_STEP.REVEAL && (
                      <SandParticles className="-inset-x-[10%] -top-[20%] bottom-0" />
                    )}

                  {/* MYSTERY PACK — "unseals" on tap: the gold
                      glyph bands ignite, a seam of light opens
                      down the middle, the pack swells and fades.
                      Deliberately NOT a 3D flip: backface-
                      visibility + preserve-3d rendering is
                      inconsistent across phones/browsers and
                      was the actual cause of cards randomly
                      appearing blank. Opacity+scale can't
                      render "nothing". */}
                  <div
                    className={`absolute inset-0 overflow-hidden rounded-[24px] border border-amber-300/25 bg-gradient-to-br from-[#18214a] via-[#080c20] to-[#05081a] p-5 shadow-[0_30px_100px_rgba(0,0,0,.55)] transition-colors duration-200 group-hover:border-amber-300/45 ${
                      flipped
                        ? "dc-pack-unseal"
                        : "dc-pack-rest"
                    }`}
                  >
                    <div className="pointer-events-none absolute inset-0">
                      <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(242_196_90/.12),transparent)]" />
                    </div>

                    <GlyphBand
                      className="dc-glyph-band pointer-events-none absolute inset-x-5 top-1.5 h-3"
                    />

                    <GlyphBand
                      className="dc-glyph-band pointer-events-none absolute inset-x-5 bottom-1.5 h-3"
                    />

                    <div className="relative h-full overflow-hidden rounded-2xl border border-amber-300/15 bg-black/70">
                      <PackArt
                        code={
                          packCode
                        }
                        name={
                          packName ||
                          packLabel(
                            packCode
                          )
                        }
                        fill
                      />

                      <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
                        <span className="rounded-full border border-amber-300/40 bg-[#05081a]/75 px-4 py-1.5 text-[9px] font-black uppercase tracking-[.25em] text-amber-100">
                          Tap to Unseal
                        </span>
                      </div>
                    </div>

                    <div
                      aria-hidden="true"
                      className="dc-seam pointer-events-none absolute inset-y-[6%] left-1/2 w-[3px] -translate-x-1/2 rounded-full"
                    />
                  </div>

                  {/* THE ACTUAL PULLED CARD */}
                  <div
                    className={`absolute inset-0 overflow-hidden rounded-[24px] border bg-[#05081a]/90 p-3 shadow-[0_30px_100px_rgba(0,0,0,.55)] ${
                      rarityStyles[
                        currentRarity
                      ] ??
                      "border-zinc-500/30"
                    } ${
                      flipped
                        ? "dc-card-rise"
                        : "pointer-events-none scale-95 opacity-0"
                    }`}
                  >
                    {flipped && (
                      <>
                        {currentPull.card
                          .image_url ? (
                          <Image
                            key={
                              currentPull.id
                            }
                            ref={
                              imageElementRef
                            }
                            src={
                              currentPull
                                .card
                                .image_url
                            }
                            alt={
                              currentPull
                                .card
                                .name
                            }
                            width={
                              421
                            }
                            height={
                              614
                            }
                            className={`h-full w-full rounded-xl object-cover transition-opacity duration-200 ${
                              imageLoaded
                                ? "opacity-100"
                                : "opacity-0"
                            }`}
                            unoptimized
                            onLoad={
                              markImageReady
                            }
                            onError={
                              markImageReady
                            }
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                            No image
                          </div>
                        )}

                        {!imageLoaded &&
                          currentPull.card
                            .image_url && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <LoaderCircle
                                size={
                                  28
                                }
                                className="animate-spin text-amber-300/70"
                              />
                            </div>
                          )}

                        {/* SECRET RARE — its own identity:
                            a dark vignette plus a couple of
                            diagonal shimmer streaks, distinct
                            from "Ultra Rare with more sparkles". */}
                        {currentRank ===
                          5 &&
                          !reducedMotion && (
                          <>
                            <div className="pull-secret-vignette pointer-events-none absolute inset-0" />

                            <div className="pull-secret-streak pointer-events-none absolute -left-1/4 top-0" />

                            <div
                              className="pull-secret-streak pointer-events-none absolute -left-1/4 top-0"
                              style={{
                                animationDelay:
                                  "1.1s",
                              }}
                            />
                          </>
                        )}

                        {sparkleCountForRank(
                          currentRank
                        ) > 0 &&
                          Array.from({
                            length:
                              sparkleCountForRank(
                                currentRank
                              ),
                          }).map(
                            (
                              _,
                              index
                            ) => (
                              <Sparkles
                                key={
                                  index
                                }
                                size={
                                  18
                                }
                                style={{
                                  animationDelay: `${index * 0.18}s`,
                                }}
                                className={`pull-sparkle pointer-events-none absolute text-amber-200 ${sparklePositions[index % sparklePositions.length]}`}
                              />
                            )
                          )}

                        {currentRank >=
                          6 && (
                          <div className="pull-burst-ring pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-200/70" />
                        )}

                        <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-black/85 to-transparent p-3">
                          {bannerForRank(
                            currentRank
                          ) && (
                            <p className="text-center text-xs font-black uppercase tracking-[.15em] text-amber-200">
                              {bannerForRank(
                                currentRank
                              )}
                            </p>
                          )}

                          <p className="mt-1 truncate text-center text-sm font-black text-zinc-100">
                            {
                              currentPull
                                .card
                                .name
                            }
                          </p>

                          <p className="mt-0.5 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            {
                              currentRarity
                            }
                          </p>

                          {currentRank ===
                            6 &&
                            legendaryStep >=
                              LEGENDARY_STEP.ADDED && (
                              <p className="legendary-line-in mt-2 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                                <CheckCircle2
                                  size={
                                    11
                                  }
                                />

                                {isFirstLegendaryPull
                                  ? "First Legendary Pull · Added to Collection"
                                  : "Added to Collection"}
                              </p>
                            )}
                        </div>

                        {/* ==============================
                            LEGENDARY CINEMATIC OVERLAY
                            Sits on top of the card art above
                            (already loading in the
                            background) until the REVEAL beat,
                            then gets out of the way.
                        ============================== */}

                        {currentRank ===
                          6 &&
                          legendaryStep <
                            LEGENDARY_STEP.REVEAL && (
                          <div className="legendary-dim pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(120%_80%_at_50%_45%,#18214a_0%,#080c20_55%,#03050f_100%)] p-5 text-center">
                            <GlyphBand
                              className="absolute inset-x-4 top-3 h-3 text-amber-300/30"
                            />

                            <GlyphBand
                              className="absolute inset-x-4 bottom-3 h-3 text-amber-300/30"
                            />

                            {legendaryStep >=
                              LEGENDARY_STEP.SILHOUETTE &&
                              !reducedMotion && (
                                <SandParticles />
                              )}

                            {legendaryStep <
                              LEGENDARY_STEP.SILHOUETTE && (
                              <div className="space-y-3">
                                {legendaryFlavor
                                  .slice(
                                    0,
                                    legendaryStep >=
                                      LEGENDARY_STEP.HINT
                                      ? 2
                                      : 1
                                  )
                                  .map(
                                    (
                                      line,
                                      index
                                    ) => (
                                      <p
                                        key={
                                          index
                                        }
                                        className="legendary-line-in font-display text-[13px] leading-5 text-amber-100/90"
                                      >
                                        {
                                          line
                                        }
                                      </p>
                                    )
                                  )}

                                <p className="pt-1 text-[8px] font-black uppercase tracking-[.3em] text-amber-300/60">
                                  Chronicle of the Temple
                                </p>
                              </div>
                            )}

                            {legendaryStep >=
                              LEGENDARY_STEP.SILHOUETTE && (
                              <div className="dc-eye-open relative flex h-48 w-48 items-center justify-center">
                                <div
                                  aria-hidden="true"
                                  className="dc-eye-glow absolute inset-0 rounded-full"
                                />

                                <EyeOfWudjat className="relative h-20 w-28 text-amber-200 drop-shadow-[0_0_12px_rgba(255,216,110,.85)]" />
                              </div>
                            )}

                            {legendaryStep >=
                              LEGENDARY_STEP.FLASH &&
                              !reducedMotion && (
                                <div className="legendary-flash pointer-events-none absolute inset-0 bg-white" />
                              )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="relative mt-4 flex items-center justify-between">
                  <p className="text-xs font-bold text-zinc-600">
                    {flipped &&
                    busy
                      ? "Revealing..."
                      : flipped &&
                          currentRank ===
                            6
                        ? "Tap Continue below"
                        : flipped
                          ? "Tap for next card"
                          : `Card ${revealed + 1} of ${pulls.length}`}
                  </p>

                  <ChevronRight
                    size={17}
                    className="text-amber-300 transition-transform group-hover:translate-x-1"
                  />
                </div>
              </button>
            </div>
          </div>

          {flipped &&
            currentRank ===
              6 &&
            !busy &&
            legendaryStep >=
              LEGENDARY_FINAL_STEP && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={
                    advanceToNextPull
                  }
                  className="primary-button inline-flex cursor-pointer items-center gap-2 px-6 py-2.5 transition-all hover:-translate-y-0.5 active:scale-[0.97]"
                >
                  Continue

                  <ChevronRight
                    size={
                      16
                    }
                  />
                </button>
              </div>
            )}

          <div className="mt-4 flex items-center justify-center gap-4">
            {flipped &&
              currentRank ===
                6 &&
              !legendarySkipped &&
              legendaryStep <
                LEGENDARY_FINAL_STEP &&
              legendaryStep >=
                LEGENDARY_SKIP_UNLOCKS_AT && (
                <button
                  type="button"
                  onClick={
                    skipLegendary
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-3 py-1.5 text-xs font-black text-amber-200 transition hover:bg-amber-300/[0.12]"
                >
                  <SkipForward
                    size={
                      12
                    }
                  />

                  Skip
                </button>
              )}

            <button
              type="button"
              onClick={
                revealAll
              }
              className="text-xs font-black text-zinc-600 transition hover:text-zinc-300"
            >
              Reveal all
            </button>
          </div>
        </section>
      )}

      {/* VIEWPORT FLASH — one short gold-white flash for
          Ultra Rare and up (Legendary: on its FLASH beat).
          Portaled to <body> so the shake wrapper's transform
          can't trap it inside the card. */}
      {!complete &&
        flipped &&
        !reducedMotion &&
        typeof document !==
          "undefined" &&
        (currentRank === 4 ||
          currentRank === 5 ||
          (currentRank === 6 &&
            legendaryStep >=
              LEGENDARY_STEP.FLASH)) &&
        createPortal(
          <div
            key={`flash-${currentPull?.id}`}
            aria-hidden="true"
            className="dc-screen-flash pointer-events-none fixed inset-0 z-[70]"
            style={
              {
                "--flash-peak":
                  currentRank >= 6
                    ? 0.8
                    : currentRank ===
                        5
                      ? 0.6
                      : 0.45,
              } as React.CSSProperties
            }
          />,
          document.body
        )}

      {/* ==================================================
          REVEALED CARDS
      ================================================== */}

      {revealed > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-2">
            <Layers3
              size={17}
              className="text-amber-300"
            />

            <h2 className="text-lg font-black">
              Revealed Cards
            </h2>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
            {pulls
              .slice(
                0,
                revealed
              )
              .map(
                (
                  pull,
                  index
                ) => {
                  const {
                    card,
                  } = pull;

                  const rarity =
                    card.game_rarity ??
                    pull.pulled_rarity ??
                    "Not Rated";

                  const rarityStyle =
                    rarityStyles[
                      rarity
                    ] ??
                    "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";

                  const rank =
                    rarityRank[
                      rarity
                    ] ?? 0;

                  return (
                    <div
                      key={pull.id}
                      className="dc-grid-fan-in relative"
                      style={{
                        animationDelay: `${Math.min(
                          Math.max(
                            0,
                            index -
                              staggerFrom
                          ),
                          10
                        ) * 60}ms`,
                      }}
                    >
                    <Link
                      href={`/cards/${card.id}?returnTo=/shop`}
                      className={`group relative overflow-hidden rounded-2xl border bg-black/20 transition-all hover:-translate-y-1 ${rarityStyle}`}
                    >
                      {rank >= 5 && (
                        <div className="pointer-events-none absolute inset-0 z-10">
                          <div className="absolute left-1/2 top-1/3 h-32 w-32 -translate-x-1/2 rounded-full bg-white/[0.08] blur-[45px]" />
                        </div>
                      )}

                      {/* CARD IMAGE - nothing overlaid: name and
                          ATK/DEF stay fully readable. Rarity and
                          the Legendary crown both live below the
                          image instead (see next block). */}

                      <div className="relative">
                        {card.image_url ? (
                          <Image
                            src={
                              card.image_url
                            }
                            alt={
                              card.name
                            }
                            width={421}
                            height={614}
                            className="aspect-[421/614] h-auto w-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex aspect-[421/614] items-center justify-center text-xs text-zinc-700">
                            No image
                          </div>
                        )}
                      </div>

                      <div className="relative p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[7px] font-black uppercase ${rarityStyle}`}
                          >
                            {rarity}
                          </span>

                          {rarity ===
                            "Legendary" && (
                            <Crown
                              size={11}
                              className="text-yellow-200"
                            />
                          )}
                        </div>

                        <p className="mt-1.5 line-clamp-2 min-h-9 text-xs font-black text-zinc-100">
                          {card.name}
                        </p>

                        <div className="mt-2 flex items-center justify-between text-[8px] text-zinc-600">
                          <span>
                            {card.atk !=
                            null
                              ? `ATK ${card.atk}`
                              : card.card_type}
                          </span>

                          {card.rarity_score !=
                            null && (
                            <span>
                              {Number(
                                card.rarity_score
                              ).toFixed(
                                1
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>

                    <form
                      action={setCardForTrade}
                      className="mt-1.5"
                    >
                      <input
                        type="hidden"
                        name="card_instance_id"
                        value={pull.card_instance_id}
                      />

                      <input
                        type="hidden"
                        name="for_trade"
                        value="true"
                      />

                      <input
                        type="hidden"
                        name="return_to"
                        value="/shop"
                      />

                      <SubmitButton
                        pendingLabel="Saving..."
                        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[8px] font-black uppercase tracking-wider text-zinc-400 hover:border-emerald-300/30 hover:text-emerald-200"
                      >
                        Offer For Trade
                      </SubmitButton>
                    </form>
                    </div>
                  );
                }
              )}
          </div>
        </section>
      )}

      {/* ==================================================
          COMPLETE
      ================================================== */}

      {complete && (
        <section className="relative mt-8 overflow-hidden rounded-[26px] border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[0.045] via-black/30 to-amber-300/[0.035] p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Star
                  size={17}
                  className="text-amber-300"
                />

                <p className="text-[9px] font-black uppercase tracking-[.2em] text-amber-300">
                  Opening Complete
                </p>
              </div>

              <h2 className="mt-2 text-2xl font-black">
                Cards added to Collection
              </h2>

              {highestPull && (
                <p className="mt-2 text-sm text-zinc-500">
                  Best pull:{" "}
                  <span className="font-black text-amber-200">
                    {
                      highestPull
                        .card.name
                    }
                  </span>{" "}
                  ·{" "}
                  {highestPull.card
                    .game_rarity ??
                    highestPull
                      .pulled_rarity}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/cards/collection"
                className="primary-button inline-flex items-center gap-2"
              >
                <Layers3
                  size={15}
                />

                Collection
              </Link>

              <Link
                href="/shop"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition hover:border-amber-300/20 hover:text-amber-200"
              >
                <PackageOpen
                  size={15}
                />

                Back to Shop
              </Link>

              <button
                type="button"
                onClick={
                  restart
                }
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-black text-zinc-500 transition hover:text-zinc-200"
              >
                <RotateCcw
                  size={14}
                />

                Replay
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}