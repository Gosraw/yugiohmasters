"use client";

import Image from "next/image";
import Link from "next/link";

import {
  useMemo,
  useState,
  useTransition,
} from "react";

import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";

import {
  castCardVote,
} from "@/app/actions/vote";

import {
  type MyVote,
  type Rarity,
  type VoteValue,
  RARITY_LADDER,
  verdictBadgeClass,
  verdictLabel,
  voteButtonLabel,
  voteOptions,
  voteShortLabel,
} from "@/components/vote-labels";

// =========================================================
// VOTE DECK (card pool vote, /vote)
//
// One card at a time, phone-first: card image, full card text,
// proposed verdict, the reason, big vote buttons. A tap saves
// the vote in the background (castCardVote, no redirect) and
// moves on to the next card you haven't voted on yet. Votes can
// be changed any time by jumping back to a card.
//
// On a forbidden card, "Allow it" first opens a rarity picker;
// the vote is saved once a rarity is tapped.
// =========================================================

export type VoteDeckItem = {
  id: string;
  listKey: string;
  listTitle: string;
  cardName: string;
  imageUrl: string | null;
  cardType: string | null;
  stats: string | null;
  description: string | null;
  verdict: string;
  context: string;
};

type VoteDeckProps = {
  items: VoteDeckItem[];
  initialVotes: Record<string, MyVote>;
};

// Highest first: the picker reads top-down like the ladder.
const RARITIES_DESC: Rarity[] =
  [...RARITY_LADDER].reverse();

const ALL = "all";

const BUTTON_STYLE: Record<VoteValue, string> = {
  agree:
    "border-emerald-300/40 bg-emerald-400/[0.08] text-emerald-50 hover:border-emerald-300/70 hover:bg-emerald-400/15",
  too_strong:
    "border-red-300/40 bg-red-400/[0.08] text-red-50 hover:border-red-300/70 hover:bg-red-400/15",
  too_weak:
    "border-sky-300/40 bg-sky-400/[0.08] text-sky-50 hover:border-sky-300/70 hover:bg-sky-400/15",
};

const BUTTON_SELECTED: Record<VoteValue, string> = {
  agree: "ring-2 ring-emerald-300/80",
  too_strong: "ring-2 ring-red-300/80",
  too_weak: "ring-2 ring-sky-300/80",
};

const BUTTON_ICON = {
  agree: Check,
  too_strong: ArrowUp,
  too_weak: ArrowDown,
};

