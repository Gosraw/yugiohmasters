"use client";

import {
  Flag,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Undo2,
} from "lucide-react";

import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

import {
  CELLS,
  MAX_INPUTS,
  SIZE,
  UNDO_TIER,
  applyInput,
  canUndo,
  createMerge,
  finishInputs,
  isOver,
  isStuck,
  replayMerge,
  tileValue,
  type Dir,
  type MergeInput,
  type MergeInputs,
  type MergeState,
  type RunEnd,
} from "@/lib/games/merge-engine";

import type {
  SubmitGameRunResult,
} from "@/lib/games/server-runs";

import {
  play,
} from "@/lib/sound";

import {
  TileBadge,
  TileIcon,
  tierName,
  tierOf,
} from "./merge-tiles";

import styles from "./merge-play.module.css";

// =========================================================
// MERGE OF RA - the full-screen play view (and its game-over
// card, so "Play again" restarts without leaving the board).
//
// Turn based: every swipe / arrow key / WASD is one engine input,
// applied at once and recorded (L R U D, Z = rewind). Tiles are
// DOM elements moved with a CSS transform (110 ms slide), so a
// move is one transition; while it runs at most ONE more move is
// queued and applied when the slide ends (extra inputs are
// dropped). The page never scrolls while the board is open.
//
// The input log is saved to localStorage after every move, so a
// killed tab can resume the run (the seed is on the server).
// =========================================================

const SLIDE_MS = 110;

const SAVE_KEY = "dc.merge.openRun.v1";

/** Tap-anywhere restart is ignored this long after the card shows. */
const RESTART_GUARD_MS = 650;

/** Finger travel (px) before a swipe counts. */
const SWIPE_MIN = 22;

/** One axis must beat the other by this factor (direction lock)... */
const SWIPE_LOCK = 1.3;

/** ...unless the finger travelled this far (then the larger wins). */
const SWIPE_DECIDE = 60;

/** A short beat to look at the full board before the card. */
const OVER_DELAY_MS = 700;

/** Tiers from here on get a "new tile" banner (Pyramid 128). */
const BANNER_TIER = 7;

const KEY_DIR: Record<string, Dir> = {
  ArrowLeft: "L",
  ArrowRight: "R",
  ArrowUp: "U",
  ArrowDown: "D",
  a: "L",
  A: "L",
  d: "R",
  D: "R",
  w: "U",
  W: "U",
  s: "D",
  S: "D",
};

const COMBO_NAME: Record<number, string> = {
  2: "Double merge",
  3: "Triple merge",
  4: "Quad merge",
};

export type SavedMergeRun = {
  runId: string;
  mode: "daily" | "practice";
  log: string;
  score: number;
  savedAt: number;
};

export function readSavedMergeRun(): SavedMergeRun | null {
  try {
    const raw =
      window.localStorage.getItem(SAVE_KEY);

    if (!raw) return null;

    const parsed =
      JSON.parse(raw) as SavedMergeRun;

    if (
      typeof parsed?.runId !== "string" ||
      typeof parsed?.log !== "string"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedMergeRun() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

function writeSavedMergeRun(
  run: SavedMergeRun
) {
  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(run)
    );
  } catch {
    // Storage full / blocked: resume just won't be offered.
  }
}

export type MergeRun = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  resume: SavedMergeRun | null;
  /** Your weekly best when the run started. */
  previousBest: number | null;
};

export type MergeOutcome = {
  score: number;
  inputs: MergeInputs;
  maxExp: number;
  moves: number;
  bestCombo: number;
  crashed?: boolean;
};

export type MergeResult = {
  mode: "daily" | "practice";
  end?: RunEnd;
  score: number;
  maxExp: number;
  moves: number;
  bestCombo: number;
  previousBest: number | null;
  /** null while the server replays the run. */
  response: SubmitGameRunResult | null;
};

type Props = {
  run: MergeRun;
  result: MergeResult | null;
  canPlayAgain: boolean;
  starting: boolean;
  error: string | null;
  onFinished: (outcome: MergeOutcome) => void;
  /** Ended before the first move: the run is still open. */
  onAbandon: () => void;
  onPlayAgain: () => void;
  onExit: () => void;
  crashRef?: RefObject<(() => void) | null>;
};

type TileAnim =
  | "idle"
  | "spawn"
  | "merged"
  | "gone"
  | "rewind";

type TileView = {
  id: number;
  exp: number;
  cell: number;
  anim: TileAnim;
};

type Floater = {
  id: number;
  text: string;
  big: boolean;
};

type Banner = {
  key: number;
  exp: number;
  title: string;
  note: string;
};

const ANIM_CLASS: Record<TileAnim, string> = {
  idle: "",
  spawn: styles.spawn,
  merged: styles.merged,
  gone: styles.gone,
  rewind: styles.rewind,
};

