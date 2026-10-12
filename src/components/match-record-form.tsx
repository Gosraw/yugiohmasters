"use client";

import Link from "next/link";

import {
  useState,
} from "react";

import {
  useFormStatus,
} from "react-dom";

import {
  ChevronDown,
  Coins,
  Crown,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Send,
  UserRound,
} from "lucide-react";

import {
  createMatchChallenge,
  recordPracticeDuel,
} from "@/app/actions/matches";

// =========================================================
// MATCH RECORD FORM (2.0 practice duel: tap the winner)
//
// Step 1 pick the opponent, step 2 tap who won - the winner buttons
// are the form's submit buttons (name="winner_id"), so one tap
// records the duel via recordPracticeDuel. "Add a wager" swaps the
// winner buttons for the existing wager challenge
// (createMatchChallenge -> opponent accepts and matches the stake ->
// duel -> tap the winner on the duel page).
// =========================================================

export type RecordOpponent = {
  id: string;
  name: string;
  bossName: string | null;
};

export type WagerCardOption = {
  instanceId: string;
  label: string;
  sortKey: string;
};

function WinnerButton({
  value,
  name,
  caption,
  disabled,
}: {
  value: string;
  name: string;
  caption: string;
  disabled: boolean;
}) {
  const {
    pending,
    data,
  } = useFormStatus();

  const isThisOne =
    pending &&
    data?.get("winner_id") === value;

  return (
    <button
      type="submit"
      name="winner_id"
      value={value}
      disabled={disabled || pending}
      className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border border-amber-300/30 bg-gradient-to-b from-amber-300/[0.12] to-amber-300/[0.03] px-2 py-3 text-center transition-[transform,border-color] duration-150 ease-out hover:border-amber-300/60 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:active:scale-100"
    >
      {isThisOne ? (
        <LoaderCircle
          size={20}
          className="animate-spin text-amber-300 motion-reduce:animate-none"
        />
      ) : (
        <Crown
          size={20}
          className="text-amber-300"
        />
      )}

      <span className="w-full truncate text-base font-black text-zinc-100">
        {name}
      </span>

      <span className="text-[10px] font-black uppercase tracking-wider text-amber-300/70">
        {isThisOne ? "Saving..." : caption}
      </span>
    </button>
  );
}

function ChallengeButton({
  disabled,
}: {
  disabled: boolean;
}) {
  const {
    pending,
  } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="primary-button inline-flex w-full items-center justify-center gap-2 text-sm"
    >
      {pending ? (
        <LoaderCircle
          size={16}
          className="animate-spin motion-reduce:animate-none"
        />
      ) : (
        <Send
          size={16}
        />
      )}
      {pending ? "Sending..." : "Send wager challenge"}
    </button>
  );
}

