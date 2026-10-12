"use client";

import {
  MONSTER_RACES,
} from "@/lib/card-race";

import {
  KIND_LABELS,
  type CardTypeKey,
  type DeckSearchFilters,
  type MonsterKind,
  type NumberRange,
  type SpellTrapType,
} from "@/lib/deck-search-parser";

import {
  BottomSheet,
} from "./bottom-sheet";

import {
  SORT_OPTIONS,
  emptyPanel,
  type PanelState,
  type SortKey,
} from "./browse-state";

// =========================================================
// FILTER SHEET
//
// Every change applies immediately (the grid behind updates live);
// "Show N cards" just closes the sheet. No banlist or "in deck"
// filters - the owner explicitly didn't want those.
// =========================================================

const CARD_TYPES: {
  value: CardTypeKey;
  label: string;
}[] = [
  { value: "monster", label: "Monster" },
  { value: "spell", label: "Spell" },
  { value: "trap", label: "Trap" },
];

const KINDS: MonsterKind[] = [
  "effect",
  "normal",
  "fusion",
  "xyz",
  "ritual",
  "tuner",
  "flip",
];

const SPELL_TRAP_TYPES: SpellTrapType[] = [
  "Quick-Play",
  "Continuous",
  "Field",
  "Equip",
  "Counter",
];

const ATTRIBUTES = [
  "DARK",
  "LIGHT",
  "EARTH",
  "WATER",
  "FIRE",
  "WIND",
];

const LEVELS = Array.from(
  {
    length: 12,
  },
  (_, index) =>
    index + 1
);

const RANKS = Array.from(
  {
    length: 13,
  },
  (_, index) =>
    index + 1
);

function toggle<T>(
  list: T[],
  value: T
): T[] {
  return list.includes(value)
    ? list.filter(
        (item) =>
          item !== value
      )
    : [
        ...list,
        value,
      ];
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-10 cursor-pointer touch-manipulation select-none rounded-full border px-3.5 text-[13px] font-bold transition-[transform,background-color,border-color,color] duration-100 ease-out active:scale-[0.95] ${
        active
          ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/[0.07] py-4 first:border-t-0 first:pt-1">
      <h3 className="mb-2.5 font-sans text-[10px] font-black uppercase tracking-[.18em] text-zinc-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function RangeSelects({
  label,
  options,
  range,
  onChange,
}: {
  label: string;
  options: number[];
  range: NumberRange;
  onChange: (range: NumberRange) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs font-bold text-zinc-300">
        {label}
      </span>

      <select
        aria-label={`${label} from`}
        value={range.min ?? ""}
        onChange={(event) =>
          onChange({
            ...range,
            min:
              event.target.value === ""
                ? null
                : Number(event.target.value),
          })
        }
        className="field h-11 min-w-0 flex-1 cursor-pointer !py-0"
      >
        <option value="">
          Any
        </option>
        {options.map(
          (value) => (
            <option
              key={value}
              value={value}
            >
              {value}
            </option>
          )
        )}
      </select>

      <span className="text-xs text-zinc-500">
        to
      </span>

      <select
        aria-label={`${label} to`}
        value={range.max ?? ""}
        onChange={(event) =>
          onChange({
            ...range,
            max:
              event.target.value === ""
                ? null
                : Number(event.target.value),
          })
        }
        className="field h-11 min-w-0 flex-1 cursor-pointer !py-0"
      >
        <option value="">
          Any
        </option>
        {options.map(
          (value) => (
            <option
              key={value}
              value={value}
            >
              {value}
            </option>
          )
        )}
      </select>
    </div>
  );
}

function parseStat(
  value: string
): number | null {
  const digits =
    value.replace(
      /\D/g,
      ""
    );

  return digits === ""
    ? null
    : Math.min(
        Number(digits),
        99999
      );
}

function StatInputs({
  label,
  range,
  onChange,
}: {
  label: string;
  range: NumberRange;
  onChange: (range: NumberRange) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs font-bold text-zinc-300">
        {label}
      </span>

      <input
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        aria-label={`${label} minimum`}
        placeholder="Min"
        value={range.min ?? ""}
        onChange={(event) =>
          onChange({
            ...range,
            min: parseStat(
              event.target.value
            ),
          })
        }
        className="field h-11 min-w-0 flex-1 !py-0"
      />

      <span className="text-xs text-zinc-500">
        to
      </span>

      <input
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        aria-label={`${label} maximum`}
        placeholder="Max"
        value={range.max ?? ""}
        onChange={(event) =>
          onChange({
            ...range,
            max: parseStat(
              event.target.value
            ),
          })
        }
        className="field h-11 min-w-0 flex-1 !py-0"
      />
    </div>
  );
}