/** Bump (px) when a direction can't move anything. */
const NUDGE: Record<Dir, [number, number]> = {
  L: [-6, 0],
  R: [6, 0],
  U: [0, -6],
  D: [0, 6],
};

const STARS = Array.from(
  {
    length: 26,
  },
  (_, index) => ({
    left: (index * 37.3) % 100,
    top: (index * 23.7) % 62,
    size: index % 5 === 0
      ? 2
      : 1,
    opacity: 0.25 + ((index * 13) % 10) / 20,
  })
);

/** Catches a render crash: ends the run with the moves so far. */
export class MergeCrashGuard extends Component<
  {
    children: ReactNode;
    onCrash: () => void;
  },
  {
    crashed: boolean;
  }
> {
  state = {
    crashed: false,
  };

  static getDerivedStateFromError() {
    return {
      crashed: true,
    };
  }

  componentDidCatch(
    error: unknown
  ) {
    console.error("Merge of Ra crashed", error);
    this.props.onCrash();
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[rgb(3_5_15/.94)] px-6 text-center text-sm text-zinc-300">
          Something went wrong. Saving your board...
        </div>
      );
    }

    return this.props.children;
  }
}

function tilesFromBoard(
  board: number[],
  firstId: number,
  anim: TileAnim
): TileView[] {
  const tiles: TileView[] = [];

  for (let cell = 0; cell < CELLS; cell++) {
    if (board[cell] > 0) {
      tiles.push({
        id: firstId + tiles.length,
        exp: board[cell],
        cell,
        anim,
      });
    }
  }

  return tiles;
}

function cellStyle(
  cell: number
) {
  return {
    "--r": Math.floor(cell / SIZE),
    "--c": cell % SIZE,
  } as CSSProperties;
}

