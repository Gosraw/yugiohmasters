"use client";

import {
  Flag,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
} from "lucide-react";

import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  ENGINE_VERSION,
  GRID,
  HAND_SIZE,
  MIN_MOVE_TICKS,
  SHAPES,
  STREAK_GRACE,
  TICKS_PER_SECOND,
  canPlace,
  createTomb,
  encodeMove,
  linesAfter,
  placePiece,
  replayMoves,
  runTicks,
  tombScore,
  type PlaceEvent,
  type RunEnd,
  type TombInputs,
  type TombState,
} from "@/lib/games/tomb-engine";

import type {
  SubmitGameRunResult,
} from "@/lib/games/server-runs";

import {
  play,
} from "@/lib/sound";

import {
  TombBlock,
  TombPiece,
  tintStyle,
} from "./tomb-piece";

import styles from "./tomb-blocks.module.css";

// =========================================================
// TOMB BLOCKS - the full-screen play view (and its game-over
// card, so "Play again" restarts without leaving the floor).
//
// Turn based: the shared engine (src/lib/games/tomb-engine.ts)
// only changes when a piece is placed. Placing:
//   * drag a piece from the tray (phone: it floats ABOVE the
//     finger so you can see it; a ghost + glowing lines show
//     where it lands and what it clears), or
//   * click / tap a piece to select it, then click / tap the
//     floor (mouse hover shows the ghost), or
//   * keyboard: 1 2 3 pick a piece, arrows move it, Enter / Space
//     places it, Esc drops the selection, P pauses.
//
// Every placement is recorded (slot, row, col, ticks since the
// previous one); the server replays exactly that list. The run is
// saved in localStorage after each move so a killed tab resumes.
// =========================================================

const STEP_MS =
  1000 / TICKS_PER_SECOND;

const SAVE_KEY = "dc.tomb.openRun.v1";

/** Tap-anywhere restart is ignored this long after the card shows. */
const RESTART_GUARD_MS = 650;

/** Pause on the stuck pieces before the result card. */
const GAME_OVER_BEAT_MS = 1400;

/** A press that moves less than this is a tap (select), not a drag. */
const TAP_SLOP_PX = 8;

/** Phone held sideways: floor left, HUD + tray right (CSS twin in tomb-blocks.module.css). */
const SIDE_QUERY = "(orientation: landscape) and (max-height: 540px)";

const BANNERS = [
  "",
  "",
  "Double!",
  "Triple!",
  "Quadruple!",
  "Tomb Quake!",
  "Pharaoh's Wrath!",
];

export type SavedTombRun = {
  runId: string;
  mode: "daily" | "practice";
  m: number[];
  t: number[];
  score: number;
  savedAt: number;
};

export function readSavedTombRun(): SavedTombRun | null {
  try {
    const raw =
      window.localStorage.getItem(SAVE_KEY);

    if (!raw) return null;

    const parsed =
      JSON.parse(raw) as SavedTombRun;

    if (
      typeof parsed?.runId !== "string" ||
      !Array.isArray(parsed?.m) ||
      !Array.isArray(parsed?.t)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedTombRun() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

function writeSavedTombRun(
  run: SavedTombRun
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

export type TombRun = {
  runId: string;
  seed: string;
  mode: "daily" | "practice";
  resume: SavedTombRun | null;
  /** Your weekly best when the run started. */
  previousBest: number | null;
};

export type TombOutcome = {
  score: number;
  inputs: TombInputs;
  lines: number;
  bestStreak: number;
  moves: number;
  /** Shape indexes that had no room at the end. */
  stuck: number[];
  sealed: boolean;
  crashed?: boolean;
};

export type TombResult = {
  mode: "daily" | "practice";
  end?: RunEnd;
  score: number;
  lines: number;
  bestStreak: number;
  moves: number;
  stuck: number[];
  sealed: boolean;
  previousBest: number | null;
  /** null while the server replays the run. */
  response: SubmitGameRunResult | null;
};

type Props = {
  run: TombRun;
  /** Leader to chase on this board (not you), if any. */
  rival: {
    name: string;
    score: number;
  } | null;
  result: TombResult | null;
  canPlayAgain: boolean;
  starting: boolean;
  error: string | null;
  onFinished: (outcome: TombOutcome) => void;
  /** Ended before the first placement: the run is still open. */
  onAbandon: () => void;
  onPlayAgain: () => void;
  onExit: () => void;
  crashRef?: RefObject<(() => void) | null>;
};

/** Catches a render crash: ends the run with the moves so far. */
export class TombCrashGuard extends Component<
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
    console.error("Tomb Blocks crashed", error);
    this.props.onCrash();
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[rgb(3_5_15/.94)] px-6 text-center text-sm text-zinc-300">
          Something went wrong. Saving your run...
        </div>
      );
    }

    return this.props.children;
  }
}

type Snap = {
  board: number[];
  hand: (number | null)[];
  hands: number;
  score: number;
  streak: number;
  sinceClear: number;
  lines: number;
  moves: number;
  over: boolean;
  sealed: boolean;
  stuck: number[];
};

function snapOf(
  state: TombState
): Snap {
  return {
    board: [...state.board],
    hand: [...state.hand],
    hands: state.hands,
    score: state.score,
    streak: state.streak,
    sinceClear: state.sinceClear,
    lines: state.linesCleared,
    moves: state.moves,
    over: state.over,
    sealed: state.sealed,
    stuck: [...state.stuck],
  };
}

type Target = {
  slot: number;
  row: number;
  col: number;
};

