import Image from "next/image";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { requireUser } from "@/lib/supabase/queries";
import { EmptyState } from "@/components/empty-state";
import { MONSTER_RACES } from "@/lib/card-race";

export const dynamic = "force-dynamic";

const rarityOrder: Record<string, number> = {
  Normal: 1,
  Rare: 2,
  "Super Rare": 3,
  "Ultra Rare": 4,
  "Secret Rare": 5,
  Legendary: 6,
};

const rarityStyles: Record<string, string> = {
  Normal:
    "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  Rare:
    "border-blue-400/30 bg-blue-400/10 text-blue-300",
  "Super Rare":
    "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
  "Ultra Rare":
    "border-amber-300/40 bg-amber-300/10 text-amber-200",
  "Secret Rare":
    "border-violet-300/40 bg-violet-300/10 text-violet-200",
  Legendary:
    "border-yellow-300/50 bg-yellow-300/15 text-yellow-200 shadow-[0_0_20px_rgba(250,204,21,0.10)]",
};

type SearchParams = Promise<{
  q?: string;
  rarity?: string;
  type?: string;
  attribute?: string;
  race?: string;
  sort?: string;
}>;

export default async function CardsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const q = params.q?.trim() ?? "";
  const rarity = params.rarity ?? "";
  const type = params.type ?? "";
  const attribute = params.attribute ?? "";
  const race = params.race ?? "";
  const sort = params.sort ?? "name";

  const { supabase } = await requireUser();

  let query = supabase
    .from("card_catalog")
    .select(
      "id,name,image_url,card_type,attribute,race,archetype,atk,def,game_rarity,rarity_score"
    );

  if (q) {
    // Name OR effect text OR archetype, case-insensitive - reuses this
    // same query builder rather than a separate search service. Commas
    // and parentheses are stripped before building the PostgREST
    // .or() filter string below since those characters are part of
    // its own filter grammar (comma separates conditions, parens are
    // reserved) - safe to drop for a card-name/effect search, and
    // avoids either a broken filter or a query-injection surface from
    // unescaped user input.
    const safeQ = q.replace(/[,()]/g, "");

    query = query.or(
      `name.ilike.%${safeQ}%,description.ilike.%${safeQ}%,archetype.ilike.%${safeQ}%`
    );
  }

  if (rarity) {
    query = query.eq(
      "game_rarity",
      rarity
    );
  }

  if (attribute) {
    query = query.eq(
      "attribute",
      attribute
    );
  }

  if (race) {
    query = query.eq(
      "race",
      race
    );
  }

  if (type === "Monster") {
    query = query.ilike(
      "card_type",
      "%Monster%"
    );
  }

  if (type === "Spell") {
    query = query.ilike(
      "card_type",
      "%Spell%"
    );
  }

  if (type === "Trap") {
    query = query.ilike(
      "card_type",
      "%Trap%"
    );
  }

  if (sort === "power") {
    query = query
      .order(
        "rarity_score",
        {
          ascending: false,
          nullsFirst: false,
        }
      )
      .order("name");
  } else if (sort === "atk") {
    query = query
      .order(
        "atk",
        {
          ascending: false,
          nullsFirst: false,
        }
      )
      .order("name");
  } else {
    query = query.order("name");
  }

  const {
    data,
    error,
  } = await query.limit(120);

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="panel p-5">
          <p className="font-bold text-red-300">
            Kaarten konden niet worden geladen.
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            {error.message}
          </p>
        </div>
      </main>
    );
  }

  let cards = data ?? [];

  if (sort === "rarity") {
    cards = [...cards].sort(
      (a, b) => {
        const aRarity =
          rarityOrder[
            a.game_rarity ?? ""
          ] ?? 0;

        const bRarity =
          rarityOrder[
            b.game_rarity ?? ""
          ] ?? 0;

        if (
          bRarity !== aRarity
        ) {
          return (
            bRarity - aRarity
          );
        }

        return (
          Number(
            b.rarity_score ?? 0
          ) -
          Number(
            a.rarity_score ?? 0
          )
        );
      }
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-black tracking-[.28em] text-amber-300">
          CARD DATABASE
        </p>

        <h1 className="gold-text mt-2 text-4xl font-black">
          Cards
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Browse the full Duelist Circle card database.
        </p>
      </header>

      <form
        method="get"
        className="panel mt-6 p-4 sm:p-5"
      >
        <div className="flex items-center gap-2 text-sm font-black text-amber-300">
          <SlidersHorizontal
            size={17}
          />
          Search & Filters
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
          <label className="relative lg:col-span-2">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />

            <input
              name="q"
              defaultValue={q}
              placeholder="Search name, effect text or archetype..."
              className="field pl-10"
            />
          </label>

          <select
            name="rarity"
            defaultValue={rarity}
            className="field"
          >
            <option value="">
              All rarities
            </option>

            <option value="Normal">
              Normal
            </option>

            <option value="Rare">
              Rare
            </option>

            <option value="Super Rare">
              Super Rare
            </option>

            <option value="Ultra Rare">
              Ultra Rare
            </option>

            <option value="Secret Rare">
              Secret Rare
            </option>

            <option value="Legendary">
              Legendary
            </option>
          </select>

          <select
            name="type"
            defaultValue={type}
            className="field"
          >
            <option value="">
              All card types
            </option>

            <option value="Monster">
              Monster
            </option>

            <option value="Spell">
              Spell
            </option>

            <option value="Trap">
              Trap
            </option>
          </select>

          <select
            name="attribute"
            defaultValue={attribute}
            className="field"
          >
            <option value="">
              All attributes
            </option>

            <option value="DARK">
              DARK
            </option>

            <option value="LIGHT">
              LIGHT
            </option>

            <option value="EARTH">
              EARTH
            </option>

            <option value="WATER">
              WATER
            </option>

            <option value="FIRE">
              FIRE
            </option>

            <option value="WIND">
              WIND
            </option>

            <option value="DIVINE">
              DIVINE
            </option>
          </select>

          <select
            name="race"
            defaultValue={race}
            className="field"
          >
            <option value="">
              All monster types
            </option>

            {MONSTER_RACES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <select
            name="sort"
            defaultValue={sort}
            className="field"
          >
            <option value="name">
              Sort: Name
            </option>

            <option value="power">
              Sort: Power score
            </option>

            <option value="rarity">
              Sort: Rarity
            </option>

            <option value="atk">
              Sort: ATK
            </option>
          </select>

          <button
            type="submit"
            className="primary-button"
          >
            Apply
          </button>

          <Link
            href="/cards"
            className="flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-500">
          {cards.length} cards shown
        </p>

        {cards.length ===
          120 && (
          <p className="text-xs text-zinc-600">
            Showing first 120 results
          </p>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={<Search size={22} />}
            title="No cards match that search."
            description="Try a different name, effect keyword, rarity, type or attribute."
          />
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {cards.map(
            (card) => {
              const rarityName =
                card.game_rarity ??
                "Not Rated";

              const rarityStyle =
                rarityStyles[
                  rarityName
                ] ??
                "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";

              return (
                <Link
                  key={card.id}
                  href={`/cards/${card.id}`}
                  className="panel group block overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-amber-300/25"
                >
                  <div className="relative bg-black/20">
                    {card.image_url ? (
                      <Image
                        src={
                          card.image_url
                        }
                        alt={
                          card.name
                        }
                        width={421}
                        height={614}
                        className="aspect-[421/614] h-auto w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        unoptimized
                      />
                    ) : (
                      <div className="flex aspect-[421/614] items-center justify-center text-xs text-zinc-600">
                        No image
                      </div>
                    )}

                    <div className="absolute left-2 top-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider backdrop-blur-md ${rarityStyle}`}
                      >
                        <Sparkles
                          size={10}
                        />

                        {rarityName}
                      </span>
                    </div>
                  </div>

                  <div className="p-3">
                    <p className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-zinc-100">
                      {card.name}
                    </p>

                    <p className="mt-1 truncate text-xs text-zinc-500">
                      {
                        card.card_type
                      }
                    </p>

                    <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
                      {card.rarity_score !=
                      null ? (
                        <span className="text-xs font-bold text-amber-200">
                          {Number(
                            card.rarity_score
                          ).toFixed(
                            1
                          )}
                        </span>
                      ) : (
                        <span />
                      )}

                      {card.atk !=
                        null && (
                        <span className="text-[10px] text-zinc-500">
                          ATK{" "}
                          {
                            card.atk
                          }
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            }
          )}
        </div>
      )}
    </main>
  );
}