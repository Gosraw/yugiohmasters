"use client";

// =========================================================
// DECK COMPOSITION SUMMARY (Deck Builder 2.0)
//
// Lifted out of decks/[id]/page.tsx into its own Client Component so
// the counts can update the moment a card is added or removed,
// instead of only after the server action's full page round trip.
// The numbers themselves come from the shared live composition
// context; `ownedVsUsed` stays a server-computed prop (it needs the
// player's whole owned-quantity map, which isn't sent to the
// browser, and it is a "spare copies" hint rather than one of the
// composition counts that has to be instant).
//
// Always-visible headline row ("Monsters 22 · Spells 11 · Traps 7"),
// with the deeper breakdown (Normal/Effect split, Level/Rank curve,
// Attributes, Types, Archetypes, spare owned copies) tucked behind a
// native <details> so it never overwhelms the page by default. Plain
// English throughout - no engine terminology, no raw scores (see the
// product spec's explicit "good: Monsters 22 · Spells 11 · Traps 7 /
// bad: NORMAL_SUMMON_COMPETITION score=0.823" example).
// =========================================================

import {
  ChevronDown,
} from "lucide-react";

import {
  type OwnedVsUsedEntry,
} from "@/lib/deck-composition";

import {
  useDeckLiveComposition,
} from "@/components/deck-live-composition";

function DistributionRow({
  label,
  entries,
}: {
  label: string;
  entries: [string, number][];
}) {
  if (entries.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
        {label}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {entries.map(
          ([key, count]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-bold text-zinc-300"
            >
              {key}
              <span className="text-zinc-500">
                {count}
              </span>
            </span>
          )
        )}
      </div>
    </div>
  );
}

export function DeckCompositionSummary({
  ownedVsUsed,
}: {
  ownedVsUsed: OwnedVsUsedEntry[];
}) {
  // The one number source for this panel: the live, client-side
  // composition (see deck-live-composition.tsx). It starts out as
  // exactly what the server computed for this render and moves the
  // instant a card is added or removed, without waiting for the
  // server action's round trip.
  const {
    composition,
  } = useDeckLiveComposition();

  const { main, extra } = composition;

  const levelEntries = Object.entries(
    composition.levelDistribution
  )
    .map(([level, count]): [string, number] => [
      `Lv ${level}`,
      count,
    ])
    .sort(
      (a, b) =>
        Number(a[0].replace("Lv ", "")) -
        Number(b[0].replace("Lv ", ""))
    );

  const rankEntries = Object.entries(
    composition.rankDistribution
  )
    .map(([rank, count]): [string, number] => [
      `Rank ${rank}`,
      count,
    ])
    .sort(
      (a, b) =>
        Number(a[0].replace("Rank ", "")) -
        Number(b[0].replace("Rank ", ""))
    );

  const attributeEntries = Object.entries(
    composition.attributeDistribution
  ).sort((a, b) => b[1] - a[1]);

  const typeEntries = Object.entries(
    composition.monsterTypeDistribution
  ).sort((a, b) => b[1] - a[1]);

  const archetypeEntries = Object.entries(
    composition.archetypeDistribution
  ).sort((a, b) => b[1] - a[1]);

  return (
    <details className="panel group/comp mt-6 overflow-hidden p-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 select-none sm:p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-sm font-black text-zinc-100">
            Monsters {main.monsters} · Spells {main.spells} · Traps{" "}
            {main.traps}
          </span>

          {extra.total > 0 && (
            <span className="text-sm text-zinc-500">
              Extra: {extra.fusion > 0 && `Fusion ${extra.fusion}`}
              {extra.fusion > 0 && extra.xyz > 0 && " · "}
              {extra.xyz > 0 && `Xyz ${extra.xyz}`}
              {(extra.synchro > 0 || extra.link > 0) &&
                (extra.fusion > 0 || extra.xyz > 0) &&
                " · "}
              {extra.synchro > 0 && `Synchro ${extra.synchro}`}
              {extra.synchro > 0 && extra.link > 0 && " · "}
              {extra.link > 0 && `Link ${extra.link}`}
            </span>
          )}
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500">
          Full breakdown
          <ChevronDown
            size={14}
            className="transition-transform group-open/comp:rotate-180"
          />
        </span>
      </summary>

      <div className="grid gap-4 border-t border-white/5 p-4 sm:grid-cols-2 sm:p-5">
        <DistributionRow
          label="Monster Level (Main Deck)"
          entries={levelEntries}
        />

        <DistributionRow
          label="Xyz Rank (Extra Deck)"
          entries={rankEntries}
        />

        <DistributionRow
          label="Attributes"
          entries={attributeEntries}
        />

        <DistributionRow
          label="Monster Types"
          entries={typeEntries}
        />

        <div className="sm:col-span-2">
          <DistributionRow
            label="Archetypes / Packages"
            entries={archetypeEntries}
          />
        </div>

        {ownedVsUsed.length > 0 && (
          <div className="sm:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-600">
              You own more copies than you&apos;re using
            </p>

            <div className="mt-2 space-y-1.5">
              {ownedVsUsed
                .slice(0, 8)
                .map((entry) => (
                  <div
                    key={
                      entry.cardCatalogId
                    }
                    className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.04] px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-zinc-200">
                      {entry.name}
                    </span>

                    <span className="shrink-0 font-black text-emerald-300">
                      +{entry.spareCopies}{" "}
                      spare
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
