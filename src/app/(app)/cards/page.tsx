import Image from "next/image";
import Link from "next/link";
import {
  Heart,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { requireUser } from "@/lib/supabase/queries";
import { getLeagueIdForUser } from "@/lib/league-stats";
import { toggleWishlist } from "@/app/actions/wishlist";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState } from "@/components/empty-state";
import { MONSTER_RACES } from "@/lib/card-race";
import { fetchInBatches } from "@/lib/supabase/paginate";

export const dynamic = "force-dynamic";

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
  page?: string;
}>;

const PAGE_SIZE = 120;

const CARD_COLUMNS =
  "id,name,image_url,card_type,attribute,race,archetype,atk,def,game_rarity,rarity_score";

// Highest rarity first; cards without a rarity come last.
const RARITY_TIERS: (string | null)[] = [
  "Legendary",
  "Secret Rare",
  "Ultra Rare",
  "Super Rare",
  "Rare",
  "Normal",
  null,
];

type CatalogCard = {
  id: string;
  name: string;
  image_url: string | null;
  card_type: string | null;
  attribute: string | null;
  race: string | null;
  archetype: string | null;
  atk: number | null;
  def: number | null;
  game_rarity: string | null;
  rarity_score: number | null;
};

function plural(count: number, word: string) {
  return `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;
}

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
  const requestedPage = Math.max(1, Math.floor(Number(params.page) || 1));

  const { supabase, userId } = await requireUser();

  const leagueId = await getLeagueIdForUser(supabase, userId);

  // Multi-field search: every typed word must match somewhere on the
  // card (name, effect text, archetype, type, attribute, rarity), but
  // the words may live in different columns. That makes searches such
  // as "blue eyes", "machine", "dark spellcaster" and "quick effect"
  // behave naturally instead of only matching the card name.
  const terms = q
    .replace(/[,()"\\%*]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  function buildQuery(head = false) {
    let query = supabase
      .from("card_catalog")
      .select(CARD_COLUMNS, { count: "exact", head });

    for (const term of terms) {
      query = query.or(
        [
          `name.ilike.%${term}%`,
          `description.ilike.%${term}%`,
          `archetype.ilike.%${term}%`,
          `race.ilike.%${term}%`,
          `monster_type.ilike.%${term}%`,
          `attribute.ilike.%${term}%`,
          `card_type.ilike.%${term}%`,
          `game_rarity.ilike.%${term}%`,
        ].join(",")
      );
    }

    if (rarity) {
      query = query.eq("game_rarity", rarity);
    }

    if (attribute) {
      query = query.eq("attribute", attribute);
    }

    if (race) {
      query = query.eq("race", race);
    }

    if (type === "Monster" || type === "Spell" || type === "Trap") {
      query = query.ilike("card_type", `%${type}%`);
    }

    return query;
  }

  let cards: CatalogCard[] = [];
  let total = 0;
  let loadError: string | null = null;
  let page = requestedPage;

  if (sort === "rarity") {
    // Rarity order can't be expressed as a column sort, so page
    // tier by tier (Legendary first), each tier by power score.
    const tiers = RARITY_TIERS.filter(
      (tier) => !rarity || tier === rarity
    );

    const countResults = await Promise.all(
      tiers.map((tier) => {
        const base = buildQuery(true);

        return tier === null
          ? base.is("game_rarity", null)
          : base.eq("game_rarity", tier);
      })
    );

    loadError =
      countResults.find((result) => result.error)?.error?.message ?? null;

    const counts = countResults.map((result) => result.count ?? 0);

    total = counts.reduce((sum, count) => sum + count, 0);
    page = Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)));

    let skip = (page - 1) * PAGE_SIZE;
    let need = PAGE_SIZE;

    for (let i = 0; i < tiers.length && need > 0 && !loadError; i += 1) {
      if (skip >= counts[i]) {
        skip -= counts[i];
        continue;
      }

      const tier = tiers[i];
      const base = buildQuery();
      const { data, error } = await (tier === null
        ? base.is("game_rarity", null)
        : base.eq("game_rarity", tier))
        .order("rarity_score", { ascending: false, nullsFirst: false })
        .order("name")
        .order("id")
        .range(skip, skip + need - 1);

      if (error) {
        loadError = error.message;
        break;
      }

      const rows = (data ?? []) as CatalogCard[];

      cards.push(...rows);
      need -= rows.length;
      skip = 0;
    }
  } else {
    const fetchPage = (targetPage: number) => {
      let query = buildQuery();

      if (sort === "power") {
        query = query.order("rarity_score", { ascending: false, nullsFirst: false });
      } else if (sort === "atk") {
        query = query.order("atk", { ascending: false, nullsFirst: false });
      }

      const from = (targetPage - 1) * PAGE_SIZE;

      return query
        .order("name")
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
    };

    let result = await fetchPage(page);

    if (result.error && page > 1) {
      // A page past the end (e.g. an old link after the filters
      // changed) - show the first page instead of an error screen.
      page = 1;
      result = await fetchPage(page);
    }

    if (result.error) {
      loadError = result.error.message;
    } else {
      cards = (result.data ?? []) as CatalogCard[];
      total = result.count ?? cards.length;
    }
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="panel p-5">
          <p className="font-bold text-red-300">
            Cards could not be loaded.
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            Try a different search, or{" "}
            <Link href="/cards" className="text-amber-200 underline">
              reset the filters
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = (page - 1) * PAGE_SIZE + cards.length;

  function pageHref(targetPage: number) {
    const next = new URLSearchParams();

    if (q) next.set("q", q);
    if (rarity) next.set("rarity", rarity);
    if (type) next.set("type", type);
    if (attribute) next.set("attribute", attribute);
    if (race) next.set("race", race);
    if (sort && sort !== "name") next.set("sort", sort);
    if (targetPage > 1) next.set("page", String(targetPage));

    const search = next.toString();

    return search ? `/cards?${search}` : "/cards";
  }

  // The wishlist heart sends the player back to exactly this page.
  const currentHref = pageHref(page);

  const wishedCardIds = new Set<string>();

  if (leagueId && cards.length > 0) {
    const wishRows = await fetchInBatches<string, { card_catalog_id: string }>(
      cards.map((card) => card.id),
      (batch, from, to) =>
        supabase
          .from("card_wishlist_items")
          .select("card_catalog_id")
          .eq("profile_id", userId)
          .eq("league_id", leagueId)
          .in("card_catalog_id", batch)
          .order("card_catalog_id")
          .range(from, to)
    ).catch(() => []);

    for (const row of wishRows) {
      wishedCardIds.add(row.card_catalog_id);
    }
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
              placeholder="Search name, effect, archetype, type, attribute..."
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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          {total > cards.length
            ? `Showing ${firstShown.toLocaleString("en-US")}–${lastShown.toLocaleString("en-US")} of ${plural(total, "card")}`
            : `${plural(total, "card")} found`}
        </p>

        {pageCount > 1 && (
          <p className="text-xs text-zinc-600">
            Page {page} of {pageCount}
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

              const isWished = wishedCardIds.has(card.id);

              return (
                <div key={card.id} className="relative">
                <Link
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

                {leagueId && (
                  <form
                    action={toggleWishlist}
                    className="absolute right-2 top-2"
                  >
                    <input
                      type="hidden"
                      name="card_catalog_id"
                      value={card.id}
                    />

                    <input
                      type="hidden"
                      name="return_to"
                      value={currentHref}
                    />

                    <SubmitButton
                      pendingLabel="..."
                      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border backdrop-blur-sm transition-all ${
                        isWished
                          ? "border-rose-400/50 bg-rose-400/25 text-rose-200"
                          : "border-white/15 bg-black/40 text-zinc-300 hover:border-rose-300/40 hover:text-rose-200"
                      }`}
                    >
                      <Heart
                        size={12}
                        fill={isWished ? "currentColor" : "none"}
                      />
                    </SubmitButton>
                  </form>
                )}
                </div>
              );
            }
          )}
        </div>
      )}

      {pageCount > 1 && (
        <nav
          aria-label="Card pages"
          className="mt-6 flex items-center justify-center gap-3"
        >
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/5"
            >
              Previous
            </Link>
          ) : null}

          <span className="text-sm text-zinc-500">
            Page {page} of {pageCount}
          </span>

          {page < pageCount ? (
            <Link
              href={pageHref(page + 1)}
              className="primary-button"
            >
              Next {Math.min(PAGE_SIZE, total - page * PAGE_SIZE)} cards
            </Link>
          ) : null}
        </nav>
      )}
    </main>
  );
}