export function FilterSheet({
  open,
  onClose,
  panel,
  onChange,
  rarities,
  archetypes,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  panel: PanelState;
  onChange: (
    update: (panel: PanelState) => PanelState
  ) => void;
  rarities: string[];
  archetypes: string[];
  resultCount: number;
}) {
  const {
    filters,
  } = panel;

  // Functional updates, so two quick taps never overwrite each other.
  function setFilters(
    patch: (
      current: DeckSearchFilters
    ) => Partial<DeckSearchFilters>
  ) {
    onChange(
      (current) => ({
        ...current,
        filters: {
          ...current.filters,
          ...patch(
            current.filters
          ),
        },
      })
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Filters"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              onChange(
                () => emptyPanel()
              )
            }
            className="h-12 cursor-pointer touch-manipulation rounded-xl border border-white/10 px-4 text-sm font-black text-zinc-300 transition active:scale-[0.97]"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={onClose}
            className="primary-button h-12 flex-1 cursor-pointer touch-manipulation !py-0 text-sm transition active:scale-[0.98]"
          >
            Show {resultCount} card{resultCount === 1 ? "" : "s"}
          </button>
        </div>
      }
    >
      <Section
        title="Card type"
      >
        <div className="flex flex-wrap gap-2">
          {CARD_TYPES.map(
            (option) => (
              <Chip
                key={option.value}
                active={filters.cardTypes.includes(
                  option.value
                )}
                onClick={() =>
                  setFilters((current) => ({
                    cardTypes: toggle(
                      current.cardTypes,
                      option.value
                    ),
                  }))
                }
              >
                {option.label}
              </Chip>
            )
          )}
        </div>
      </Section>

      <Section
        title="Card kind"
      >
        <div className="flex flex-wrap gap-2">
          {KINDS.map(
            (kind) => (
              <Chip
                key={kind}
                active={filters.kinds.includes(
                  kind
                )}
                onClick={() =>
                  setFilters((current) => ({
                    kinds: toggle(
                      current.kinds,
                      kind
                    ),
                  }))
                }
              >
                {KIND_LABELS[kind]}
              </Chip>
            )
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {SPELL_TRAP_TYPES.map(
            (value) => (
              <Chip
                key={value}
                active={filters.spellTrapTypes.includes(
                  value
                )}
                onClick={() =>
                  setFilters((current) => ({
                    spellTrapTypes: toggle(
                      current.spellTrapTypes,
                      value
                    ),
                  }))
                }
              >
                {value}
              </Chip>
            )
          )}
        </div>
      </Section>

      <Section
        title="Attribute"
      >
        <div className="flex flex-wrap gap-2">
          {ATTRIBUTES.map(
            (value) => (
              <Chip
                key={value}
                active={filters.attributes.includes(
                  value
                )}
                onClick={() =>
                  setFilters((current) => ({
                    attributes: toggle(
                      current.attributes,
                      value
                    ),
                  }))
                }
              >
                {value}
              </Chip>
            )
          )}
        </div>
      </Section>

      <Section
        title="Monster type"
      >
        <div className="flex flex-wrap gap-2">
          {MONSTER_RACES.map(
            (value) => (
              <Chip
                key={value}
                active={filters.races.includes(
                  value
                )}
                onClick={() =>
                  setFilters((current) => ({
                    races: toggle(
                      current.races,
                      value
                    ),
                  }))
                }
              >
                {value}
              </Chip>
            )
          )}
        </div>
      </Section>

      <Section
        title="Level / Rank"
      >
        <div className="space-y-2">
          <RangeSelects
            label="Level"
            options={LEVELS}
            range={filters.level}
            onChange={(level) =>
              setFilters(() => ({
                level,
              }))
            }
          />

          <RangeSelects
            label="Rank"
            options={RANKS}
            range={filters.rank}
            onChange={(rank) =>
              setFilters(() => ({
                rank,
              }))
            }
          />
        </div>
      </Section>

      <Section
        title="ATK / DEF"
      >
        <div className="space-y-2">
          <StatInputs
            label="ATK"
            range={filters.atk}
            onChange={(atk) =>
              setFilters(() => ({
                atk,
              }))
            }
          />

          <StatInputs
            label="DEF"
            range={filters.def}
            onChange={(def) =>
              setFilters(() => ({
                def,
              }))
            }
          />
        </div>
      </Section>

      <Section
        title="Rarity · Archetype · Sort"
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            aria-label="Rarity"
            value={panel.rarity}
            onChange={(event) =>
              onChange(
                (current) => ({
                  ...current,
                  rarity:
                    event.target.value,
                })
              )
            }
            className="field h-11 cursor-pointer !py-0"
          >
            <option value="">
              All rarities
            </option>
            {rarities.map(
              (value) => (
                <option
                  key={value}
                  value={value}
                >
                  {value}
                </option>
              )
            )}
          </select>

          <select
            aria-label="Archetype"
            value={panel.archetype}
            onChange={(event) =>
              onChange(
                (current) => ({
                  ...current,
                  archetype:
                    event.target.value,
                })
              )
            }
            className="field h-11 cursor-pointer !py-0"
          >
            <option value="">
              All archetypes
            </option>
            {archetypes.map(
              (value) => (
                <option
                  key={value}
                  value={value}
                >
                  {value}
                </option>
              )
            )}
          </select>

          <select
            aria-label="Sort by"
            value={panel.sort}
            onChange={(event) =>
              onChange(
                (current) => ({
                  ...current,
                  sort:
                    event.target.value as SortKey,
                })
              )
            }
            className="field h-11 cursor-pointer !py-0"
          >
            {SORT_OPTIONS.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              )
            )}
          </select>
        </div>
      </Section>
    </BottomSheet>
  );
}
