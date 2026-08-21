"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Dices,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer,
} from "lucide-react";

// =========================================================
// LIVE DUEL COMPANION
//
// Fully optional, fully client-side. Nothing here is saved to
// the database and nothing here is required to use the app -
// it is just a handy Life Points / dice / coin / timer tool to
// have open on your phone during a physical duel. It never
// tracks cards, summons, turns or damage sources.
// =========================================================

const START_LP = 8000;

const QUICK_ADJUSTMENTS = [100, 500, 1000, 2000];

function LifePointsCounter({
  label,
  accent,
}: {
  label: string;
  accent: "amber" | "cyan";
}) {
  const [lp, setLp] = useState(START_LP);

  const accentClasses =
    accent === "amber"
      ? {
          text: "text-amber-200",
          border: "border-amber-300/20",
          bg: "bg-amber-300/[0.04]",
          button: "hover:border-amber-300/40 hover:bg-amber-300/[0.08]",
        }
      : {
          text: "text-cyan-200",
          border: "border-cyan-300/20",
          bg: "bg-cyan-300/[0.04]",
          button: "hover:border-cyan-300/40 hover:bg-cyan-300/[0.08]",
        };

  function adjust(amount: number) {
    setLp((current) => Math.max(0, current + amount));
  }

  return (
    <div
      className={`panel relative overflow-hidden border ${accentClasses.border} ${accentClasses.bg} p-5`}
    >
      <p className="text-center text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">
        {label}
      </p>

      <p
        className={`mt-2 text-center text-6xl font-black tabular-nums ${accentClasses.text}`}
      >
        {lp}
      </p>

      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => adjust(-100)}
          className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.03] transition-all active:scale-90 ${accentClasses.button}`}
        >
          <Minus size={20} />
        </button>

        <button
          type="button"
          onClick={() => setLp(START_LP)}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-500 transition-all hover:text-zinc-200 active:scale-90"
          title="Reset to 8000"
        >
          <RotateCcw size={15} />
        </button>

        <button
          type="button"
          onClick={() => adjust(100)}
          className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.03] transition-all active:scale-90 ${accentClasses.button}`}
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {QUICK_ADJUSTMENTS.map((amount) => (
          <div
            key={amount}
            className="flex flex-col gap-1"
          >
            <button
              type="button"
              onClick={() => adjust(amount)}
              className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.02] py-1.5 text-[10px] font-black text-zinc-400 transition-all active:scale-90 hover:text-emerald-300"
            >
              +{amount}
            </button>
            <button
              type="button"
              onClick={() => adjust(-amount)}
              className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.02] py-1.5 text-[10px] font-black text-zinc-400 transition-all active:scale-90 hover:text-red-300"
            >
              -{amount}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoinAndDice() {
  const [coinResult, setCoinResult] = useState<"Heads" | "Tails" | null>(null);
  const [diceResult, setDiceResult] = useState<number | null>(null);
  const [flipping, setFlipping] = useState(false);
  const [rolling, setRolling] = useState(false);

  function flipCoin() {
    setFlipping(true);
    window.setTimeout(() => {
      setCoinResult(Math.random() < 0.5 ? "Heads" : "Tails");
      setFlipping(false);
    }, 350);
  }

  function rollDice() {
    setRolling(true);
    window.setTimeout(() => {
      setDiceResult(1 + Math.floor(Math.random() * 6));
      setRolling(false);
    }, 350);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={flipCoin}
        className="panel flex cursor-pointer flex-col items-center gap-2 p-5 transition-all active:scale-[0.97]"
      >
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-300/40 bg-amber-300/10 text-2xl font-black text-amber-200 transition-transform duration-300 ${
            flipping ? "rotate-[720deg]" : ""
          }`}
        >
          {coinResult ? coinResult[0] : "?"}
        </div>
        <p className="text-sm font-black text-zinc-300">
          {coinResult ?? "Flip Coin"}
        </p>
      </button>

      <button
        type="button"
        onClick={rollDice}
        className="panel flex cursor-pointer flex-col items-center gap-2 p-5 transition-all active:scale-[0.97]"
      >
        <div
          className={`relative flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-cyan-300/40 bg-cyan-300/10 text-2xl font-black text-cyan-200 transition-transform duration-300 ${
            rolling ? "rotate-180" : ""
          }`}
        >
          <Dices
            size={20}
            className={rolling ? "opacity-0" : ""}
          />
          {!rolling && diceResult !== null && (
            <span className="absolute">{diceResult}</span>
          )}
        </div>
        <p className="text-sm font-black text-zinc-300">
          {diceResult !== null ? `Rolled a ${diceResult}` : "Roll d6"}
        </p>
      </button>
    </div>
  );
}

function DuelTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((current) => current + 1);
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div className="panel flex items-center justify-between gap-4 p-5">
      <div className="flex items-center gap-3">
        <Timer
          size={20}
          className="text-zinc-500"
        />
        <p className="text-3xl font-black tabular-nums text-zinc-200">
          {String(minutes).padStart(2, "0")}:
          {String(secs).padStart(2, "0")}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRunning((current) => !current)}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-300 transition-all hover:border-amber-300/30 hover:text-amber-200 active:scale-90"
        >
          {running ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <button
          type="button"
          onClick={() => {
            setRunning(false);
            setSeconds(0);
          }}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-500 transition-all hover:text-zinc-200 active:scale-90"
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </div>
  );
}

export function DuelCompanion() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <LifePointsCounter
          label="Player 1"
          accent="amber"
        />
        <LifePointsCounter
          label="Player 2"
          accent="cyan"
        />
      </div>

      <DuelTimer />

      <CoinAndDice />
    </div>
  );
}