export function VoteDeck({
  items,
  initialVotes,
}: VoteDeckProps) {
  const [votes, setVotes] =
    useState<Record<string, MyVote>>(
      initialVotes
    );

  // Card whose "Allow it" rarity picker is open.
  const [pickingId, setPickingId] =
    useState<string | null>(null);

  const [listKey, setListKey] =
    useState<string>(ALL);

  const [currentId, setCurrentId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [savingId, setSavingId] =
    useState<string | null>(null);

  const [, startTransition] =
    useTransition();

  const lists = useMemo(() => {
    const result: {
      key: string;
      title: string;
      total: number;
    }[] = [];

    for (const item of items) {
      const last =
        result[result.length - 1];

      if (last && last.key === item.listKey) {
        last.total++;
      } else {
        result.push({
          key: item.listKey,
          title: item.listTitle,
          total: 1,
        });
      }
    }

    return result;
  }, [items]);

  const queue = useMemo(
    () =>
      listKey === ALL
        ? items
        : items.filter(
            (item) =>
              item.listKey === listKey
          ),
    [items, listKey]
  );

  const doneTotal =
    items.filter(
      (item) => votes[item.id]
    ).length;

  const doneInQueue =
    queue.filter(
      (item) => votes[item.id]
    ).length;

  const current =
    queue.find(
      (item) => item.id === currentId
    ) ??
    queue.find(
      (item) => !votes[item.id]
    ) ??
    queue[0] ??
    null;

  const index =
    current
      ? queue.indexOf(current)
      : -1;

  const currentVote =
    current
      ? votes[current.id]
      : undefined;

  // Open while choosing, and stays open to show the picked
  // rarity of an "Allow it" vote.
  const pickerOpen =
    current?.verdict === "forbidden" &&
    (pickingId === current.id ||
      (currentVote?.vote === "too_weak" &&
        Boolean(currentVote.allowRarity)));

  const allDoneInQueue =
    queue.length > 0 &&
    doneInQueue === queue.length;

  function nextUnvotedAfter(
    position: number,
    currentVotes: Record<string, MyVote>
  ): string | null {
    for (let step = 1; step <= queue.length; step++) {
      const candidate =
        queue[(position + step) % queue.length];

      if (!currentVotes[candidate.id]) {
        return candidate.id;
      }
    }

    return null;
  }

  function choose(
    value: VoteValue
  ) {
    if (!current) return;

    // "Allow it" on a forbidden card: pick the rarity first.
    if (
      current.verdict === "forbidden" &&
      value === "too_weak"
    ) {
      setPickingId(
        current.id
      );

      return;
    }

    vote(
      value,
      null
    );
  }

  function vote(
    value: VoteValue,
    allowRarity: Rarity | null
  ) {
    if (!current) return;

    const itemId =
      current.id;

    const previous =
      votes[itemId];

    const nextVotes = {
      ...votes,
      [itemId]: {
        vote: value,
        allowRarity,
      },
    };

    setVotes(nextVotes);
    setPickingId(null);
    setError(null);
    setSavingId(itemId);

    // Move on straight away; the save runs in the background.
    const nextId =
      nextUnvotedAfter(
        index,
        nextVotes
      );

    setCurrentId(
      nextId ?? itemId
    );

    startTransition(async () => {
      const result =
        await castCardVote(
          itemId,
          value,
          allowRarity
        );

      setSavingId(
        (id) =>
          id === itemId
            ? null
            : id
      );

      if (!result.ok) {
        setVotes((now) => {
          const reverted = {
            ...now,
          };

          if (previous) {
            reverted[itemId] = previous;
          } else {
            delete reverted[itemId];
          }

          return reverted;
        });

        setError(
          `Your vote on ${current.cardName} was not saved: ${result.error}`
        );

        setCurrentId(itemId);
      }
    });
  }

  function step(
    delta: number
  ) {
    if (!queue.length) return;

    const position =
      (Math.max(index, 0) + delta + queue.length) %
      queue.length;

    setPickingId(null);

    setCurrentId(
      queue[position].id
    );
  }

  const percent =
    items.length
      ? Math.round(
          (doneTotal / items.length) * 100
        )
      : 0;

  return (
    <div className="mt-5">
      {/* PROGRESS */}

      <div className="panel p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">
            Your progress
          </p>

          <p
            className="text-sm font-black text-zinc-100"
            data-testid="vote-progress"
          >
            {doneTotal} / {items.length} voted
          </p>
        </div>

        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={doneTotal}
          aria-label="Cards voted"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-200 transition-[width] duration-300 motion-reduce:transition-none"
            style={{
              width: `${percent}%`,
            }}
          />
        </div>
      </div>

      {/* LISTS */}

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        <ListChip
          active={listKey === ALL}
          label="All lists"
          done={doneTotal}
          total={items.length}
          onClick={() => {
            setListKey(ALL);
            setCurrentId(null);
          }}
        />

        {lists.map(
          (list) => (
            <ListChip
              key={
                list.key
              }
              active={listKey === list.key}
              label={
                list.title
              }
              done={
                items.filter(
                  (item) =>
                    item.listKey === list.key &&
                    votes[item.id]
                ).length
              }
              total={
                list.total
              }
              onClick={() => {
                setListKey(list.key);
                setCurrentId(null);
              }}
            />
          )
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
        >
          <TriangleAlert
            size={16}
            className="mt-0.5 shrink-0"
          />

          {error}
        </div>
      )}

      {/* CURRENT CARD */}

      {current ? (
        <section
          className="arena-frame panel relative mt-4 overflow-hidden p-4 sm:p-5"
          aria-label={`Vote on ${current.cardName}`}
        >
          <div className="flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[.16em] text-zinc-500">
            <span className="truncate">
              {
                current.listTitle
              }
            </span>

            <span className="shrink-0">
              {index + 1} / {queue.length}
            </span>
          </div>

          {allDoneInQueue && (
            <p className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-100">
              {listKey === ALL
                ? "You voted on every card. You can still change any vote."
                : "You voted on every card in this list."}
            </p>
          )}

          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="w-40 shrink-0 sm:w-48">
              {current.imageUrl ? (
                <Image
                  key={
                    current.id
                  }
                  src={
                    current.imageUrl
                  }
                  alt={
                    current.cardName
                  }
                  width={421}
                  height={614}
                  className="aspect-[421/614] h-auto w-full rounded-lg object-cover shadow-[0_12px_40px_rgba(0,0,0,.55)]"
                  unoptimized
                  priority
                />
              ) : (
                <div className="flex aspect-[421/614] items-center justify-center rounded-lg border border-white/10 text-xs text-zinc-600">
                  No image
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h2
                className="text-xl font-black leading-tight text-amber-50"
                data-testid="vote-card-name"
              >
                {
                  current.cardName
                }
              </h2>

              {current.cardType && (
                <p className="mt-1 text-xs text-zinc-500">
                  {
                    current.cardType
                  }
                </p>
              )}

              {current.stats && (
                <p
                  className="mt-1 text-xs font-bold text-zinc-300"
                  data-testid="vote-card-stats"
                >
                  {
                    current.stats
                  }
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Proposed
                </span>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wider ${verdictBadgeClass(current.verdict)}`}
                >
                  {verdictLabel(
                    current.verdict
                  )}
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-zinc-300">
                {
                  current.context
                }
              </p>

              <p className="mt-2 text-xs text-zinc-500">
                Your vote:{" "}
                <span
                  className="font-bold text-zinc-200"
                  data-testid="vote-my-vote"
                >
                  {voteShortLabel(
                    currentVote?.vote,
                    current.verdict,
                    currentVote?.allowRarity
                  )}
                </span>

                {savingId === current.id && (
                  <LoaderCircle
                    size={12}
                    className="ml-1.5 inline animate-spin text-amber-300"
                    aria-label="Saving"
                  />
                )}
              </p>
            </div>
          </div>

          {/* FULL CARD TEXT */}

          {current.description && (
            <div className="mt-4 rounded-xl border border-white/5 bg-black/25 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Card text
              </p>

              <p
                className="mt-1.5 whitespace-pre-line text-sm leading-6 text-zinc-200"
                data-testid="vote-card-text"
              >
                {
                  current.description
                }
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-2.5">
            {voteOptions(
              current.verdict
            ).map(
              (option) => {
                const label =
                  voteButtonLabel(
                    current.verdict,
                    option
                  );

                const Icon =
                  BUTTON_ICON[option];

                const isAllow =
                  current.verdict === "forbidden" &&
                  option === "too_weak";

                const selected =
                  currentVote?.vote === option ||
                  (isAllow && pickerOpen);

                return (
                  <button
                    key={
                      option
                    }
                    type="button"
                    onClick={() =>
                      choose(option)
                    }
                    aria-pressed={
                      selected
                    }
                    aria-expanded={
                      isAllow
                        ? pickerOpen
                        : undefined
                    }
                    className={`flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] motion-reduce:transition-none ${BUTTON_STYLE[option]} ${selected ? BUTTON_SELECTED[option] : ""}`}
                  >
                    <Icon
                      size={20}
                      className="shrink-0"
                    />

                    <span className="min-w-0">
                      <span className="block text-base font-black">
                        {
                          label.title
                        }
                      </span>

                      <span className="block text-xs opacity-75">
                        {isAllow &&
                        currentVote?.vote === "too_weak" &&
                        currentVote.allowRarity
                          ? `Rarity: ${currentVote.allowRarity}`
                          : label.hint}
                      </span>
                    </span>
                  </button>
                );
              }
            )}

            {/* "ALLOW IT" RARITY PICKER */}

            {pickerOpen && (
              <div
                className="rounded-2xl border border-sky-300/35 bg-sky-400/[0.06] p-3.5"
                data-testid="vote-rarity-picker"
              >
                <p className="text-sm font-bold text-sky-50">
                  If it&apos;s allowed, which rarity should it get?
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {RARITIES_DESC.map(
                    (rarity) => {
                      const picked =
                        currentVote?.vote === "too_weak" &&
                        currentVote.allowRarity === rarity;

                      return (
                        <button
                          key={
                            rarity
                          }
                          type="button"
                          onClick={() =>
                            vote(
                              "too_weak",
                              rarity
                            )
                          }
                          aria-pressed={
                            picked
                          }
                          className={`min-h-11 cursor-pointer rounded-xl border px-3 text-sm font-bold transition active:scale-[0.98] motion-reduce:transition-none ${verdictBadgeClass(rarity)} ${picked ? "ring-2 ring-sky-300/80" : "opacity-85 hover:opacity-100"}`}
                        >
                          {
                            rarity
                          }
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                step(-1)
              }
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-xl border border-white/10 px-3 text-sm font-bold text-zinc-300 transition hover:border-amber-300/30 hover:text-amber-100"
            >
              <ChevronLeft
                size={16}
              />
              Previous
            </button>

            <button
              type="button"
              onClick={() =>
                step(1)
              }
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-xl border border-white/10 px-3 text-sm font-bold text-zinc-300 transition hover:border-amber-300/30 hover:text-amber-100"
            >
              Skip
              <ChevronRight
                size={16}
              />
            </button>
          </div>
        </section>
      ) : (
        <p className="panel mt-4 p-5 text-sm text-zinc-400">
          Nothing to vote on yet.
        </p>
      )}

      {/* THIS LIST AT A GLANCE */}

      {queue.length > 0 && (
        <section className="panel mt-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">
              {listKey === ALL
                ? "All cards"
                : "This list"}
            </h2>

            <span className="text-xs text-zinc-500">
              {doneInQueue} / {queue.length}
            </span>
          </div>

          <ul className="mt-3 grid gap-1.5">
            {queue.map(
              (item, position) => (
                <li
                  key={
                    item.id
                  }
                  className="min-w-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setPickingId(null);
                      setCurrentId(item.id);
                    }}
                    className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
                      current?.id === item.id
                        ? "border-amber-300/50 bg-amber-300/10"
                        : "border-white/5 bg-white/[0.02] hover:border-amber-300/25"
                    }`}
                  >
                    <span className="w-6 shrink-0 text-right text-xs text-zinc-600">
                      {position + 1}
                    </span>

                    <span className="min-w-0 flex-1 truncate font-bold text-zinc-200">
                      {
                        item.cardName
                      }
                    </span>

                    <span className="hidden shrink-0 text-[11px] text-zinc-500 min-[400px]:inline">
                      {verdictLabel(
                        item.verdict
                      )}
                    </span>

                    <span
                      className={`w-28 shrink-0 truncate text-right text-[11px] font-bold ${
                        votes[item.id]
                          ? "text-emerald-200"
                          : "text-zinc-600"
                      }`}
                    >
                      {voteShortLabel(
                        votes[item.id]?.vote,
                        item.verdict,
                        votes[item.id]?.allowRarity
                      )}
                    </span>
                  </button>
                </li>
              )
            )}
          </ul>
        </section>
      )}

      <Link
        href="/vote/results"
        className="primary-button mt-5 flex min-h-12 w-full items-center justify-center gap-2 text-sm"
      >
        <BarChart3
          size={17}
        />
        See the results
      </Link>
    </div>
  );
}

function ListChip({
  active,
  label,
  done,
  total,
  onClick,
}: {
  active: boolean;
  label: string;
  done: number;
  total: number;
  onClick: () => void;
}) {
  const complete =
    done === total;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-xs font-bold transition ${
        active
          ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
          : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-amber-300/30 hover:text-zinc-200"
      }`}
    >
      {label}

      <span
        className={
          complete
            ? "text-emerald-300"
            : "text-zinc-500"
        }
      >
        {done}/{total}
      </span>
    </button>
  );
}