function MergeTile({
  tile,
}: {
  tile: TileView;
}) {
  const tier =
    tierOf(tile.exp);

  const value =
    tileValue(tile.exp);

  const digits =
    String(value).length;

  return (
    <div
      className={`${styles.tile} ${ANIM_CLASS[tile.anim]}`}
      style={cellStyle(tile.cell)}
    >
      <div
        className={styles.face}
        style={{
          "--from": tier.from,
          "--to": tier.to,
          "--ink": tier.ink,
          "--rim": tier.rim,
          "--glow": tier.glow,
        } as CSSProperties}
      >
        <TileIcon
          exp={tile.exp}
          className={styles.icon}
        />

        <span
          className={`${styles.value} ${digits >= 5 ? styles.value5 : digits === 4 ? styles.value4 : ""}`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export function MergePlay({
  run,
  result,
  canPlayAgain,
  starting,
  error,
  onFinished,
  onAbandon,
  onPlayAgain,
  onExit,
  crashRef,
}: Props) {
  const wrapperRef =
    useRef<HTMLDivElement>(null);

  const boardRef =
    useRef<HTMLDivElement>(null);

  const againRef =
    useRef<HTMLButtonElement>(null);

  const [tiles, setTiles] =
    useState<TileView[]>([]);

  const [score, setScore] =
    useState(0);

  const [maxExp, setMaxExp] =
    useState(1);

  const [undo, setUndo] =
    useState<"locked" | "ready" | "used">("locked");

  const [stuck, setStuck] =
    useState(false);

  const [menu, setMenu] =
    useState(false);

  const menuRef =
    useRef(false);

  const [confirmEnd, setConfirmEnd] =
    useState(false);

  const [floaters, setFloaters] =
    useState<Floater[]>([]);

  const [combo, setCombo] =
    useState<{ key: number; text: string } | null>(null);

  const [banner, setBanner] =
    useState<Banner | null>(null);

  const [passedBest, setPassedBest] =
    useState(false);

  const stateRef =
    useRef<MergeState | null>(null);

  const finishedRef =
    useRef(false);

  const finishRef =
    useRef<(crashed?: boolean) => void>(() => {});

  const inputRef =
    useRef<(input: MergeInput) => void>(() => {});

  const resultShownAt =
    useRef(0);

  const onFinishedRef =
    useRef(onFinished);

  const onAbandonRef =
    useRef(onAbandon);

  const onPlayAgainRef =
    useRef(onPlayAgain);

  const canRestartRef =
    useRef(false);

  useEffect(() => {
    onFinishedRef.current = onFinished;
    onAbandonRef.current = onAbandon;
    onPlayAgainRef.current = onPlayAgain;
  }, [onFinished, onAbandon, onPlayAgain]);

  const resultReady =
    result !== null &&
    result.response !== null;

  useEffect(() => {
    canRestartRef.current =
      resultReady &&
      canPlayAgain &&
      !starting;

    if (resultReady) {
      resultShownAt.current = performance.now();
      againRef.current?.focus({
        preventScroll: true,
      });
    }
  }, [resultReady, canPlayAgain, starting]);

  const openMenu = useCallback((
    value: boolean
  ) => {
    if (finishedRef.current) return;

    menuRef.current = value;
    setMenu(value);
    setConfirmEnd(false);
  }, []);

  // ---------------------------------------------------------
  // Main effect: one per run (a new run id restarts in place).
  // ---------------------------------------------------------

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) return;

    const reducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const slideMs = reducedMotion
      ? 0
      : SLIDE_MS;

    const saved =
      run.resume &&
      run.resume.runId === run.runId
        ? run.resume
        : null;

    let state: MergeState =
      createMerge(run.seed);

    let log = "";

    if (saved && saved.log.length > 0) {
      const replay =
        replayMerge(
          run.seed,
          saved.log
        );

      if (replay.failedAt < 0) {
        state = replay.state;
        log = saved.log;
      }
    }

    stateRef.current = state;
    finishedRef.current = false;
    menuRef.current = false;

    let nextId = 1;

    const initial =
      tilesFromBoard(
        state.board,
        nextId,
        "spawn"
      );

    nextId += initial.length;

    setTiles(initial);
    setMenu(false);
    setConfirmEnd(false);
    setFloaters([]);
    setCombo(null);
    setBanner(null);
    setPassedBest(false);

    const best =
      run.previousBest ?? 0;

    let bestPassed =
      best > 0 &&
      state.score > best;

    let bannerKey = 0;
    let floaterKey = 0;
    let shownMax = state.maxExp;
    let busyUntil = 0;
    let queued: MergeInput | null = null;

    const timers = new Set<number>();

    const later = (
      fn: () => void,
      ms: number
    ) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);

      timers.add(id);
    };

    const sync = () => {
      setScore(state.score);
      setMaxExp(Math.max(1, state.maxExp));
      setUndo(
        canUndo(state)
          ? "ready"
          : state.undoEarned
            ? "used"
            : "locked"
      );
      setStuck(
        isStuck(state) &&
        canUndo(state)
      );
    };

    sync();
    setPassedBest(bestPassed);

    const save = () => {
      if (
        finishedRef.current ||
        log.length === 0
      ) {
        return;
      }

      writeSavedMergeRun({
        runId: run.runId,
        mode: run.mode,
        log,
        score: state.score,
        savedAt: Date.now(),
      });
    };

    const finish = (
      crashed = false
    ) => {
      if (finishedRef.current) return;

      finishedRef.current = true;
      menuRef.current = false;
      setMenu(false);

      if (log.length === 0) {
        onAbandonRef.current();
        return;
      }

      clearSavedMergeRun();

      const end: RunEnd =
        isOver(state)
          ? "over"
          : "quit";

      onFinishedRef.current({
        score: state.score,
        inputs: finishInputs(log, end),
        maxExp: state.maxExp,
        moves: state.moves,
        bestCombo: state.bestCombo,
        crashed,
      });
    };

    finishRef.current = finish;

    const canVibrate =
      typeof navigator.vibrate === "function";

    const buzz = (
      pattern: number | number[]
    ) => {
      if (canVibrate) {
        try {
          navigator.vibrate(pattern);
        } catch {
          // Not allowed here; fine.
        }
      }
    };

    const addFloater = (
      text: string,
      big: boolean
    ) => {
      floaterKey += 1;

      const id = floaterKey;

      setFloaters((list) => [
        ...list.slice(-3),
        {
          id,
          text,
          big,
        },
      ]);

      later(() => {
        setFloaters((list) => list.filter((item) => item.id !== id));
      }, 900);
    };

    const showBanner = (
      exp: number,
      title: string,
      note: string
    ) => {
      bannerKey += 1;

      setBanner({
        key: bannerKey,
        exp,
        title,
        note,
      });
    };

    const applyNow = (
      input: MergeInput
    ) => {
      if (finishedRef.current) return;

      const moveResult =
        applyInput(
          state,
          input
        );

      if (!moveResult) {
        // A direction that moves nothing: a small bump, no move.
        const boardEl =
          boardRef.current;

        if (
          input !== "Z" &&
          boardEl &&
          !reducedMotion
        ) {
          const [x, y] =
            NUDGE[input];

          boardEl.animate(
            [
              {
                transform: "translate(0, 0)",
              },
              {
                transform: `translate(${x}px, ${y}px)`,
                offset: 0.4,
              },
              {
                transform: "translate(0, 0)",
              },
            ],
            {
              duration: 170,
              easing: "ease-out",
            }
          );
        }

        return;
      }

      log += input;
      busyUntil = performance.now() + slideMs;

      if (moveResult.kind === "undo") {
        const restored =
          tilesFromBoard(
            state.board,
            nextId,
            "rewind"
          );

        nextId += restored.length;

        setTiles(restored);
        setCombo(null);
        play("whoosh", 0, 0.45);
        buzz([12, 40, 12]);
        showBanner(UNDO_TIER, "Rewind used", "The last move is undone");
      } else {
        const mergeIds =
          moveResult.merges.map(() => nextId++);

        const spawnId =
          nextId++;

        setTiles((previous) => {
          const live =
            previous.filter((tile) => tile.anim !== "gone");

          const byCell =
            new Map(live.map((tile) => [tile.cell, tile]));

          const next: TileView[] = [];

          for (const slide of moveResult.slides) {
            const tile =
              byCell.get(slide.from);

            if (!tile) continue;

            next.push({
              ...tile,
              cell: slide.to,
              anim: slide.merged
                ? "gone"
                : "idle",
            });
          }

          moveResult.merges.forEach((merge, index) => {
            next.push({
              id: mergeIds[index],
              exp: merge.exp,
              cell: merge.cell,
              anim: "merged",
            });
          });

          if (moveResult.spawn) {
            next.push({
              id: spawnId,
              exp: moveResult.spawn.exp,
              cell: moveResult.spawn.cell,
              anim: "spawn",
            });
          }

          return next;
        });

        later(() => {
          setTiles((previous) => previous.filter((tile) => tile.anim !== "gone"));
        }, slideMs + 40);

        const gained =
          moveResult.points + moveResult.bonus;

        const mergeCount =
          moveResult.merges.length;

        if (gained > 0) {
          addFloater(`+${gained.toLocaleString("en-US")}`, mergeCount >= 2);

          const top =
            Math.max(...moveResult.merges.map((merge) => merge.exp));

          // Higher tiles, higher note.
          play("tap", 0, 0.32, Math.min(1.8, 0.85 + top * 0.07));
          buzz(top >= BANNER_TIER ? [10, 30, 14] : 8);
        }

        if (mergeCount >= 2) {
          setCombo({
            key: performance.now(),
            text: `${COMBO_NAME[mergeCount] ?? `${mergeCount}× merge`} +${moveResult.bonus}`,
          });

          if (mergeCount >= 3) {
            play("chime", 40, 0.35, Math.min(1.7, 1 + (mergeCount - 2) * 0.12));
          }
        }

        const fresh =
          moveResult.newTiers.filter((exp) => exp > shownMax);

        if (fresh.length > 0) {
          const top =
            Math.max(...fresh);

          shownMax = Math.max(shownMax, top);

          if (moveResult.earnedUndo) {
            showBanner(top, tierName(top), "Rewind earned: undo one move");
            play("rise", 60, 0.4);
            play("chime", 160, 0.4, 1.2);
          } else if (top >= BANNER_TIER) {
            showBanner(top, tierName(top), `New tile · ${tileValue(top).toLocaleString("en-US")}`);
            play("rise", 60, 0.4);
          }
        }

        if (
          !bestPassed &&
          best > 0 &&
          state.score > best
        ) {
          bestPassed = true;
          setPassedBest(true);
          play("coins", 120, 0.4);
        }
      }

      sync();
      save();

      if (isOver(state)) {
        buzz([30, 40, 30]);
        later(() => finish(), slideMs + OVER_DELAY_MS);
      } else if (state.inputs >= MAX_INPUTS) {
        later(() => finish(), slideMs + OVER_DELAY_MS);
      }
    };

    const flush = () => {
      const next = queued;

      queued = null;

      if (next) applyNow(next);
    };

    const input = (
      move: MergeInput
    ) => {
      if (
        finishedRef.current ||
        menuRef.current
      ) {
        return;
      }

      const now =
        performance.now();

      if (now < busyUntil) {
        // One move may wait for the slide to end; more are dropped.
        if (queued === null) {
          queued = move;
          later(flush, busyUntil - now);
        }

        return;
      }

      applyNow(move);
    };

    inputRef.current = input;

    const restart = () => {
      const elapsed =
        performance.now() - resultShownAt.current;

      if (
        canRestartRef.current &&
        elapsed > RESTART_GUARD_MS
      ) {
        onPlayAgainRef.current();
      }
    };

    // ---- keyboard ----
    const onKeyDown = (
      event: KeyboardEvent
    ) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const dir =
        KEY_DIR[event.key];

      if (
        event.key === "Escape" ||
        event.key === "p" ||
        event.key === "P"
      ) {
        if (!finishedRef.current) {
          openMenu(!menuRef.current);
        }

        return;
      }

      if (finishedRef.current) {
        if (dir) event.preventDefault();

        if (
          (event.key === " " || event.key === "Enter") &&
          !(event.target instanceof HTMLButtonElement)
        ) {
          event.preventDefault();
          restart();
        }

        return;
      }

      if (menuRef.current) return;

      if (dir) {
        event.preventDefault();

        if (event.repeat) return;

        input(dir);
        return;
      }

      if (
        event.key === "z" ||
        event.key === "Z" ||
        event.key === "u" ||
        event.key === "U" ||
        event.key === "Backspace"
      ) {
        event.preventDefault();

        if (
          !event.repeat &&
          canUndo(state)
        ) {
          input("Z");
        }
      }
    };

    // ---- swipe (touch, pen or mouse drag) ----
    let swipe: {
      id: number;
      x: number;
      y: number;
      fired: boolean;
    } | null = null;

    const decide = (
      dx: number,
      dy: number,
      lenient: boolean
    ): Dir | null => {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const distance = Math.max(ax, ay);

      if (distance < (lenient ? SWIPE_MIN * 0.75 : SWIPE_MIN)) return null;

      if (
        ax < ay * SWIPE_LOCK &&
        ay < ax * SWIPE_LOCK &&
        distance < SWIPE_DECIDE &&
        !lenient
      ) {
        // Diagonal so far: wait for the finger to pick an axis.
        return null;
      }

      return ax > ay
        ? dx > 0
          ? "R"
          : "L"
        : dy > 0
          ? "D"
          : "U";
    };

    const onPointerDown = (
      event: PointerEvent
    ) => {
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, [data-merge-ui]")
      ) {
        return;
      }

      if (
        !event.isPrimary ||
        event.button !== 0
      ) {
        return;
      }

      event.preventDefault();

      if (finishedRef.current) {
        restart();
        return;
      }

      swipe = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        fired: false,
      };
    };

    const onPointerMove = (
      event: PointerEvent
    ) => {
      if (
        !swipe ||
        swipe.fired ||
        event.pointerId !== swipe.id
      ) {
        return;
      }

      const dir =
        decide(
          event.clientX - swipe.x,
          event.clientY - swipe.y,
          false
        );

      if (dir) {
        swipe.fired = true;
        input(dir);
      }
    };

    const onPointerUp = (
      event: PointerEvent
    ) => {
      if (
        !swipe ||
        event.pointerId !== swipe.id
      ) {
        return;
      }

      if (
        !swipe.fired &&
        event.type === "pointerup"
      ) {
        const dir =
          decide(
            event.clientX - swipe.x,
            event.clientY - swipe.y,
            true
          );

        if (dir) input(dir);
      }

      swipe = null;
    };

    window.addEventListener("keydown", onKeyDown);
    wrapper.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    const onHide = () => save();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);

    let wakeLock: { release: () => Promise<void> } | null = null;

    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (type: "screen") => Promise<{ release: () => Promise<void> }>;
      };
    };

    nav.wakeLock?.request("screen").then(
      (lock) => {
        wakeLock = lock;
      },
      () => {}
    );

    if (crashRef) {
      crashRef.current = () => finish(true);
    }

    // A resumed run that was already over: hand it in.
    if (
      log.length > 0 &&
      isOver(state)
    ) {
      later(() => finish(), OVER_DELAY_MS);
    }

    const html = document.documentElement;
    const previousOverscroll = html.style.overscrollBehavior;
    const previousOverflow = document.body.style.overflow;
    html.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      if (crashRef) crashRef.current = null;
      inputRef.current = () => {};
      window.removeEventListener("keydown", onKeyDown);
      wrapper.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      wakeLock?.release().catch(() => {});
      html.style.overscrollBehavior = previousOverscroll;
      document.body.style.overflow = previousOverflow;
    };
    // One effect per run; previousBest / mode are read once at its start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.runId, run.seed]);

  const endRun = () => {
    if (finishedRef.current) return;
    finishRef.current();
  };

  const rewind = () => {
    inputRef.current("Z");
  };

  const response =
    result?.response ?? null;

  const newBest =
    result !== null &&
    response?.ok === true &&
    result.score > 0 &&
    (result.previousBest === null || result.score > result.previousBest);

  const best =
    Math.max(
      run.previousBest ?? 0,
      passedBest
        ? score
        : 0
    );

  const modeLabel =
    run.mode === "daily"
      ? "Daily Merge"
      : "Practice";

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-[55] flex h-[100dvh] w-full touch-none select-none justify-center overflow-hidden overscroll-none bg-[radial-gradient(ellipse_at_center,#0b1230_0%,#03050f_70%)] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]"
    >
      {/* Portrait column: the whole screen on a phone, a centred
          strip on a wide window. */}
      <div
        className={`${styles.column} @container relative flex h-full w-full max-w-[calc(100dvh*0.62)] touch-none select-none flex-col overflow-hidden overscroll-none bg-[linear-gradient(180deg,#070a1c_0%,#0d1030_45%,#1a1026_100%)] shadow-[0_0_0_1px_rgba(242,196,90,.18),0_0_60px_rgba(0,0,0,.6)]`}
        role="application"
        aria-label="Merge of Ra. Swipe or use the arrow keys or WASD to slide the tiles; equal tiles merge."
      >
        {/* Night Temple backdrop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          {STARS.map(
            (star, index) => (
              <span
                key={index}
                className="absolute rounded-full bg-[#fff3c8]"
                style={{
                  left: `${star.left}%`,
                  top: `${star.top}%`,
                  width: star.size,
                  height: star.size,
                  opacity: star.opacity,
                }}
              />
            )
          )}

          <div
            className={`${styles.sun} absolute left-1/2 top-[46%] h-[70%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(242,160,60,.16),rgba(242,160,60,0))]`}
          />

          <svg
            viewBox="0 0 400 120"
            preserveAspectRatio="none"
            className="absolute inset-x-0 bottom-0 h-[16%] w-full opacity-70"
          >
            <path
              d="M0 120 L70 62 L140 120 Z M110 120 L215 30 L320 120 Z M270 120 L340 70 L400 110 L400 120 Z"
              fill="#140d1f"
              stroke="rgba(242,196,90,.18)"
              strokeWidth="1"
            />
          </svg>
        </div>

        {/* HUD */}
        <div className={`${styles.hud} relative z-10 shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)]`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[.22em] text-amber-200/75">
              {modeLabel}
            </p>

            {
              !result
                ? (
                    <button
                      type="button"
                      onClick={() => openMenu(!menu)}
                      aria-label={
                        menu
                          ? "Back to the board"
                          : "Menu"
                      }
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(242_196_90/.35)] bg-[rgb(6_9_22/.6)] text-amber-200 backdrop-blur-sm transition-transform duration-100 active:scale-95"
                    >
                      {
                        menu
                          ? <Play size={18} />
                          : <Pause size={18} />
                      }
                    </button>
                  )
                : <span className="h-11" />
            }
          </div>

          <div className="mt-1 grid grid-cols-2 gap-2.5">
            <div className="relative rounded-2xl border border-[rgb(242_196_90/.3)] bg-[rgb(6_9_22/.55)] px-3 py-2 text-center backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-300/80">
                Score
              </p>

              <p
                aria-live="polite"
                className="font-display text-3xl font-black leading-tight tabular-nums text-[#fff3c8]"
              >
                {score.toLocaleString("en-US")}
              </p>

              <div className="pointer-events-none absolute right-3 top-1 h-0 w-0">
                {floaters.map(
                  (floater) => (
                    <span
                      key={floater.id}
                      className={`${styles.floater} absolute bottom-0 right-0 whitespace-nowrap font-display font-black tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,.7)] ${floater.big ? "text-base text-amber-200" : "text-sm text-amber-100/90"}`}
                    >
                      {floater.text}
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[rgb(6_9_22/.45)] px-3 py-2 text-center backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-zinc-400">
                {
                  run.mode === "daily"
                    ? "Practice best"
                    : "Best"
                }
              </p>

              <p className="font-display text-3xl font-black leading-tight tabular-nums text-zinc-200">
                {
                  best > 0
                    ? best.toLocaleString("en-US")
                    : "–"
                }
              </p>
            </div>
          </div>

          <div className="mt-2.5 flex min-h-8 items-center justify-center gap-2">
            <TileBadge
              exp={maxExp}
              size={26}
            />

            <p className="text-xs font-semibold text-zinc-300">
              Highest:
              {" "}
              <span className="font-bold text-amber-100">
                {tierName(maxExp)}
              </span>
              {" · "}
              {tileValue(maxExp).toLocaleString("en-US")}
            </p>

            {
              passedBest && !result
                ? (
                    <span className="rounded-full border border-amber-300/50 bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.16em] text-amber-200">
                      {
                        run.mode === "daily"
                          ? "Past best"
                          : "New best"
                      }
                    </span>
                  )
                : null
            }
          </div>
        </div>

        {/* BOARD: as large as fits, always square. */}
        <div className={`${styles.boardArea} relative z-10 flex min-h-0 flex-1 items-center justify-center px-4 py-3 [container-type:size]`}>
          <div
            className="w-[min(100cqw,100cqh,520px)]"
          >
            <div
              ref={boardRef}
              className={styles.board}
            >
              {Array.from(
                {
                  length: CELLS,
                },
                (_, cell) => (
                  <div
                    key={cell}
                    className={styles.slot}
                    style={cellStyle(cell)}
                  />
                )
              )}

              {tiles.map(
                (tile) => (
                  <MergeTile
                    key={tile.id}
                    tile={tile}
                  />
                )
              )}
            </div>
          </div>

          {/* Combo callout */}
          {
            combo && !result
              ? (
                  <p
                    key={combo.key}
                    className={`${styles.combo} pointer-events-none absolute left-1/2 top-1 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300/50 bg-[rgb(6_9_22/.75)] px-3 py-1 text-xs font-black uppercase tracking-[.18em] text-amber-200 backdrop-blur-sm`}
                  >
                    {combo.text}
                  </p>
                )
              : null
          }

          {/* Milestone banner */}
          {
            banner && !result
              ? (
                  <div
                    key={banner.key}
                    className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6"
                  >
                    <div className={`${styles.banner} flex items-center gap-3 rounded-2xl border border-[rgb(242_196_90/.55)] bg-[rgb(6_9_22/.82)] px-4 py-3 shadow-[0_0_40px_rgba(242,160,60,.35)] backdrop-blur-sm`}>
                      <TileBadge
                        exp={banner.exp}
                        size={48}
                      />

                      <div className="min-w-0">
                        <p className="gold-text truncate font-display text-xl font-black leading-tight">
                          {banner.title}
                        </p>

                        <p className="text-xs font-semibold text-amber-100/85">
                          {banner.note}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              : null
          }
        </div>

        {/* Bottom bar: rewind + controls hint */}
        <div className={`${styles.bottomBar} relative z-10 shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+14px)]`}>
          <button
            type="button"
            onClick={rewind}
            disabled={undo !== "ready" || result !== null}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-transform duration-100 active:scale-[.98] ${
              undo === "ready"
                ? "border-amber-300/60 bg-amber-300/15 text-amber-100 shadow-[0_0_20px_rgba(242,196,90,.25)]"
                : "border-white/10 bg-white/[.03] text-zinc-500"
            }`}
          >
            <Undo2
              size={16}
            />
            {
              undo === "ready"
                ? "Rewind last move"
                : undo === "used"
                  ? "Rewind used"
                  : "Rewind: unlocks at Millennium Rod (512)"
            }
          </button>

          <p className="mt-2 text-center text-[11px] text-zinc-500">
            <span className="pointer-fine:hidden">
              Swipe to slide the tiles
            </span>
            <span className="hidden pointer-fine:inline">
              Arrow keys or WASD · Z rewinds · P menu
            </span>
          </p>
        </div>

        {/* Stuck, but the rewind can save the run */}
        {
          stuck && !menu && !result
            ? (
                <div
                  data-merge-ui
                  className="absolute inset-0 z-20 flex items-center justify-center bg-[rgb(3_5_15/.6)] px-6 backdrop-blur-[2px]"
                >
                  <div className="panel w-full max-w-xs p-5 text-center">
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      No moves left
                    </p>

                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                      Your Millennium Rod can still take back the last move.
                    </p>

                    <div className="mt-4 grid gap-2">
                      <button
                        type="button"
                        autoFocus
                        onClick={rewind}
                        className="primary-button flex w-full items-center justify-center gap-2"
                      >
                        <Undo2
                          size={16}
                        />
                        Rewind
                      </button>

                      <button
                        type="button"
                        onClick={endRun}
                        className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 active:scale-[.98]"
                      >
                        <Flag
                          size={15}
                        />
                        End run
                      </button>
                    </div>
                  </div>
                </div>
              )
            : null
        }

        {/* Menu */}
        {
          menu && !result
            ? (
                <div
                  data-merge-ui
                  className="absolute inset-0 z-20 flex items-center justify-center bg-[rgb(3_5_15/.72)] px-6 backdrop-blur-[2px]"
                >
                  <div className="panel w-full max-w-xs p-5 text-center">
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      {modeLabel}
                    </p>

                    <p className="gold-text mt-2 font-display text-3xl font-black tabular-nums">
                      {score.toLocaleString("en-US")} pts
                    </p>

                    {
                      confirmEnd
                        ? (
                            <>
                              <p className="mt-3 text-sm leading-6 text-zinc-300">
                                {
                                  run.mode === "daily"
                                    ? "End your Daily Merge here? This becomes your score for today."
                                    : "End this run here? This score counts for the weekly board."
                                }
                              </p>

                              <div className="mt-4 grid gap-2">
                                <button
                                  type="button"
                                  onClick={endRun}
                                  className="primary-button flex w-full items-center justify-center gap-2"
                                >
                                  End run
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setConfirmEnd(false)}
                                  className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 active:scale-[.98]"
                                >
                                  Keep merging
                                </button>
                              </div>
                            </>
                          )
                        : (
                            <div className="mt-4 grid gap-2">
                              <button
                                type="button"
                                autoFocus
                                onClick={() => openMenu(false)}
                                className="primary-button flex w-full items-center justify-center gap-2"
                              >
                                <Play
                                  size={16}
                                />
                                Back to the board
                              </button>

                              <button
                                type="button"
                                onClick={() => setConfirmEnd(true)}
                                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 active:scale-[.98]"
                              >
                                <Flag
                                  size={15}
                                />
                                End run
                              </button>
                            </div>
                          )
                    }

                    <p className="mt-3 text-[11px] leading-5 text-zinc-500">
                      No timer: take all the time you need to think.
                    </p>
                  </div>
                </div>
              )
            : null
        }

        {/* GAME OVER: on top of the final board. */}
        {
          result
            ? (
                <div className={`${styles.result} absolute inset-x-0 bottom-0 z-30 flex justify-center bg-[linear-gradient(to_top,rgb(3_5_15/.94)_40%,rgb(3_5_15/0))] px-4 pt-24 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]`}>
                  <div
                    data-merge-ui
                    className="panel arena-frame w-full max-w-sm p-5 text-center backdrop-blur-md"
                  >
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      {
                        result.mode === "daily"
                          ? "Daily Merge"
                          : "Practice run"
                      }
                      {
                        result.end === "over"
                          ? " · No moves left"
                          : result.end === "quit"
                            ? " · Ended"
                            : ""
                      }
                    </p>

                    <p className="gold-text mt-1 font-display text-5xl font-black leading-none tabular-nums">
                      {result.score.toLocaleString("en-US")}
                    </p>

                    <p className="mt-1 text-xs font-semibold uppercase tracking-[.2em] text-amber-200/80">
                      pts
                      {" · "}
                      {result.moves} {result.moves === 1 ? "move" : "moves"}
                      {
                        result.bestCombo > 1
                          ? ` · combo ×${result.bestCombo}`
                          : ""
                      }
                    </p>

                    <div className="mt-3 flex items-center justify-center gap-3 rounded-xl border border-[rgb(242_196_90/.25)] bg-[rgb(242_196_90/.06)] px-3 py-2">
                      <TileBadge
                        exp={Math.max(1, result.maxExp)}
                        size={40}
                      />

                      <div className="text-left">
                        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-zinc-400">
                          Highest tile
                        </p>

                        <p className="font-display text-base font-bold text-amber-100">
                          {tierName(Math.max(1, result.maxExp))}
                          <span className="ml-1.5 text-sm font-semibold text-zinc-400">
                            {tileValue(Math.max(1, result.maxExp)).toLocaleString("en-US")}
                          </span>
                        </p>
                      </div>
                    </div>

                    {
                      newBest
                        ? (
                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-amber-300/15 px-3 py-1 text-xs font-bold uppercase tracking-[.18em] text-amber-200">
                              <Sparkles
                                size={13}
                              />
                              {
                                result.mode === "daily"
                                  ? "Beats your practice best"
                                  : "New best this week"
                              }
                            </p>
                          )
                        : null
                    }

                    <div className="mt-3 min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      {
                        !response
                          ? (
                              <p className="flex items-center justify-center gap-2 text-sm text-zinc-300">
                                <Loader2
                                  size={15}
                                  className="animate-spin motion-reduce:animate-none"
                                />
                                Checking your board...
                              </p>
                            )
                          : response.ok
                            ? (
                                <p className="text-sm text-zinc-200">
                                  <span className="font-semibold text-emerald-300">
                                    Verified
                                  </span>
                                  {" · "}
                                  {
                                    response.place
                                      ? `#${response.place} of ${response.players} ${response.mode === "daily" ? "today" : "this week"}`
                                      : "not on the board yet"
                                  }
                                  {
                                    response.mode === "practice" &&
                                    response.best !== null &&
                                    response.best > response.score
                                      ? ` · best ${response.best.toLocaleString("en-US")}`
                                      : ""
                                  }
                                </p>
                              )
                            : (
                                <p className="text-sm text-rose-300">
                                  {response.error}
                                </p>
                              )
                      }
                    </div>

                    <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                      {
                        canPlayAgain
                          ? (
                              <button
                                type="button"
                                ref={againRef}
                                disabled={!response || starting}
                                onClick={onPlayAgain}
                                className="primary-button flex w-full items-center justify-center gap-2 disabled:opacity-60"
                              >
                                {
                                  starting
                                    ? (
                                        <Loader2
                                          size={16}
                                          className="animate-spin motion-reduce:animate-none"
                                        />
                                      )
                                    : (
                                        <RotateCcw
                                          size={16}
                                        />
                                      )
                                }
                                {
                                  result.mode === "practice"
                                    ? "Play again"
                                    : "Practice run"
                                }
                              </button>
                            )
                          : <span />
                      }

                      <button
                        type="button"
                        disabled={!response}
                        onClick={onExit}
                        aria-label="Leaderboard"
                        className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-200 transition-transform duration-100 active:scale-[.98] disabled:opacity-60"
                      >
                        <Trophy
                          size={16}
                        />
                        <span className="hidden @[360px]:inline">
                          Leaderboard
                        </span>
                      </button>
                    </div>

                    {
                      canPlayAgain && response
                        ? (
                            <p className="mt-2 text-[11px] text-zinc-500">
                              <span className="pointer-fine:hidden">
                                Tap the board to play again
                              </span>
                              <span className="hidden pointer-fine:inline">
                                Press Space to play again
                              </span>
                            </p>
                          )
                        : null
                    }

                    {
                      error
                        ? (
                            <p className="mt-2 text-sm text-rose-300">
                              {error}
                            </p>
                          )
                        : null
                    }
                  </div>
                </div>
              )
            : null
        }
      </div>
    </div>
  );
}