type DragInfo = {
  slot: number;
  touch: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type Burst = {
  id: number;
  cells: {
    row: number;
    col: number;
    colour: number;
  }[];
  rows: number[];
  cols: number[];
};

type Floater = {
  id: number;
  x: number;
  y: number;
  text: string;
  big: boolean;
};

type Banner = {
  id: number;
  title: string;
  sub: string | null;
};

function clamp(
  value: number,
  min: number,
  max: number
) {
  return Math.max(min, Math.min(max, value));
}

/** Rows / columns with exactly one empty tile left. */
function nearFullLines(
  board: number[]
) {
  const rows = new Set<number>();
  const cols = new Set<number>();

  for (let i = 0; i < GRID; i++) {
    let rowFilled = 0;
    let colFilled = 0;

    for (let j = 0; j < GRID; j++) {
      if (board[i * GRID + j] !== 0) rowFilled += 1;
      if (board[j * GRID + i] !== 0) colFilled += 1;
    }

    if (rowFilled === GRID - 1) rows.add(i);
    if (colFilled === GRID - 1) cols.add(i);
  }

  return {
    rows,
    cols,
  };
}

export function TombPlay({
  run,
  rival,
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
  const containerRef =
    useRef<HTMLDivElement>(null);

  const boardRef =
    useRef<HTMLDivElement>(null);

  const floatRef =
    useRef<HTMLDivElement>(null);

  const againRef =
    useRef<HTMLButtonElement>(null);

  const stateRef =
    useRef<TombState | null>(null);

  const movesRef =
    useRef<number[]>([]);

  const timesRef =
    useRef<number[]>([]);

  const lastMoveAtRef =
    useRef(0);

  const finishedRef =
    useRef(false);

  const pausedRef =
    useRef(false);

  const reducedRef =
    useRef(false);

  const timersRef =
    useRef(new Set<number>());

  const fxIdRef =
    useRef(0);

  const bestPassedRef =
    useRef(false);

  const dragRef =
    useRef<DragInfo | null>(null);

  const boardRectRef =
    useRef<DOMRect | null>(null);

  const ghostKeyRef =
    useRef("");

  const resultShownAt =
    useRef(0);

  const canRestartRef =
    useRef(false);

  const onFinishedRef =
    useRef(onFinished);

  const onAbandonRef =
    useRef(onAbandon);

  const onPlayAgainRef =
    useRef(onPlayAgain);

  const [cell, setCell] =
    useState(40);

  const sideRef =
    useRef(false);

  const [trayCell, setTrayCell] =
    useState(20);

  const [snap, setSnap] =
    useState<Snap | null>(null);

  const [drag, setDrag] =
    useState<{ slot: number; touch: boolean } | null>(null);

  const [target, setTarget] =
    useState<Target | null>(null);

  const [selected, setSelected] =
    useState<number | null>(null);

  const [cursor, setCursor] =
    useState({
      row: 3,
      col: 3,
    });

  const [cursorVisible, setCursorVisible] =
    useState(false);

  const [bursts, setBursts] =
    useState<Burst[]>([]);

  const [floaters, setFloaters] =
    useState<Floater[]>([]);

  const [banner, setBanner] =
    useState<Banner | null>(null);

  const [thud, setThud] =
    useState<{ cells: number[]; key: number } | null>(null);

  const [shake, setShake] =
    useState(0);

  const [paused, setPaused] =
    useState(false);

  const [confirmEnd, setConfirmEnd] =
    useState(false);

  const [passedBest, setPassedBest] =
    useState(false);

  const [ending, setEnding] =
    useState(false);

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

  const later = useCallback((
    fn: () => void,
    ms: number
  ) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);

    timersRef.current.add(id);
  }, []);

  const save = useCallback(() => {
    const state = stateRef.current;

    if (
      !state ||
      finishedRef.current ||
      movesRef.current.length === 0
    ) {
      return;
    }

    writeSavedTombRun({
      runId: run.runId,
      mode: run.mode,
      m: [...movesRef.current],
      t: [...timesRef.current],
      score: tombScore(state),
      savedAt: Date.now(),
    });
  }, [run.runId, run.mode]);

  const finish = useCallback((
    end: RunEnd,
    crashed = false
  ) => {
    const state = stateRef.current;

    if (
      !state ||
      finishedRef.current
    ) {
      return;
    }

    finishedRef.current = true;

    if (movesRef.current.length === 0) {
      onAbandonRef.current();
      return;
    }

    clearSavedTombRun();

    onFinishedRef.current({
      score: tombScore(state),
      inputs: {
        v: ENGINE_VERSION,
        m: [...movesRef.current],
        t: [...timesRef.current],
        end: state.over
          ? "over"
          : end,
        ticks: runTicks(state),
      },
      lines: state.linesCleared,
      bestStreak: state.bestStreak,
      moves: state.moves,
      stuck: state.stuck.map(
        (slot) => state.hand[slot] as number
      ),
      sealed: state.sealed,
      crashed,
    });
  }, []);

  const setPause = useCallback((
    value: boolean
  ) => {
    if (finishedRef.current) return;

    pausedRef.current = value;
    setPaused(value);
    setConfirmEnd(false);

    if (value) save();
  }, [save, setConfirmEnd]);

  // ---------------------------------------------------------
  // Placement feedback (sound, haptics, floaters, line clears)
  // ---------------------------------------------------------

  const feedback = useCallback((
    event: PlaceEvent,
    before: number[]
  ) => {
    const reduced = reducedRef.current;
    const piece = SHAPES[event.shape];

    fxIdRef.current += 1;
    const id = fxIdRef.current;

    setThud({
      cells: event.cells.map(
        ([row, col]) => row * GRID + col
      ),
      key: id,
    });

    const buzz = (
      pattern: number | number[]
    ) => {
      if (typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(pattern);
        } catch {
          // Not allowed here; fine.
        }
      }
    };

    play("tap", 0, 0.5, 0.82);
    buzz(8);

    setFloaters((list) => [
      ...list.slice(-5),
      {
        id,
        x: event.col + piece.w / 2,
        y: event.row + piece.h / 2,
        text: `+${event.gained}`,
        big: event.lines > 0,
      },
    ]);

    later(() => {
      setFloaters((list) => list.filter((floater) => floater.id !== id));
    }, 950);

    if (event.lines > 0) {
      const seen = new Set<number>();
      const cells: Burst["cells"] = [];

      const add = (
        row: number,
        col: number
      ) => {
        const index = row * GRID + col;

        if (seen.has(index)) return;
        seen.add(index);

        cells.push({
          row,
          col,
          colour: before[index] || piece.colour,
        });
      };

      for (const row of event.rows) {
        for (let col = 0; col < GRID; col++) add(row, col);
      }

      for (const col of event.cols) {
        for (let row = 0; row < GRID; row++) add(row, col);
      }

      setBursts((list) => [
        ...list,
        {
          id,
          cells,
          rows: event.rows,
          cols: event.cols,
        },
      ]);

      later(() => {
        setBursts((list) => list.filter((burst) => burst.id !== id));
      }, 700);

      play(
        "chime",
        40,
        0.45,
        Math.min(1.8, 1 + (event.lines - 1) * 0.12 + (event.streak - 1) * 0.05)
      );

      if (event.lines >= 3) {
        play("boom", 0, 0.35);

        if (!reduced) setShake(id);
      }

      if (event.allClear) {
        play("coins", 160, 0.5);
      } else if (event.streak >= 3) {
        play("rise", 120, 0.3);
      }

      buzz(event.lines >= 2 ? [12, 40, 18] : 16);

      const title =
        event.allClear
          ? "Tomb swept!"
          : BANNERS[Math.min(event.lines, BANNERS.length - 1)];

      const sub =
        event.allClear
          ? "+300 bonus"
          : event.streak >= 2
            ? `Combo ×${event.streak}`
            : null;

      if (title || sub) {
        setBanner({
          id,
          title: title || `Combo ×${event.streak}`,
          sub: title ? sub : null,
        });

        later(() => {
          setBanner((current) => current?.id === id ? null : current);
        }, 1150);
      }
    }

    if (event.dealt) {
      play("whoosh", 140, 0.22);
    }
  }, [later]);

  // ---------------------------------------------------------
  // Placing a piece (drag, click or keyboard all end here)
  // ---------------------------------------------------------

  const tryPlace = useCallback((
    slot: number,
    row: number,
    col: number
  ) => {
    const state = stateRef.current;

    if (
      !state ||
      state.over ||
      finishedRef.current ||
      pausedRef.current
    ) {
      return false;
    }

    const now = performance.now();

    const dt = Math.min(
      1_000_000,
      Math.floor((now - lastMoveAtRef.current) / STEP_MS)
    );

    // At most 5 placements a second (the engine rule).
    if (dt < MIN_MOVE_TICKS) return false;

    const before = [...state.board];

    const placed =
      placePiece(state, slot, row, col, dt);

    if (!placed.ok) return false;

    lastMoveAtRef.current = now;
    movesRef.current.push(encodeMove(slot, row, col));
    timesRef.current.push(dt);

    setSnap(snapOf(state));
    setSelected(null);
    setTarget(null);
    ghostKeyRef.current = "";

    feedback(placed.event, before);

    const best =
      run.previousBest ?? 0;

    if (
      !bestPassedRef.current &&
      best > 0 &&
      state.score > best
    ) {
      bestPassedRef.current = true;
      setPassedBest(true);
      play("coins", 240, 0.4);
    }

    if (state.over) {
      setEnding(true);
      clearSavedTombRun();
      play("seal", 380, 0.45);

      later(() => finish("over"), GAME_OVER_BEAT_MS);
    } else {
      save();
    }

    return true;
  }, [feedback, finish, later, run.previousBest, save]);

  // ---------------------------------------------------------
  // Main effect: one per run (a new run id restarts in place).
  // ---------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    reducedRef.current =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const saved =
      run.resume &&
      run.resume.runId === run.runId
        ? run.resume
        : null;

    let state: TombState;

    const replay = saved
      ? replayMoves(run.seed, saved.m, saved.t)
      : null;

    if (
      saved &&
      replay?.ok &&
      !replay.state.over
    ) {
      state = replay.state;
      movesRef.current = [...saved.m];
      timesRef.current = [...saved.t];
    } else {
      state = createTomb(run.seed);
      movesRef.current = [];
      timesRef.current = [];
    }

    stateRef.current = state;
    finishedRef.current = false;
    pausedRef.current = false;
    bestPassedRef.current = false;
    lastMoveAtRef.current = performance.now();
    dragRef.current = null;
    ghostKeyRef.current = "";

    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current.clear();

    setSnap(snapOf(state));
    setPaused(false);
    setConfirmEnd(false);
    setPassedBest(false);
    setEnding(false);
    setSelected(null);
    setTarget(null);
    setDrag(null);
    setBursts([]);
    setFloaters([]);
    setBanner(null);
    setThud(null);

    const measure = () => {
      const rect = container.getBoundingClientRect();

      const side =
        window.matchMedia(SIDE_QUERY).matches;

      sideRef.current = side;

      if (side) {
        // Phone on its side: the floor fills the height on the left,
        // HUD + tray share the column on the right (see the CSS).
        const size = Math.floor(
          clamp(
            Math.min(
              (rect.height - 44) / GRID,
              (rect.width * 0.58 - 28) / GRID
            ),
            22,
            72
          )
        );

        const pane =
          rect.width - (size * GRID + 28);

        setCell(size);

        setTrayCell(
          Math.floor(
            Math.min(
              size * 0.56,
              ((pane - 28) / HAND_SIZE - 14) / 5,
              (rect.height - 150) / 5
            )
          )
        );

        return;
      }

      // Board + tray (~3 board cells) + HUD must fit the column.
      const size = Math.floor(
        clamp(
          Math.min(
            (rect.width - 28) / GRID,
            (rect.height - 150) / 11
          ),
          22,
          72
        )
      );

      setCell(size);

      setTrayCell(
        Math.floor(
          Math.min(
            size * 0.56,
            ((rect.width - 28) / HAND_SIZE - 14) / 5
          )
        )
      );
    };

    measure();

    const resizeObserver =
      new ResizeObserver(measure);

    resizeObserver.observe(container);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };

    const onPageHide = () => save();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    const bail = () => finish("quit", true);

    if (crashRef) {
      crashRef.current = bail;
    }

    const html = document.documentElement;
    const previousOverscroll = html.style.overscrollBehavior;
    const previousOverflow = document.body.style.overflow;
    html.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";

    const timers = timersRef.current;

    return () => {
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      if (crashRef?.current === bail) crashRef.current = null;
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      html.style.overscrollBehavior = previousOverscroll;
      document.body.style.overflow = previousOverflow;
    };
    // One effect per run; the resume data is read once at its start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.runId, run.seed]);

  // ---------------------------------------------------------
  // Drag and drop
  // ---------------------------------------------------------

  /** Board cell under a dragged piece whose pointer is at (x, y). */
  const dragTarget = useCallback((
    slot: number,
    touch: boolean,
    x: number,
    y: number
  ): Target | null => {
    const state = stateRef.current;
    const rect = boardRectRef.current;

    if (!state || !rect) return null;

    const shape = state.hand[slot];

    if (shape === null || shape === undefined) return null;

    const piece = SHAPES[shape];
    const width = piece.w * cell;
    const height = piece.h * cell;

    // Phone: the piece floats well above the finger so it stays
    // visible. Mouse: the cursor holds the middle of the piece.
    // Phone on its side: the floor fills the whole height, so a
    // piece lifted ABOVE the finger could never reach the bottom
    // rows; it floats up-left of the thumb instead (the tray is on
    // the right, so every column stays reachable).
    const lift = Math.max(56, cell * 1.45);
    const sideways = touch && sideRef.current;

    const left = sideways
      ? x - width - cell * 0.7
      : x - width / 2;
    const top = sideways
      ? y - height / 2 - cell * 0.6
      : touch
        ? y - lift - height
        : y - height / 2;

    const element = floatRef.current;

    if (element) {
      element.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    }

    const col = Math.round((left - rect.left) / cell);
    const row = Math.round((top - rect.top) / cell);

    if (
      col < 0 ||
      row < 0 ||
      col + piece.w > GRID ||
      row + piece.h > GRID
    ) {
      return null;
    }

    return {
      slot,
      row,
      col,
    };
  }, [cell]);

  const updateTarget = (
    next: Target | null
  ) => {
    const key = next
      ? `${next.slot}:${next.row}:${next.col}`
      : "";

    if (key === ghostKeyRef.current) return;

    ghostKeyRef.current = key;
    setTarget(next);
  };

  const onTrayPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    slot: number
  ) => {
    const state = stateRef.current;

    if (
      !state ||
      state.over ||
      finishedRef.current ||
      pausedRef.current ||
      state.hand[slot] === null ||
      dragRef.current ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    event.preventDefault();

    boardRectRef.current =
      boardRef.current?.getBoundingClientRect() ?? null;

    const touch =
      event.pointerType !== "mouse";

    dragRef.current = {
      slot,
      touch,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };

    setDrag({
      slot,
      touch,
    });

    setCursorVisible(false);

    // Position the floating piece on the very first frame.
    requestAnimationFrame(() => {
      const info = dragRef.current;

      if (info && info.pointerId === event.pointerId) {
        updateTarget(
          dragTarget(slot, touch, event.clientX, event.clientY)
        );
      }
    });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (
      event: PointerEvent
    ) => {
      const info = dragRef.current;

      if (!info || event.pointerId !== info.pointerId) return;

      if (
        !info.moved &&
        Math.hypot(event.clientX - info.startX, event.clientY - info.startY) > TAP_SLOP_PX
      ) {
        info.moved = true;
      }

      const next =
        dragTarget(info.slot, info.touch, event.clientX, event.clientY);

      const key = next
        ? `${next.slot}:${next.row}:${next.col}`
        : "";

      if (key !== ghostKeyRef.current) {
        ghostKeyRef.current = key;
        setTarget(next);
      }
    };

    const onUp = (
      event: PointerEvent
    ) => {
      const info = dragRef.current;

      if (!info || event.pointerId !== info.pointerId) return;

      dragRef.current = null;
      setDrag(null);

      if (!info.moved) {
        // A tap / click: select it for click-to-place / keyboard.
        ghostKeyRef.current = "";
        setTarget(null);
        setSelected((current) => current === info.slot ? null : info.slot);
        return;
      }

      const next =
        dragTarget(info.slot, info.touch, event.clientX, event.clientY);

      ghostKeyRef.current = "";
      setTarget(null);

      if (next) {
        tryPlace(next.slot, next.row, next.col);
      }
    };

    const onCancel = (
      event: PointerEvent
    ) => {
      const info = dragRef.current;

      if (!info || event.pointerId !== info.pointerId) return;

      dragRef.current = null;
      ghostKeyRef.current = "";
      setDrag(null);
      setTarget(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [drag, dragTarget, tryPlace]);

  // ---------------------------------------------------------
  // Click / tap to place a selected piece; keyboard
  // ---------------------------------------------------------

  const anchorAt = (
    slot: number,
    x: number,
    y: number
  ) => {
    const shape = snap?.hand[slot];
    const rect = boardRef.current?.getBoundingClientRect();

    if (
      shape === null ||
      shape === undefined ||
      !rect
    ) {
      return null;
    }

    const piece = SHAPES[shape];
    const hoverRow = Math.floor((y - rect.top) / cell);
    const hoverCol = Math.floor((x - rect.left) / cell);

    return {
      row: clamp(hoverRow - Math.floor((piece.h - 1) / 2), 0, GRID - piece.h),
      col: clamp(hoverCol - Math.floor((piece.w - 1) / 2), 0, GRID - piece.w),
    };
  };

  const onBoardPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (
      selected === null ||
      drag ||
      event.pointerType !== "mouse"
    ) {
      return;
    }

    const anchor = anchorAt(selected, event.clientX, event.clientY);

    if (!anchor) return;

    setCursorVisible(true);

    if (
      anchor.row !== cursor.row ||
      anchor.col !== cursor.col
    ) {
      setCursor(anchor);
    }
  };

  const onBoardClick = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (
      selected === null ||
      drag
    ) {
      return;
    }

    const anchor = anchorAt(selected, event.clientX, event.clientY);

    if (!anchor) return;

    setCursor(anchor);
    tryPlace(selected, anchor.row, anchor.col);
  };

  useEffect(() => {
    const onKeyDown = (
      event: KeyboardEvent
    ) => {
      if (finishedRef.current) {
        if (
          (event.key === " " || event.key === "Enter") &&
          !(event.target instanceof HTMLButtonElement)
        ) {
          event.preventDefault();

          if (
            canRestartRef.current &&
            performance.now() - resultShownAt.current > RESTART_GUARD_MS
          ) {
            onPlayAgainRef.current();
          }
        }

        return;
      }

      if (
        event.key === "p" ||
        event.key === "P"
      ) {
        setPause(!pausedRef.current);
        return;
      }

      if (event.key === "Escape") {
        if (selected !== null) {
          setSelected(null);
          setCursorVisible(false);
        } else {
          setPause(!pausedRef.current);
        }

        return;
      }

      if (pausedRef.current) return;

      const state = stateRef.current;

      if (!state || state.over) return;

      const firstSlot = () => state.hand.findIndex((shape) => shape !== null);

      if (["1", "2", "3"].includes(event.key)) {
        const slot = Number(event.key) - 1;

        if (state.hand[slot] !== null) {
          event.preventDefault();
          setSelected(slot);
          setCursorVisible(true);

          const piece = SHAPES[state.hand[slot] as number];

          setCursor((current) => ({
            row: clamp(current.row, 0, GRID - piece.h),
            col: clamp(current.col, 0, GRID - piece.w),
          }));
        }

        return;
      }

      const moves: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };

      const delta = moves[event.key];

      if (delta) {
        event.preventDefault();

        const slot =
          selected ?? firstSlot();

        if (slot < 0) return;

        const piece = SHAPES[state.hand[slot] as number];

        if (selected === null) setSelected(slot);

        setCursorVisible(true);

        setCursor((current) => ({
          row: clamp(current.row + delta[0], 0, GRID - piece.h),
          col: clamp(current.col + delta[1], 0, GRID - piece.w),
        }));

        return;
      }

      if (
        (event.key === "Enter" || event.key === " ") &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        event.preventDefault();

        if (event.repeat) return;

        if (selected === null) {
          const slot = firstSlot();

          if (slot >= 0) {
            setSelected(slot);
            setCursorVisible(true);
          }

          return;
        }

        tryPlace(selected, cursor.row, cursor.col);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cursor, selected, setPause, tryPlace]);

  // Tap anywhere (outside buttons) on the result screen = play again.
  const onWrapperPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!finishedRef.current) return;

    if (
      event.target instanceof Element &&
      event.target.closest("button, a, [data-tomb-ui]")
    ) {
      return;
    }

    if (
      canRestartRef.current &&
      performance.now() - resultShownAt.current > RESTART_GUARD_MS
    ) {
      onPlayAgainRef.current();
    }
  };

  const endRun = () => {
    if (finishedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    finish("quit");
  };

  // ---------------------------------------------------------
  // Render
  // ---------------------------------------------------------

  const board =
    snap?.board ?? [];

  const hand =
    snap?.hand ?? [];

  // Ghost: the dragged piece's target, or the keyboard / hover cursor.
  const ghost: Target | null =
    drag
      ? target
      : selected !== null &&
          cursorVisible &&
          hand[selected] !== null &&
          hand[selected] !== undefined
        ? {
            slot: selected,
            row: cursor.row,
            col: cursor.col,
          }
        : null;

  const ghostShape =
    ghost
      ? hand[ghost.slot]
      : null;

  const ghostValid =
    ghost !== null &&
    ghostShape !== null &&
    ghostShape !== undefined &&
    canPlace(board, ghostShape, ghost.row, ghost.col);

  const ghostCells = new Set<number>();

  if (
    ghost &&
    ghostShape !== null &&
    ghostShape !== undefined
  ) {
    for (const [r, c] of SHAPES[ghostShape].cells) {
      const row = ghost.row + r;
      const col = ghost.col + c;

      if (row < GRID && col < GRID) ghostCells.add(row * GRID + col);
    }
  }

  const clearPreview = new Set<number>();

  if (
    ghost &&
    ghostValid &&
    ghostShape !== null &&
    ghostShape !== undefined
  ) {
    const lines =
      linesAfter(board, ghostShape, ghost.row, ghost.col);

    for (const row of lines.rows) {
      for (let col = 0; col < GRID; col++) clearPreview.add(row * GRID + col);
    }

    for (const col of lines.cols) {
      for (let row = 0; row < GRID; row++) clearPreview.add(row * GRID + col);
    }
  }

  const near =
    nearFullLines(board);

  const thudCells =
    new Set(thud?.cells ?? []);

  const stuckSlots =
    new Set(snap?.over ? snap.stuck : []);

  const response =
    result?.response ?? null;

  const newBest =
    result !== null &&
    response?.ok === true &&
    result.score > 0 &&
    (result.previousBest === null || result.score > result.previousBest);

  const score =
    snap?.score ?? 0;

  const streakAlive =
    snap !== null &&
    snap.streak >= 1 &&
    !snap.over;

  const dragShape =
    drag
      ? hand[drag.slot]
      : null;

  return (
    <div
      onPointerDown={onWrapperPointerDown}
      className="fixed inset-0 z-[55] flex h-[100dvh] w-full touch-none select-none justify-center overflow-hidden overscroll-none bg-[radial-gradient(ellipse_at_center,#0b1230_0%,#03050f_70%)] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none]"
    >
      {/* Portrait column: the whole screen on a phone, a centred
          strip on a wide window (same idea as the other games). */}
      <div
        ref={containerRef}
        className={`${styles.column} @container relative flex h-full w-full max-w-[calc(100dvh*0.62)] touch-none select-none flex-col items-center overflow-hidden overscroll-none bg-[radial-gradient(ellipse_at_50%_35%,#121a3d_0%,#060918_62%,#03050f_100%)] shadow-[0_0_0_1px_rgba(242,196,90,.18),0_0_60px_rgba(0,0,0,.6)]`}
        role="application"
        aria-label="Tomb Blocks. Drag a piece onto the 8 by 8 floor, or press 1, 2 or 3, move it with the arrow keys and press Enter. Full rows and columns clear."
        style={{
          "--cell": `${cell}px`,
        } as CSSProperties}
      >
        {/* Night sky glow */}
        <div className="pointer-events-none absolute left-1/2 top-[18%] h-64 w-64 -translate-x-1/2 rounded-full bg-[rgb(242_196_90/.07)] blur-3xl" />

        {/* HUD */}
        <div className={`${styles.hud} relative z-10 grid w-full grid-cols-[1fr_auto_1fr] items-start px-3 pt-[calc(env(safe-area-inset-top,0px)+12px)]`}>
          <div className="pt-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-200/70">
              {
                run.mode === "daily"
                  ? "Daily Tomb"
                  : "Practice"
              }
            </p>

            {
              run.previousBest
                ? (
                    <p className="mt-1 text-[11px] font-semibold tabular-nums text-zinc-400">
                      Best {run.previousBest.toLocaleString("en-US")}
                    </p>
                  )
                : null
            }

            {
              rival
                ? (
                    <p className="mt-0.5 max-w-[120px] truncate text-[11px] tabular-nums text-zinc-500">
                      {rival.name} {rival.score.toLocaleString("en-US")}
                    </p>
                  )
                : null
            }
          </div>

          <div className="flex min-w-0 flex-col items-center">
            <p
              aria-live="polite"
              className={`font-display text-5xl font-black tabular-nums leading-none text-[#fff3c8] drop-shadow-[0_2px_14px_rgba(0,0,0,.55)] transition-opacity duration-300 ${result ? "opacity-0" : "opacity-100"}`}
            >
              {score.toLocaleString("en-US")}
            </p>

            <div className="mt-1.5 flex h-6 items-center gap-1.5">
              {
                streakAlive && snap && !result
                  ? (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/45 bg-[rgb(6_9_22/.6)] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200"
                        title="Clear again within 3 placements to keep the combo"
                      >
                        Combo ×{snap.streak}
                        <span className="flex gap-0.5">
                          {Array.from(
                            {
                              length: STREAK_GRACE,
                            },
                            (_, index) => (
                              <span
                                key={index}
                                className={`h-1.5 w-1.5 rounded-full ${index < STREAK_GRACE - snap.sinceClear ? "bg-amber-300" : "bg-white/15"}`}
                              />
                            )
                          )}
                        </span>
                      </span>
                    )
                  : passedBest && !result
                    ? (
                        <span className="text-[10px] font-bold uppercase tracking-[.22em] text-amber-300/90">
                          {
                            run.mode === "daily"
                              ? "Past your practice best"
                              : "New best!"
                          }
                        </span>
                      )
                    : null
              }
            </div>
          </div>

          <div className="flex justify-end">
            {
              !result
                ? (
                    <button
                      type="button"
                      onClick={() => setPause(!paused)}
                      aria-label={
                        paused
                          ? "Resume"
                          : "Pause"
                      }
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(242_196_90/.35)] bg-[rgb(6_9_22/.6)] text-amber-200 backdrop-blur-sm transition-transform duration-100 active:scale-95"
                    >
                      {
                        paused
                          ? <Play size={18} />
                          : <Pause size={18} />
                      }
                    </button>
                  )
                : null
            }
          </div>
        </div>

        {/* BOARD */}
        <div className={`${styles.boardArea} relative z-0 flex min-h-0 w-full flex-1 items-center justify-center px-3.5`}>
          <div
            key={shake}
            className={shake ? styles.boardShake : ""}
          >
            <div
              ref={boardRef}
              className={styles.board}
              onPointerMove={onBoardPointerMove}
              onPointerUp={onBoardClick}
              onPointerLeave={() => {
                if (!drag && selected !== null) setCursorVisible(false);
              }}
            >
              {[
                [-7, -7],
                [-7, 1],
                [1, -7],
                [1, 1],
              ].map(
                ([y, x], index) => (
                  <span
                    key={index}
                    className={styles.cornerGlyph}
                    style={{
                      top: y < 0 ? y : undefined,
                      bottom: y > 0 ? -7 : undefined,
                      left: x < 0 ? x : undefined,
                      right: x > 0 ? -7 : undefined,
                    }}
                  />
                )
              )}

              {board.map(
                (colour, index) => {
                  const row = Math.floor(index / GRID);
                  const col = index % GRID;
                  const isGhost = ghostCells.has(index) && colour === 0;
                  const inNear = near.rows.has(row) || near.cols.has(col);
                  const thudding = thudCells.has(index) && colour !== 0;

                  return (
                    <div
                      key={thudding ? `${index}-${thud?.key}` : index}
                      className={styles.tile}
                      style={{
                        left: col * cell,
                        top: row * cell,
                      }}
                    >
                      {
                        colour !== 0
                          ? (
                              <TombBlock
                                colour={colour}
                                className={[
                                  clearPreview.has(index) ? styles.willClear : inNear ? styles.nearFull : "",
                                  thudding ? styles.thud : "",
                                ].join(" ")}
                              />
                            )
                          : isGhost && ghostShape !== null && ghostShape !== undefined
                            ? (
                                <TombBlock
                                  colour={SHAPES[ghostShape].colour}
                                  className={`${styles.ghost} ${ghostValid ? (clearPreview.has(index) ? styles.willClear : "") : styles.ghostBad}`}
                                />
                              )
                            : (
                                <div
                                  className={`${styles.floor} ${inNear ? styles.floorHint : ""}`}
                                />
                              )
                      }
                    </div>
                  );
                }
              )}

              {/* Line clears: shimmer sweep + the blocks shattering */}
              {bursts.map(
                (burst) => (
                  <div
                    key={burst.id}
                    className="pointer-events-none absolute inset-0"
                  >
                    {burst.rows.map(
                      (row) => (
                        <div
                          key={`r${row}`}
                          className={styles.sweep}
                          style={{
                            left: 0,
                            top: row * cell,
                            width: GRID * cell,
                            height: cell,
                          }}
                        />
                      )
                    )}

                    {burst.cols.map(
                      (col) => (
                        <div
                          key={`c${col}`}
                          className={`${styles.sweep} ${styles.sweepCol}`}
                          style={{
                            left: col * cell,
                            top: 0,
                            width: cell,
                            height: GRID * cell,
                          }}
                        />
                      )
                    )}

                    {burst.cells.map(
                      (entry, index) => (
                        <div
                          key={`${entry.row}-${entry.col}`}
                          className={styles.clearCell}
                          style={{
                            left: entry.col * cell,
                            top: entry.row * cell,
                            animationDelay: `${(burst.rows.length ? entry.col : entry.row) * 22}ms`,
                          }}
                        >
                          <TombBlock
                            colour={entry.colour}
                          />

                          {
                            index < 40
                              ? [0, 1].map(
                                  (shard) => {
                                    const angle = ((index * 7 + shard * 3) % 12) / 12 * Math.PI * 2;
                                    const distance = cell * (0.7 + ((index + shard) % 3) * 0.3);

                                    return (
                                      <span
                                        key={shard}
                                        className={styles.shard}
                                        style={{
                                          ...tintStyle(entry.colour),
                                          left: cell * 0.39,
                                          top: cell * 0.39,
                                          "--dx": `${Math.cos(angle) * distance}px`,
                                          "--dy": `${Math.sin(angle) * distance - cell * 0.4}px`,
                                          "--rot": `${(index % 2 ? 1 : -1) * (120 + shard * 90)}deg`,
                                        } as CSSProperties}
                                      />
                                    );
                                  }
                                )
                              : null
                          }
                        </div>
                      )
                    )}
                  </div>
                )
              )}

              {floaters.map(
                (floater) => (
                  <span
                    key={floater.id}
                    className={`${styles.floater} ${floater.big ? "text-2xl" : "text-base"}`}
                    style={{
                      left: floater.x * cell,
                      top: floater.y * cell,
                    }}
                  >
                    {floater.text}
                  </span>
                )
              )}

              {/* Combo banner */}
              {
                banner
                  ? (
                      <div className="pointer-events-none absolute inset-x-0 top-[34%] z-30 flex justify-center">
                        <div
                          key={banner.id}
                          className={`${styles.banner} rounded-2xl border border-amber-300/50 bg-[rgb(6_9_22/.78)] px-5 py-2.5 text-center shadow-[0_0_40px_rgba(242,196,90,.25)] backdrop-blur-sm`}
                        >
                          <p className="gold-text font-display text-3xl font-black leading-none">
                            {banner.title}
                          </p>

                          {
                            banner.sub
                              ? (
                                  <p className="mt-1 text-xs font-black uppercase tracking-[.22em] text-amber-200">
                                    {banner.sub}
                                  </p>
                                )
                              : null
                          }
                        </div>
                      </div>
                    )
                  : null
              }

              {/* No room left */}
              {
                ending && snap && !result
                  ? (
                      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
                        <p className="rounded-full border border-rose-300/50 bg-[rgb(30_6_14/.82)] px-4 py-1.5 text-xs font-black uppercase tracking-[.2em] text-rose-200 backdrop-blur-sm">
                          {
                            snap.sealed
                              ? "The tomb is sealed"
                              : "No room left"
                          }
                        </p>
                      </div>
                    )
                  : null
              }
            </div>
          </div>
        </div>

        {/* TRAY */}
        <div
          className={`${styles.tray} relative z-10 grid w-full grid-cols-3 gap-2 px-3.5 pb-[calc(env(safe-area-inset-bottom,0px)+14px)] pt-2 transition-opacity duration-200 pointer-fine:pb-6 ${result ? "opacity-0" : "opacity-100"}`}
          style={{
            height: trayCell * 5 + 34,
          }}
        >
          {Array.from(
            {
              length: HAND_SIZE,
            },
            (_, slot) => {
              const shape = hand[slot];
              const empty = shape === null || shape === undefined;
              const isDragged = drag?.slot === slot;
              const isSelected = selected === slot && !drag;
              const isStuck = stuckSlots.has(slot);

              return (
                <button
                  key={`${snap?.hands ?? 0}-${slot}`}
                  type="button"
                  disabled={empty || !!result}
                  aria-label={
                    empty
                      ? `Slot ${slot + 1}: placed`
                      : `Piece ${slot + 1}: ${SHAPES[shape].cells.length} blocks${isStuck ? ", no room" : ""}`
                  }
                  aria-pressed={isSelected}
                  onPointerDown={(event) => onTrayPointerDown(event, slot)}
                  onClick={(event) => {
                    // Keyboard activation (Enter on a focused slot).
                    if (event.detail === 0 && !empty) {
                      setSelected(slot);
                      setCursorVisible(true);
                    }
                  }}
                  className={`relative flex items-center justify-center rounded-2xl border transition-[border-color,background-color,opacity] duration-150 ${
                    isStuck
                      ? `${styles.stuck} border-rose-400/60 bg-rose-500/10`
                      : isSelected
                        ? "border-amber-300/70 bg-[rgb(242_196_90/.12)] shadow-[0_0_24px_rgba(242,196,90,.18)]"
                        : "border-white/[.06] bg-white/[.02]"
                  } ${empty ? "" : "cursor-grab active:cursor-grabbing"}`}
                >
                  {
                    !empty
                      ? (
                          <TombPiece
                            shape={shape}
                            cell={trayCell}
                            className={`${snap && snap.moves > 0 ? styles.dealIn : ""} transition-opacity duration-100 ${isDragged ? "opacity-0" : isStuck ? "opacity-45 grayscale" : "opacity-100"}`}
                          />
                        )
                      : null
                  }

                  {
                    isStuck
                      ? (
                          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-rose-500/85 px-2 py-0.5 text-[9px] font-black uppercase tracking-[.16em] text-white">
                            No room
                          </span>
                        )
                      : null
                  }
                </button>
              );
            }
          )}
        </div>

        <p className={`${styles.help} pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom,0px)+2px)] left-0 right-0 hidden text-center text-[10px] text-zinc-600 pointer-fine:block`}>
          Drag a piece · or 1 2 3, arrows, Enter · P pauses
        </p>

        {
          paused && !result
            ? (
                <div
                  data-tomb-ui
                  className="absolute inset-0 z-50 flex items-center justify-center bg-[rgb(3_5_15/.72)] px-6 backdrop-blur-[2px]"
                >
                  <div className="panel w-full max-w-xs p-5 text-center">
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      Paused
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
                                    ? "End your Daily Tomb here? This becomes your score for today."
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
                                  Keep playing
                                </button>
                              </div>
                            </>
                          )
                        : (
                            <div className="mt-4 grid gap-2">
                              <button
                                type="button"
                                autoFocus
                                onClick={() => setPause(false)}
                                className="primary-button flex w-full items-center justify-center gap-2"
                              >
                                <Play
                                  size={16}
                                />
                                Resume
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
                  </div>
                </div>
              )
            : null
        }

        {/* GAME OVER: over the tray, the final floor stays visible. */}
        {
          result
            ? (
                <div className={`${styles.resultWrap} stack-result-in absolute inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]`}>
                  <div
                    data-tomb-ui
                    className="panel arena-frame w-full max-w-sm p-5 text-center"
                  >
                    <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">
                      {
                        result.mode === "daily"
                          ? "Daily Tomb"
                          : "Practice run"
                      }
                      {
                        result.end === "over"
                          ? result.sealed
                            ? " · Tomb sealed"
                            : " · No room left"
                          : ""
                      }
                    </p>

                    <p className="gold-text mt-1 font-display text-6xl font-black leading-none tabular-nums">
                      {result.score.toLocaleString("en-US")}
                    </p>

                    <p className="mt-1 text-xs font-semibold uppercase tracking-[.2em] text-amber-200/80">
                      pts · {result.lines} {result.lines === 1 ? "line" : "lines"}
                      {
                        result.bestStreak > 1
                          ? ` · combo ×${result.bestStreak}`
                          : ""
                      }
                    </p>

                    {
                      result.stuck.length > 0
                        ? (
                            <div className="mt-3 flex items-center justify-center gap-3">
                              <span className="text-[10px] font-bold uppercase tracking-[.18em] text-rose-300/90">
                                No room for
                              </span>

                              {result.stuck.map(
                                (shape, index) => (
                                  <TombPiece
                                    key={index}
                                    shape={shape}
                                    cell={9}
                                    className="opacity-80"
                                  />
                                )
                              )}
                            </div>
                          )
                        : null
                    }

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
                                Checking your run...
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
                                Tap anywhere to play again
                              </span>
                              <span className="hidden pointer-fine:inline">
                                Click anywhere or press Space to play again
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

      {/* The dragged piece (full board size, follows the pointer) */}
      {
        drag &&
        dragShape !== null &&
        dragShape !== undefined
          ? (
              <div
                ref={floatRef}
                className={styles.dragging}
                style={{
                  transform: "translate3d(-999px, -999px, 0)",
                }}
              >
                <TombPiece
                  shape={dragShape}
                  cell={cell}
                  className={styles.dragInner}
                />
              </div>
            )
          : null
      }
    </div>
  );
}
