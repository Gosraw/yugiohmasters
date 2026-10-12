"use client";

import Link from "next/link";

import {
  Coins,
  Gift,
  Package,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";

import {
  usePathname,
  useSearchParams,
} from "next/navigation";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getRecentRewards,
  type RewardMoment,
} from "@/app/actions/wallet";

import {
  play,
} from "@/lib/sound";

// =========================================================
// REWARD POP-UP (2.0)
//
// docs/V2_PLAN.md, Rewards: "Reward pop-up at the moment it
// happens". Mounted once in the (app) layout. On every page change
// (and when a page fires REWARDS_CHECK_EVENT right after a result
// is saved, or the tab comes back into view) it asks
// getRecentRewards() for ledger credits / pack vouchers newer than
// the last ones this player already saw, and shows each "moment"
// as a short celebratory card: "+700 DP · Premium Pack - Round 2
// complete - 1st place".
//
// "Last seen" lives in localStorage per user (try/catch: private
// mode / blocked storage just means you may see a pop-up twice,
// never a broken page). Respects prefers-reduced-motion: no
// slide/scale and no count-up, only a fade.
// =========================================================

export const REWARDS_CHECK_EVENT =
  "dc:rewards-check";

const AUTO_DISMISS_MS = 6500;

const EXIT_MS = 180;

const MAX_REMEMBERED_IDS = 80;

type SeenMarker = {
  at: string | null;
  ids: string[];
};

function storageKey(
  userId: string
) {
  return `dc.rewardSeen.v1.${userId}`;
}

function readMarker(
  userId: string
): SeenMarker | null {
  try {
    const raw =
      window.localStorage.getItem(
        storageKey(userId)
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw) as Partial<SeenMarker>;

    return {
      at:
        typeof parsed.at === "string"
          ? parsed.at
          : null,
      ids: Array.isArray(parsed.ids)
        ? parsed.ids.filter(
            (id): id is string => typeof id === "string"
          )
        : [],
    };
  } catch {
    return null;
  }
}

function writeMarker(
  userId: string,
  marker: SeenMarker
) {
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify(marker)
    );
  } catch {
    // Storage unavailable: the in-memory "seen" set below still
    // prevents repeats for this visit.
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  } catch {
    return false;
  }
}

/** Ask the pop-up to look for new rewards right now. */
export function requestRewardCheck() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new Event(REWARDS_CHECK_EVENT)
    );
  }
}

function CountUp({
  value,
}: {
  value: number;
}) {
  const [
    shown,
    setShown,
  ] = useState(
    () =>
      prefersReducedMotion()
        ? value
        : 0
  );

  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }

    const duration = 650;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic: fast start, gentle landing
      const eased = 1 - Math.pow(1 - t, 3);

      setShown(
        Math.round(value * eased)
      );

      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () =>
      cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className="tabular-nums">
      {shown.toLocaleString("en-US")}
    </span>
  );
}

