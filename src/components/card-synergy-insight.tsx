"use client";

import {
  useState,
} from "react";

import {
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";

// =========================================================
// DUELIST INSIGHT (Card Synergy)
//
// Compact, collapsed-by-default panel on Card Detail - clicking
// "Get Duelist Insight" is what actually triggers the (server-
// cached) synergy lookup, so this NEVER fires an AI call on page
// load, on hover, or per-tile in a list - only when the player
// deliberately asks for it on one specific card. Max 3 suggestions,
// collection-aware ("cards you already own" surfaced first).
//
// Never shows a generic "Something went wrong" - a failed fetch
// (network issue, AI provider down, etc.) shows a plain, honest
// "Card insights are temporarily unavailable" message and nothing
// else on the page is affected.
// =========================================================

type Suggestion = {
  cardId: string;
  cardName: string;
  explanation: string;
  source: "ai" | "fallback";
  ownedCount: number;
  masterDuelNote: string | null;
};

type InsightResponse = {
  cardId: string;
  cardName: string;
  ownedSuggestions: Suggestion[];
  otherSuggestions: Suggestion[];
};

function SuggestionRow({
  suggestion,
}: {
  suggestion: Suggestion;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-zinc-100">
          {suggestion.cardName}
        </p>

        <div className="flex items-center gap-1.5">
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
      ? state.data.ownedSuggestions.length +
        state.data.otherSuggestions.length
      : 0;

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Wand2 size={18} className="text-violet-300" />

        <div>
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
            AI Card Coach
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

      {state.status === "ready" && totalSuggestions === 0 && (
        <p className="mt-4 text-sm text-zinc-500">
          No strong mechanical synergies found for this card yet.
        </p>
      )}

      {state.status === "ready" && totalSuggestions > 0 && (
        <div className="mt-4 space-y-4">
          {state.data.ownedSuggestions.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-300/80">
                Best Synergy You Own
              </p>

              <div className="mt-2 space-y-2">
                {state.data.ownedSuggestions.map((s) => (
                  <SuggestionRow key={s.cardId} suggestion={s} />
                ))}
              </div>
            </div>
          )}

          {state.data.otherSuggestions.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.16em] text-zinc-500">
                Other Good Synergies
              </p>

              <div className="mt-2 space-y-2">
                {state.data.otherSuggestions.map((s) => (
                  <SuggestionRow key={s.cardId} suggestion={s} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
