"use client";

import {
  useState,
} from "react";

import Link from "next/link";

import {
  ArrowRightLeft,
  Layers,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";

// =========================================================
// DUELIST COACH - CARD DETAIL (Phase 3)
//
// Compact, collapsed-by-default panel on Card Detail - clicking
// "Get Duelist Insight" is what actually triggers the (server-
// cached) synergy lookup, so this NEVER fires an AI call on page
// load, on hover, or per-tile in a list - only when the player
// deliberately asks for it on one specific card.
//
// Three explicitly separate modes, per the product spec - MY CARDS
// (owned, mechanically interacts), DISCOVER (relevant, unowned,
// nobody in the league owns it), TRADE TARGETS (unowned, but another
// league member owns it - navigable to their binder). A card is
// NEVER shown in more than one of these at once.
//
// Never shows a generic "Something went wrong" - a failed fetch
// (network issue, AI provider down, etc.) shows a plain, honest
// "Card insights are temporarily unavailable" message and nothing
// else on the page is affected.
// =========================================================

type Owner = {
  profileId: string;
  name: string;
  count: number;
};

type Suggestion = {
  cardId: string;
  cardName: string;
  explanation: string;
  source: "ai" | "fallback";
  ownedCount: number;
  masterDuelNote: string | null;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  owners?: Owner[];
};

type SynergyPackage = {
  cardIds: string[];
  cardNames: string[];
  reason: string;
};

type InsightResponse = {
  cardId: string;
  cardName: string;
  myCards: Suggestion[];
  discover: Suggestion[];
  tradeTargets: Suggestion[];
  packages: SynergyPackage[];
  // false only when the precomputed synergy graph hasn't been
  // computed for this card yet (an operator hasn't run the
  // synergy-graph precompute script) - distinct from "the engine
  // looked and genuinely found nothing", so the message shown below
  // doesn't overclaim.
  graphComputed: boolean;
};

const CONFIDENCE_STYLE: Record<
  Suggestion["confidence"],
  string
> = {
  high: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
  medium: "border-amber-300/25 bg-amber-300/10 text-amber-200",
  low: "border-zinc-500/25 bg-zinc-500/10 text-zinc-400",
};

const CONFIDENCE_LABEL: Record<Suggestion["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

function SuggestionRow({
  suggestion,
  tradeAction,
}: {
  suggestion: Suggestion;
  tradeAction?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-zinc-100">
          {suggestion.cardName}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${CONFIDENCE_STYLE[suggestion.confidence]}`}
          >
            {CONFIDENCE_LABEL[suggestion.confidence]}
          </span>

          {suggestion.ownedCount > 0 && (
            <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-200">
              Owned x{suggestion.ownedCount}
            </span>
          )}

          {suggestion.masterDuelNote && (
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[9px] font-black uppercase text-amber-200">
              {suggestion.masterDuelNote}
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-zinc-400">
        {suggestion.explanation}
      </p>

      {suggestion.owners && suggestion.owners.length > 0 && (
        <p className="mt-1.5 text-[11px] text-cyan-300/80">
          Owned by {suggestion.owners.map((o) => `${o.name} (${o.count})`).join(", ")}
        </p>
      )}

      {suggestion.evidence.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-zinc-600 transition hover:text-zinc-400">
            Evidence ({suggestion.evidence.length})
          </summary>
          <ul className="mt-1.5 space-y-1 border-l border-white/[0.06] pl-3">
            {suggestion.evidence.map((detail, i) => (
              <li key={i} className="text-[11px] leading-5 text-zinc-500">
                {detail}
              </li>
            ))}
          </ul>
        </details>
      )}

      {tradeAction && suggestion.owners && suggestion.owners.length > 0 && (
        <Link
          href={`/trades/binder/${suggestion.owners[0].profileId}`}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.1]"
        >
          <ArrowRightLeft size={11} />
          View {suggestion.owners[0].name}&apos;s binder
        </Link>
      )}
    </div>
  );
}

function PackageRow({ pkg }: { pkg: SynergyPackage }) {
  return (
    <div className="rounded-lg border border-violet-300/15 bg-violet-300/[0.04] p-3">
      <div className="flex items-center gap-1.5">
        <Layers size={13} className="text-violet-300" />
        <p className="text-xs font-black text-violet-200">
          {pkg.cardNames.join(" + ")}
        </p>
      </div>
      <p className="mt-1.5 text-[11px] leading-5 text-zinc-500">{pkg.reason}</p>
    </div>
  );
}

function Section({
  title,
  tone,
  suggestions,
  tradeAction,
}: {
  title: string;
  tone: string;
  suggestions: Suggestion[];
  tradeAction?: boolean;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div>
      <p className={`text-[9px] font-black uppercase tracking-[.16em] ${tone}`}>
        {title}
      </p>

      <div className="mt-2 space-y-2">
        {suggestions.map((s) => (
          <SuggestionRow key={s.cardId} suggestion={s} tradeAction={tradeAction} />
        ))}
      </div>
    </div>
  );
}

export function CardSynergyInsight({
  cardId,
}: {
  cardId: string;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; data: InsightResponse }
  >({ status: "idle" });

  const load = async () => {
    setState({ status: "loading" });

    try {
      const response = await fetch(
        `/api/card-synergy?cardId=${encodeURIComponent(cardId)}`
      );

      if (!response.ok) {
        setState({ status: "error" });
        return;
      }

      const data = (await response.json()) as InsightResponse;
      setState({ status: "ready", data });
    } catch {
      setState({ status: "error" });
    }
  };

  const totalSuggestions =
    state.status === "ready"
      ? state.data.myCards.length +
        state.data.discover.length +
        state.data.tradeTargets.length
      : 0;

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Wand2 size={18} className="text-violet-300" />

        <div>
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
            Duelist Coach
          </p>

          <h2 className="mt-1 text-lg font-black text-violet-200">
            Duelist Insight
          </h2>
        </div>
      </div>

      {state.status === "idle" && (
        <button
          type="button"
          onClick={load}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[0.06] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-violet-200 transition hover:border-violet-300/40 hover:bg-violet-300/[0.1]"
        >
          <Sparkles size={14} />
          Get Duelist Insight
        </button>
      )}

      {state.status === "loading" && (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" />
          Analyzing mechanics...
        </div>
      )}

      {state.status === "error" && (
        <p className="mt-4 text-sm text-zinc-500">
          Card insights are temporarily unavailable. Try again in a moment.
        </p>
      )}

      {state.status === "ready" &&
        totalSuggestions === 0 &&
        state.data.graphComputed && (
          <p className="mt-4 text-sm text-zinc-500">
            No strong mechanical synergies found for this card yet.
          </p>
        )}

      {state.status === "ready" &&
        totalSuggestions === 0 &&
        !state.data.graphComputed && (
          <p className="mt-4 text-sm text-zinc-500">
            This card hasn&apos;t been analyzed yet - check back after the
            next Duelist Coach update.
          </p>
        )}

      {state.status === "ready" && totalSuggestions > 0 && (
        <div className="mt-4 space-y-4">
          {state.data.packages.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.16em] text-violet-300/80">
                Owned Package
              </p>
              <div className="mt-2 space-y-2">
                {state.data.packages.map((pkg, i) => (
                  <PackageRow key={i} pkg={pkg} />
                ))}
              </div>
            </div>
          )}

          <Section
            title="My Cards"
            tone="text-emerald-300/80"
            suggestions={state.data.myCards}
          />

          <Section
            title="Discover"
            tone="text-zinc-500"
            suggestions={state.data.discover}
          />

          <Section
            title="Trade Targets"
            tone="text-cyan-300/80"
            suggestions={state.data.tradeTargets}
            tradeAction
          />
        </div>
      )}
    </div>
  );
}