function RewardCard({
  moment,
  remaining,
  onDone,
}: {
  moment: RewardMoment;
  remaining: number;
  onDone: () => void;
}) {
  const [
    leaving,
    setLeaving,
  ] = useState(false);

  const closed =
    useRef(false);

  const close = useCallback(() => {
    if (closed.current) {
      return;
    }

    closed.current = true;

    setLeaving(true);

    window.setTimeout(
      onDone,
      EXIT_MS
    );
  }, [onDone]);

  useEffect(() => {
    if (moment.dp >= 0) {
      play("coins");
    }
  }, [moment]);

  useEffect(() => {
    const timer =
      window.setTimeout(
        close,
        AUTO_DISMISS_MS
      );

    return () =>
      window.clearTimeout(timer);
  }, [close]);

  const visibleLines =
    moment.lines.slice(0, 3);

  const hiddenLines =
    moment.lines.length -
    visibleLines.length;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-[var(--dc-radius-lg)] border border-[rgb(255_216_110/.45)] bg-[var(--dc-glass-strong)] p-4 shadow-[0_24px_60px_rgb(2_4_14/.6),0_0_40px_rgb(242_196_90/.18)] backdrop-blur-xl transition-[opacity,transform] duration-300 ease-[cubic-bezier(.23,1,.32,1)] starting:-translate-y-3 starting:scale-[.97] starting:opacity-0 motion-reduce:transform-none motion-reduce:transition-opacity motion-reduce:starting:transform-none ${
        leaving
          ? "-translate-y-2 opacity-0 duration-[180ms] ease-in motion-reduce:translate-y-0"
          : "translate-y-0 scale-100 opacity-100"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-amber-300/20 blur-3xl"
      />

      <div className="relative flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-300/10 text-amber-300 shadow-[0_0_20px_rgb(242_196_90/.25)]">
          {moment.corrected ? (
            <Undo2
              size={20}
            />
          ) : moment.dp > 0 ? (
            <Sparkles
              size={20}
            />
          ) : (
            <Gift
              size={20}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-amber-300/80">
            {moment.corrected
              ? "Result corrected"
              : "Reward"}
          </p>

          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {moment.dp > 0 && (
              <p className="gold-text font-display text-2xl font-black leading-tight">
                +
                <CountUp
                  value={moment.dp}
                />{" "}
                DP
              </p>
            )}

            {moment.dp < 0 && (
              <p className="font-display text-2xl font-black leading-tight text-red-300">
                −
                <CountUp
                  value={Math.abs(
                    moment.dp
                  )}
                />{" "}
                DP
              </p>
            )}

            {moment.packs.map(
              (pack) => (
                <span
                  key={pack.label}
                  className="inline-flex items-center gap-1 rounded-full border border-violet-300/30 bg-violet-300/10 px-2 py-0.5 text-[11px] font-black text-violet-100"
                >
                  <Package
                    size={11}
                  />
                  {pack.quantity > 1
                    ? `${pack.quantity}× `
                    : "+ "}
                  {pack.label}
                </span>
              )
            )}
          </div>

          {visibleLines.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {visibleLines.map(
                (line) => (
                  <li
                    key={line}
                    className="text-xs leading-5 text-zinc-300"
                  >
                    {line}
                  </li>
                )
              )}

              {hiddenLines > 0 && (
                <li className="text-[11px] text-zinc-500">
                  +{hiddenLines} more in your wallet
                </li>
              )}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={close}
              className="primary-button px-4 py-2 text-xs"
            >
              {moment.dp < 0
                ? remaining > 0
                  ? `OK (${remaining} more)`
                  : "OK"
                : remaining > 0
                  ? `Nice! (${remaining} more)`
                  : "Nice!"}
            </button>

            <Link
              href="/wallet"
              onClick={close}
              className="inline-flex items-center gap-1.5 rounded-[var(--dc-radius-md)] border border-white/10 px-3 py-2 text-xs font-black text-zinc-300 transition-colors hover:border-amber-300/30 hover:text-amber-200"
            >
              <Coins
                size={13}
              />
              Wallet
            </Link>
          </div>
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Dismiss reward"
          className="-m-1 shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <X
            size={16}
          />
        </button>
      </div>
    </div>
  );
}

function RewardPopupInner({
  userId,
}: {
  userId: string;
}) {
  const pathname =
    usePathname();

  const searchParams =
    useSearchParams();

  const search =
    searchParams.toString();

  const [
    queue,
    setQueue,
  ] = useState<RewardMoment[]>([]);

  const checking =
    useRef(false);

  const again =
    useRef(false);

  const seenIds =
    useRef<Set<string>>(new Set());

  const check = useCallback(async () => {
    if (checking.current) {
      again.current = true;
      return;
    }

    checking.current = true;

    try {
      do {
        again.current = false;

        const marker =
          readMarker(userId);

        for (const id of marker?.ids ?? []) {
          seenIds.current.add(id);
        }

        const result =
          await getRecentRewards(
            marker?.at ?? null
          );

        const fresh =
          result.moments.filter(
            (moment) =>
              moment.ids.some(
                (id) => !seenIds.current.has(id)
              )
          );

        for (const moment of result.moments) {
          for (const id of moment.ids) {
            seenIds.current.add(id);
          }
        }

        // Clock-skew safety margin when nothing new arrived: the
        // id list above still prevents a repeat.
        const fallbackAt =
          new Date(
            Date.parse(result.now) - 5000
          ).toISOString();

        writeMarker(userId, {
          at:
            result.latestAt ??
            marker?.at ??
            fallbackAt,
          ids: Array.from(
            seenIds.current
          ).slice(-MAX_REMEMBERED_IDS),
        });

        if (fresh.length > 0) {
          setQueue(
            (current) => [
              ...current,
              ...fresh,
            ]
          );
        }
      } while (again.current);
    } catch {
      // Network/auth hiccup: try again on the next page change.
    } finally {
      checking.current = false;
    }
  }, [userId]);

  useEffect(() => {
    void check();
  }, [check, pathname, search]);

  useEffect(() => {
    function onCheck() {
      void check();
    }

    function onVisible() {
      if (document.visibilityState === "visible") {
        void check();
      }
    }

    window.addEventListener(
      REWARDS_CHECK_EVENT,
      onCheck
    );

    document.addEventListener(
      "visibilitychange",
      onVisible
    );

    return () => {
      window.removeEventListener(
        REWARDS_CHECK_EVENT,
        onCheck
      );

      document.removeEventListener(
        "visibilitychange",
        onVisible
      );
    };
  }, [check]);

  const current =
    queue[0];

  const handleDone = useCallback(() => {
    setQueue(
      (items) => items.slice(1)
    );
  }, []);

  if (!current) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
      <RewardCard
        key={current.key}
        moment={current}
        remaining={queue.length - 1}
        onDone={handleDone}
      />
    </div>
  );
}

export function RewardPopup({
  userId,
}: {
  userId: string;
}) {
  return (
    <Suspense fallback={null}>
      <RewardPopupInner
        userId={userId}
      />
    </Suspense>
  );
}