export function MatchRecordForm({
  currentUserId,
  opponents,
  preselectedOpponentId,
  duelPoints,
  hasActiveDeck,
  wagerCards,
}: {
  currentUserId: string;
  opponents: RecordOpponent[];
  preselectedOpponentId: string | null;
  duelPoints: number;
  hasActiveDeck: boolean;
  wagerCards: WagerCardOption[];
}) {
  const [
    opponentId,
    setOpponentId,
  ] = useState<string | null>(preselectedOpponentId);

  const [
    wagerOpen,
    setWagerOpen,
  ] = useState(false);

  const [
    wagerType,
    setWagerType,
  ] = useState<"dp" | "card">("dp");

  const opponent =
    opponents.find(
      (item) => item.id === opponentId
    ) ?? null;

  return (
    <div className="mt-5 space-y-4">
      {/* STEP 1: OPPONENT */}

      <section>
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-zinc-500">
          1 · Who did you play?
        </p>

        <div
          role="radiogroup"
          aria-label="Opponent"
          className="mt-2 grid grid-cols-2 gap-2"
        >
          {opponents.map(
            (item) => {
              const selected =
                item.id === opponentId;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setOpponentId(item.id)}
                  className={`flex min-h-16 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors duration-150 ${
                    selected
                      ? "border-amber-300/60 bg-amber-300/[0.12]"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                      selected
                        ? "border-amber-300/50 text-amber-300"
                        : "border-white/10 text-zinc-500"
                    }`}
                  >
                    <UserRound
                      size={16}
                    />
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-zinc-100">
                      {item.name}
                    </span>

                    {item.bossName && (
                      <span className="block truncate text-[11px] text-zinc-500">
                        {item.bossName}
                      </span>
                    )}
                  </span>
                </button>
              );
            }
          )}
        </div>
      </section>

      {/* STEP 2: WINNER (no wager) */}

      {!wagerOpen && (
        <form
          action={recordPracticeDuel}
          className="panel p-4"
        >
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-zinc-500">
            2 · Tap the winner
          </p>

          <input
            type="hidden"
            name="opponent_id"
            value={opponentId ?? ""}
          />

          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <WinnerButton
              value={currentUserId}
              name="Me"
              caption="I won"
              disabled={!opponent}
            />

            <WinnerButton
              value={opponent?.id ?? ""}
              name={opponent?.name ?? "Opponent"}
              caption="won"
              disabled={!opponent}
            />
          </div>

          <p className="mt-3 text-center text-xs text-zinc-500">
            {opponent
              ? `${opponent.name} gets a one-tap confirm. No DP for practice duels.`
              : "Pick your opponent first."}
          </p>
        </form>
      )}

      {/* OPTIONAL WAGER */}

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <button
          type="button"
          aria-expanded={wagerOpen}
          onClick={() => setWagerOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left"
        >
          <span className="inline-flex items-center gap-2 text-sm font-black text-zinc-200">
            <Coins
              size={15}
              className="text-amber-300"
            />
            {wagerOpen ? "Wager challenge" : "Add a wager"}
          </span>

          <ChevronDown
            size={16}
            className={`text-zinc-500 transition-transform duration-200 motion-reduce:transition-none ${
              wagerOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {wagerOpen && (
          <form
            action={createMatchChallenge}
            className="space-y-3 border-t border-white/[0.06] px-4 pb-4 pt-3"
          >
            <p className="text-xs leading-5 text-zinc-400">
              Playing for stakes? Send a challenge first: {opponent?.name ?? "your opponent"} accepts and matches the stake, you duel, then tap the winner on the duel page. Winner takes the pot.
            </p>

            <input
              type="hidden"
              name="opponent_id"
              value={opponentId ?? ""}
            />

            <input
              type="hidden"
              name="match_type"
              value="practice"
            />

            <input
              type="hidden"
              name="wager_type"
              value={wagerType}
            />

            <div className="grid grid-cols-2 gap-2">
              {([
                ["dp", "Duel Points", Coins],
                ["card", "A card", LockKeyhole],
              ] as const).map(
                ([type, label, Icon]) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={wagerType === type}
                    onClick={() => setWagerType(type)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-black transition-colors ${
                      wagerType === type
                        ? "border-amber-300/50 bg-amber-300/10 text-amber-100"
                        : "border-white/10 text-zinc-400"
                    }`}
                  >
                    <Icon
                      size={13}
                    />
                    {label}
                  </button>
                )
              )}
            </div>

            {wagerType === "dp" ? (
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Stake per player (you have {duelPoints.toLocaleString()} DP)
                </span>

                <input
                  name="wager_dp_amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.max(1, duelPoints)}
                  required
                  placeholder="100"
                  className="field mt-1.5 w-full"
                />
              </label>
            ) : (
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Your card on the line
                </span>

                <select
                  name="card_instance_id"
                  required
                  defaultValue=""
                  className="field mt-1.5 w-full"
                >
                  <option value="">
                    Pick a card...
                  </option>

                  {wagerCards.map(
                    (card) => (
                      <option
                        key={card.instanceId}
                        value={card.instanceId}
                      >
                        {card.label}
                      </option>
                    )
                  )}
                </select>
              </label>
            )}

            {!hasActiveDeck && (
              <p className="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/[0.07] px-3 py-2.5 text-xs font-bold text-red-200">
                <Layers3
                  size={14}
                  className="mt-0.5 shrink-0"
                />
                <span>
                  A wager duel needs an active Ready deck.{" "}
                  <Link
                    href="/decks"
                    className="underline underline-offset-2"
                  >
                    Go to Decks
                  </Link>
                </span>
              </p>
            )}

            <ChallengeButton
              disabled={
                !opponent ||
                !hasActiveDeck ||
                (wagerType === "dp" && duelPoints <= 0) ||
                (wagerType === "card" && wagerCards.length === 0)
              }
            />
          </form>
        )}
      </section>
    </div>
  );
}
