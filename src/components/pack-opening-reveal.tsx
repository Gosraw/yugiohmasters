"use client";

import Image from "next/image";
import Link from "next/link";

import {
  ChevronRight,
  Crown,
  Layers3,
  LoaderCircle,
  PackageOpen,
  RotateCcw,
  Sparkles,
  Star,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// =========================================================
// RARITY-SCALED REVEAL EFFECTS
//
// Higher rank = more dramatic reveal (bigger glow, shake,
// sparkles, banner text). Rank comes from `rarityRank` below.
// =========================================================

function glowClassForRank(
  rank: number
) {
  if (rank >= 6) return "pull-glow-6";
  if (rank === 5) return "pull-glow-5";
  if (rank === 4) return "pull-glow-4";
  if (rank === 3) return "pull-glow-3";
  if (rank === 2) return "pull-glow-2";
  return "";
}

function sparkleCountForRank(
  rank: number
) {
  if (rank >= 6) return 6;
  if (rank === 5) return 4;
  if (rank === 4) return 2;
  return 0;
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

  pull_position:
    number;

  pulled_rarity:
    | string
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
  };
};

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

  useEffect(() => {
    return () => {
      if (
        busyTimeout.current
      ) {
        clearTimeout(
          busyTimeout.current
        );
      }
    };
  }, []);

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

  // Unlocks the slot once the current card's art has loaded
  // AND at least 550ms have passed since the flip started
  // (so the flip animation itself always has time to play),
  // whichever finishes last. A 3s failsafe always releases
  // the lock even if the image never fires load/error, so a
  // broken image link can't soft-lock the reveal.
  const markImageReady =
    useCallback(() => {
      setImageLoaded(true);

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

      // Failsafe: always unlock after 3s even if the image
      // never fires load/error, so a broken card image can
      // never soft-lock the reveal screen.
      clearBusyTimeout();

      busyTimeout.current =
        setTimeout(() => {
          setBusy(false);
        }, 3000);

      // Cards with no art at all have nothing to wait for.
      if (
        !currentPull?.card
          .image_url
      ) {
        markImageReady();
      }

      return;
    }

    setFlipped(false);
    setImageLoaded(false);

    setRevealed(
      (current) =>
        Math.min(
          current + 1,
          pulls.length
        )
    );
  }

  function revealAll() {
    clearBusyTimeout();
    setBusy(false);
    setFlipped(false);
    setImageLoaded(false);

    setRevealed(
      pulls.length
    );
  }

  function restart() {
    clearBusyTimeout();
    setBusy(false);
    setFlipped(false);
    setImageLoaded(false);
    setRevealed(0);
  }

  return (
    <div>
      {/* ==================================================
          PACK HEADER
      ================================================== */}

      <section className="relative overflow-hidden rounded-[28px] border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.07] via-black/50 to-violet-500/[0.06] p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-400/[0.08] blur-[100px]" />

          <div className="absolute -bottom-24 left-[20%] h-72 w-72 rounded-full bg-violet-500/[0.07] blur-[100px]" />
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
        <section className="mt-6">
          <div className="mx-auto max-w-sm">
            <div
              className={
                flipped &&
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
                    ? "Volgende kaart"
                    : "Kaart onthullen"
                }
                className="group block w-full cursor-pointer [perspective:1400px] disabled:cursor-wait"
              >
                <div
                  className={`relative aspect-[421/614] w-full transition-transform duration-500 [transform-style:preserve-3d] ${
                    flipped
                      ? "[transform:rotateY(180deg)]"
                      : ""
                  }`}
                >
                  {/* BACK FACE — mystery card */}
                  <div className="absolute inset-0 overflow-hidden rounded-[24px] border border-amber-300/20 bg-gradient-to-br from-zinc-900 via-black to-violet-950/30 p-5 shadow-[0_30px_100px_rgba(0,0,0,.55)] transition-all duration-300 [backface-visibility:hidden] group-hover:-translate-y-1 group-hover:border-amber-300/35">
                    <div className="pointer-events-none absolute inset-0">
                      <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/[0.05] blur-[70px]" />
                    </div>

                    <div className="relative flex h-full items-center justify-center rounded-2xl border border-amber-300/15 bg-black/70">
                      <div className="text-center">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/[0.04]">
                          <Sparkles
                            size={34}
                            className="text-amber-300"
                          />
                        </div>

                        <p className="mt-5 text-xs font-black uppercase tracking-[.28em] text-amber-200">
                          Duelist Circle
                        </p>

                        <p className="mt-2 text-[9px] font-bold uppercase tracking-[.2em] text-zinc-600">
                          Tap to Reveal
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* FRONT FACE — the actual pulled card */}
                  <div
                    className={`absolute inset-0 overflow-hidden rounded-[24px] border bg-black/70 p-3 shadow-[0_30px_100px_rgba(0,0,0,.55)] [backface-visibility:hidden] [transform:rotateY(180deg)] ${
                      rarityStyles[
                        currentRarity
                      ] ??
                      "border-zinc-500/30"
                    } ${
                      flipped
                        ? `pull-face-in ${glowClassForRank(currentRank)}`
                        : ""
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
                          <div className="pull-burst-ring pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-yellow-300/60" />
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
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="relative mt-4 flex items-center justify-between">
                  <p className="text-xs font-bold text-zinc-600">
                    {flipped &&
                    busy
                      ? "Revealing..."
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

          <div className="mt-4 text-center">
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
                (pull) => {
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
                    <Link
                      key={
                        pull.id
                      }
                      href={`/cards/${card.id}?returnTo=/shop`}
                      className={`group relative overflow-hidden rounded-2xl border bg-black/20 transition-all hover:-translate-y-1 ${rarityStyle}`}
                    >
                      {rank >= 5 && (
                        <div className="pointer-events-none absolute inset-0 z-10">
                          <div className="absolute left-1/2 top-1/3 h-32 w-32 -translate-x-1/2 rounded-full bg-white/[0.08] blur-[45px]" />
                        </div>
                      )}

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

                        <span
                          className={`absolute left-2 top-2 rounded-full border px-2 py-1 text-[7px] font-black uppercase backdrop-blur-md ${rarityStyle}`}
                        >
                          {rarity}
                        </span>

                        {rarity ===
                          "Legendary" && (
                          <Crown
                            size={18}
                            className="absolute right-2 top-2 text-yellow-200"
                          />
                        )}
                      </div>

                      <div className="relative p-3">
                        <p className="line-clamp-2 min-h-9 text-xs font-black text-zinc-100">
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