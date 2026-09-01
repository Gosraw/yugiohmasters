import Image from "next/image";
import Link from "next/link";

import {
  Clock3,
  Coins,
  Crown,
  Flame,
  Gift,
  History,
  Layers3,
  LockKeyhole,
  PackageOpen,
  ShoppingBag,
  Skull,
  Sparkles,
  Star,
  Swords,
  Ticket,
  Trophy,
} from "lucide-react";

import {
  purchasePack,
  purchaseRotationCard,
  redeemPackVoucher,
} from "@/app/actions/shop";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  PackArt,
} from "@/components/pack-art";

import {
  ShopCountdown,
} from "@/components/shop-countdown";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type SearchParams =
  Promise<{
    opening?:
      string;

    error?:
      string;

    success?:
      string;
  }>;

type Profile = {
  id: string;

  duelist_name:
    string;

  duel_points:
    number;
};

type PackType = {
  id: string;

  code:
    | "normal"
    | "premium"
    | "deluxe";

  name: string;

  description:
    | string
    | null;

  price_dp:
    number;

  cards_per_pack:
    number;
};

type RotationCard = {
  rotation_id: string;

  rotation_number:
    number;

  starts_at:
    string;

  ends_at:
    string;

  special_pack_name:
    | string
    | null;

  special_pack_description:
    | string
    | null;

  special_pack_price_dp:
    | number
    | null;

  special_pack_cards_per_pack:
    | number
    | null;

  special_pack_theme_type:
    | string
    | null;

  special_pack_theme_value:
    | string
    | null;

  special_pack_theme_label:
    | string
    | null;

  rotation_card_id:
    string;

  slot_number:
    number;

  slot_tier:
    string;

  price_dp:
    number;

  sold_to_profile_id:
    | string
    | null;

  sold_at:
    | string
    | null;

  card_catalog_id:
    string;

  card_name:
    string;

  image_url:
    | string
    | null;

  card_type:
    string;

  attribute:
    | string
    | null;

  monster_type:
    | string
    | null;

  archetype:
    | string
    | null;

  atk:
    | number
    | null;

  def:
    | number
    | null;

  game_rarity:
    | string
    | null;

  rarity_score:
    | number
    | null;
};

type SpecialPackRotation = {
  id: string;

  theme_category:
    | "attribute"
    | "archetype"
    | "monster_type";

  theme_value:
    string;

  theme_label:
    string;

  // 2026-09-02 curated-pool rebuild: which shop_special_pack_definitions
  // row this rotation was generated from - null only on a historical row
  // created before curated packs existed. Used to look up the pack's real
  // theme_description below instead of ever reconstructing a description
  // from theme_value again (see SPECIAL_CATEGORY_META.describe, now only
  // a fallback for that historical-null case).
  pack_definition_id:
    string
    | null;

  price_dp:
    number;

  cards_per_pack:
    number;

  starts_at:
    string;

  ends_at:
    string;
};

// One entry per shop_special_pack_definitions row - just enough to
// render the curated pack's real name/description in the Special Packs
// section below without re-deriving it from theme_value.
type SpecialPackDefinition = {
  id: string;

  name: string;

  theme_description: string;
};

type Voucher = {
  id: string;

  voucher_type:
    | "normal_pack"
    | "premium_pack"
    | "deluxe_pack"
    | "special_pack";

  quantity:
    number;
};

type Pull = {
  id: string;

  card_catalog_id:
    string;

  card_instance_id:
    string;

  pull_position:
    number;

  pulled_rarity:
    | string
    | null;
};

type PullCard = {
  id: string;

  name: string;

  image_url:
    | string
    | null;

  game_rarity:
    | string
    | null;

  rarity_score:
    | number
    | null;

  atk:
    | number
    | null;
};

type Purchase = {
  id: string;

  purchase_type:
    string;

  dp_spent:
    number;

  created_at:
    string;
};

type BuyerProfile = {
  id: string;

  duelist_name:
    string;
};

// =========================================================
// RARITY
// =========================================================

const rarityStyles: Record<
  string,
  string
> = {
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
    "border-yellow-300/50 bg-yellow-300/15 text-yellow-200",
};

const RARITY_RANK = [
  "Normal",
  "Rare",
  "Super Rare",
  "Ultra Rare",
  "Secret Rare",
  "Legendary",
];

// A light, subtle Boss Monster touch on a fresh pack opening -
// not a full AI reaction, just a short in-character line keyed
// off the best rarity pulled. See boss-companion-chat.tsx for
// the full AI companion.
function bossPullReaction(
  bestRarity:
    | string
    | null
) {
  if (!bestRarity) {
    return "Your Boss Monster is watching.";
  }

  const rank =
    RARITY_RANK.indexOf(
      bestRarity
    );

  if (rank >= 5) {
    return "Your Boss Monster stirs - a Legendary. Rare company.";
  }

  if (rank >= 3) {
    return "Your Boss Monster approves of that pull.";
  }

  return "Your Boss Monster nods. A solid addition to the collection.";
}

// =========================================================
// HELPERS
// =========================================================

function voucherTypeForPack(
  packCode: string
) {
  if (
    packCode ===
    "normal"
  ) {
    return "normal_pack";
  }

  if (
    packCode ===
    "premium"
  ) {
    return "premium_pack";
  }

  if (
    packCode ===
    "deluxe"
  ) {
    return "deluxe_pack";
  }

  return "special_pack";
}

// =========================================================
// SPECIAL PACK CATEGORY METADATA
//
// One entry per shop_special_pack_rotations.theme_category value.
// Drives the pack code sent to purchase_shop_pack/redeemPackVoucher,
// the card's accent color/icon, and its description line - a single
// source of truth so adding a 4th rotation category later only means
// adding one entry here rather than hunting down every ternary that
// used to hardcode "attribute vs everything else".
// =========================================================

const SPECIAL_CATEGORY_META = {
  attribute: {
    packCode: "special_attribute" as const,
    accent: {
      border: "border-emerald-300/20",
      glow: "bg-emerald-400/[0.08]",
      chip: "border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-200",
      text: "text-emerald-200",
      Icon: Flame,
      eyebrow: "Attribute Spotlight",
    },
    describe: (themeValue: string) =>
      `Every card in this pack is ${themeValue} attribute.`,
  },
  archetype: {
    packCode: "special_archetype" as const,
    accent: {
      border: "border-cyan-300/20",
      glow: "bg-cyan-400/[0.08]",
      chip: "border-cyan-300/15 bg-cyan-300/[0.05] text-cyan-200",
      text: "text-cyan-200",
      Icon: Sparkles,
      eyebrow: "Archetype Spotlight",
    },
    describe: (themeValue: string) =>
      `Every card in this pack belongs to ${themeValue}.`,
  },
  monster_type: {
    packCode: "special_monster_type" as const,
    accent: {
      border: "border-rose-300/20",
      glow: "bg-rose-400/[0.08]",
      chip: "border-rose-300/15 bg-rose-300/[0.05] text-rose-200",
      text: "text-rose-200",
      Icon: Skull,
      eyebrow: "Monster Type Spotlight",
    },
    describe: (themeValue: string) =>
      `Every card in this pack is a ${themeValue}-Type monster.`,
  },
} as const;

function packAccent(
  code: string
) {
  if (
    code ===
    "deluxe"
  ) {
    return {
      border:
        "border-violet-300/20",

      background:
        "from-violet-400/[0.08] to-black/20",

      text:
        "text-violet-200",

      icon:
        Crown,
    };
  }

  if (
    code ===
    "premium"
  ) {
    return {
      border:
        "border-amber-300/20",

      background:
        "from-amber-400/[0.08] to-black/20",

      text:
        "text-amber-200",

      icon:
        Star,
    };
  }

  if (
    code ===
    "special_attribute"
  ) {
    return {
      border:
        "border-emerald-300/20",

      background:
        "from-emerald-400/[0.08] via-cyan-400/[0.03] to-black/20",

      text:
        "text-emerald-200",

      icon:
        Flame,
    };
  }

  if (
    code ===
    "special_archetype"
  ) {
    return {
      border:
        "border-cyan-300/20",

      background:
        "from-cyan-400/[0.08] via-violet-400/[0.035] to-black/20",

      text:
        "text-cyan-200",

      icon:
        Sparkles,
    };
  }

  if (
    code ===
    "special_monster_type"
  ) {
    return {
      border:
        "border-rose-300/20",

      background:
        "from-rose-400/[0.08] via-orange-400/[0.035] to-black/20",

      text:
        "text-rose-200",

      icon:
        Skull,
    };
  }

  return {
    border:
      "border-white/10",

    background:
      "from-white/[0.05] to-black/20",

    text:
      "text-zinc-200",

    icon:
      PackageOpen,
  };
}

// =========================================================
// PAGE
// =========================================================

export default async function ShopPage({
  searchParams,
}: {
  searchParams:
    SearchParams;
}) {
  const params =
    await searchParams;

  const {
    supabase,
    userId,
  } = await requireUser();

  // ======================================================
  // ENSURE ROTATIONS ARE CURRENT
  //
  // Lazy refresh on page load: no cron dependency. Safe under
  // concurrent requests via per-rotation-type advisory locks
  // inside the function itself. Errors here are non-fatal - a
  // stale-but-still-valid rotation is far better than a broken
  // shop page, and a genuinely expired rotation with nothing to
  // show just renders the existing empty states below.
  // ======================================================

  const {
    error:
      ensureRotationsError,
  } = await supabase.rpc(
    "ensure_shop_rotations_current"
  );

  if (
    ensureRotationsError
  ) {
    console.error(
      "ensure_shop_rotations_current failed:",
      ensureRotationsError.message
    );
  }

  // ======================================================
  // PARALLEL READS
  //
  // Profile, pack types, active rotation, special rotations,
  // vouchers and recent purchases are all independent of each
  // other - fetch them together instead of waiting on each one
  // in turn.
  // ======================================================

  const [
    {
      data:
        profileData,

      error:
        profileError,
    },
    {
      data:
        packData,

      error:
        packError,
    },
    {
      data:
        rotationData,

      error:
        rotationError,
    },
    {
      data:
        specialRotationData,

      error:
        specialRotationError,
    },
    {
      data:
        packDefinitionData,

      error:
        packDefinitionError,
    },
    {
      data:
        voucherData,

      error:
        voucherError,
    },
    {
      data:
        purchaseData,

      error:
        purchaseError,
    },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id,duelist_name,duel_points"
      )
      .eq(
        "id",
        userId
      )
      .single(),

    supabase
      .from(
        "shop_pack_types"
      )
      .select(
        `
          id,
          code,
          name,
          description,
          price_dp,
          cards_per_pack
        `
      )
      .eq(
        "active",
        true
      )
      .order(
        "sort_order",
        {
          ascending:
            true,
        }
      ),

    supabase
      .from(
        "active_shop_rotation_cards"
      )
      .select("*")
      .order(
        "slot_number",
        {
          ascending:
            true,
        }
      ),

    supabase
      .from(
        "shop_special_pack_rotations"
      )
      .select(
        "id,theme_category,theme_value,theme_label,pack_definition_id,price_dp,cards_per_pack,starts_at,ends_at"
      )
      .eq(
        "status",
        "active"
      )
      .order(
        "theme_category",
        {
          ascending:
            true,
        }
      ),

    // 2026-09-02 curated-pool rebuild: the 15 fixed pack identities -
    // fetched in full (there are only ever 15) so the Special Packs
    // section can show each active rotation's real curated name/
    // description instead of a raw theme_value.
    supabase
      .from(
        "shop_special_pack_definitions"
      )
      .select(
        "id,name,theme_description"
      ),

    supabase
      .from(
        "reward_vouchers"
      )
      .select(
        "id,voucher_type,quantity"
      )
      .eq(
        "profile_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending:
            true,
        }
      ),

    supabase
      .from(
        "shop_purchases"
      )
      .select(
        "id,purchase_type,dp_spent,created_at"
      )
      .eq(
        "profile_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      )
      .limit(5),
  ]);

  if (
    profileError ||
    !profileData
  ) {
    throw new Error(
      "Profiel kon niet worden geladen."
    );
  }

  const profile =
    profileData as Profile;

  if (packError) {
    throw new Error(
      packError.message
    );
  }

  const packs =
    (packData ??
      []) as PackType[];

  if (rotationError) {
    throw new Error(
      rotationError.message
    );
  }

  const rotationCards =
    (rotationData ??
      []) as RotationCard[];

  const rotation =
    rotationCards[0] ??
    null;

  if (
    specialRotationError
  ) {
    throw new Error(
      specialRotationError.message
    );
  }

  const specialRotations =
    (specialRotationData ??
      []) as SpecialPackRotation[];

  if (packDefinitionError) {
    throw new Error(
      packDefinitionError.message
    );
  }

  // 2026-09-02 curated-pool rebuild: id -> {name, theme_description} for
  // the 15 fixed packs, so the Special Packs section below can show each
  // active rotation's real curated copy instead of re-deriving text from
  // theme_value (see SPECIAL_CATEGORY_META.describe for the fallback used
  // only on a historical rotation row with no pack_definition_id).
  const packDefinitionsById = new Map(
    (
      (packDefinitionData ??
        []) as SpecialPackDefinition[]
    ).map(
      (definition) => [definition.id, definition] as const
    )
  );

  if (voucherError) {
    throw new Error(
      voucherError.message
    );
  }

  const vouchers =
    (voucherData ??
      []) as Voucher[];

  if (purchaseError) {
    throw new Error(
      purchaseError.message
    );
  }

  const recentPurchases =
    (purchaseData ??
      []) as Purchase[];

  // ======================================================
  // SOLD BUYERS
  // ======================================================

  const buyerIds = [
    ...new Set(
      rotationCards
        .map(
          (card) =>
            card
              .sold_to_profile_id
        )
        .filter(
          (
            value
          ): value is string =>
            Boolean(value)
        )
    ),
  ];

  let buyerProfiles:
    BuyerProfile[] =
    [];

  if (
    buyerIds.length >
    0
  ) {
    const {
      data:
        buyerData,

      error:
        buyerError,
    } = await supabase
      .from("profiles")
      .select(
        "id,duelist_name"
      )
      .in(
        "id",
        buyerIds
      );

    if (buyerError) {
      throw new Error(
        buyerError.message
      );
    }

    buyerProfiles =
      (buyerData ??
        []) as BuyerProfile[];
  }

  const buyerMap =
    new Map(
      buyerProfiles.map(
        (buyer) => [
          buyer.id,
          buyer,
        ]
      )
    );

  // ======================================================
  // OPENING RESULT
  // ======================================================

  let openingPulls:
    Pull[] =
    [];

  let pullCardMap =
    new Map<
      string,
      PullCard
    >();

  if (
    params.opening
  ) {
    const {
      data:
        openingOwner,
    } = await supabase
      .from(
        "shop_pack_openings"
      )
      .select(
        "id,profile_id"
      )
      .eq(
        "id",
        params.opening
      )
      .eq(
        "profile_id",
        userId
      )
      .maybeSingle();

    if (openingOwner) {
      const {
        data:
          pullsData,

        error:
          pullsError,
      } = await supabase
        .from(
          "shop_pack_pulls"
        )
        .select(
          `
            id,
            card_catalog_id,
            card_instance_id,
            pull_position,
            pulled_rarity
          `
        )
        .eq(
          "opening_id",
          params.opening
        )
        .order(
          "pull_position",
          {
            ascending:
              true,
          }
        );

      if (pullsError) {
        throw new Error(
          pullsError.message
        );
      }

      openingPulls =
        (pullsData ??
          []) as Pull[];

      const pullCardIds = [
        ...new Set(
          openingPulls.map(
            (pull) =>
              pull
                .card_catalog_id
          )
        ),
      ];

      if (
        pullCardIds.length >
        0
      ) {
        const {
          data:
            pullCardsData,

          error:
            pullCardsError,
        } = await supabase
          .from(
            "card_catalog"
          )
          .select(
            `
              id,
              name,
              image_url,
              game_rarity,
              rarity_score,
              atk
            `
          )
          .in(
            "id",
            pullCardIds
          );

        if (
          pullCardsError
        ) {
          throw new Error(
            pullCardsError.message
          );
        }

        const pullCards =
          (pullCardsData ??
            []) as PullCard[];

        pullCardMap =
          new Map(
            pullCards.map(
              (card) => [
                card.id,
                card,
              ]
            )
          );
      }
    }
  }

  // ======================================================
  // SUMMARY
  // ======================================================

  const bestPullRarity =
    openingPulls.reduce(
      (
        best: string | null,
        pull
      ) => {
        const card =
          pullCardMap.get(
            pull.card_catalog_id
          );

        const rarity =
          card?.game_rarity ??
          pull.pulled_rarity ??
          null;

        if (!rarity) {
          return best;
        }

        if (
          !best ||
          RARITY_RANK.indexOf(
            rarity
          ) >
            RARITY_RANK.indexOf(
              best
            )
        ) {
          return rarity;
        }

        return best;
      },
      null
    );

  const availableSlots =
    rotationCards.filter(
      (card) =>
        !card.sold_at
    ).length;

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-amber-400/[0.055] blur-[160px]" />

        <div className="absolute -right-40 top-24 h-[520px] w-[520px] rounded-full bg-violet-500/[0.055] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ==================================================
            HERO
        ================================================== */}

        <header className="arena-frame relative overflow-hidden rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-white/[0.045] via-black/50 to-black/80 p-5 shadow-[0_30px_100px_rgba(0,0,0,.5)] sm:p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-amber-400/[0.07] blur-[100px]" />

            <div className="absolute bottom-[-120px] left-[25%] h-64 w-64 rounded-full bg-violet-500/[0.06] blur-[100px]" />
          </div>

          <div className="relative flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-7">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
                <ShoppingBag
                  size={12}
                />

                Duelist Shop
              </div>

              <h1 className="gold-text mt-3 text-3xl font-black sm:mt-5 sm:text-4xl md:text-5xl">
                Shop
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                Spend hard-earned Duel Points on packs and limited cards. The six featured cards are shared by the entire league — first duelist to buy one gets it.
              </p>

              <div className="mt-4 flex flex-wrap gap-3 sm:mt-6">
                <Link
                  href="/cards/collection"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition hover:border-amber-300/20 hover:text-amber-200"
                >
                  <Layers3
                    size={16}
                  />

                  Collection
                </Link>

                <Link
                  href="/league"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition hover:border-cyan-300/20 hover:text-cyan-200"
                >
                  <Trophy
                    size={16}
                  />

                  League
                </Link>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-300/15 bg-black/35 px-4 py-3 sm:min-w-[220px] sm:flex-col sm:items-stretch sm:justify-start sm:p-5">
              <div className="flex items-center gap-2">
                <Coins
                  size={16}
                  className="text-cyan-300"
                />

                <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
                  Duel Point Balance
                </p>
              </div>

              <p className="flex items-baseline gap-1 text-2xl font-black text-cyan-100 sm:mt-3 sm:block sm:text-4xl">
                {
                  profile.duel_points
                }

                <span className="text-xs font-black uppercase tracking-wider text-cyan-300 sm:mt-1 sm:block">
                  DP
                </span>
              </p>
            </div>
          </div>
        </header>

        {/* Success/error messages are shown by the shared
            ActionFeedbackBanner in the (app) layout. */}

        {/* ==================================================
            PACK OPENING RESULT
        ================================================== */}

        {openingPulls.length >
          0 && (
          <section className="relative mt-6 overflow-hidden rounded-[26px] border border-amber-300/25 bg-gradient-to-br from-amber-400/[0.07] via-black/40 to-violet-500/[0.06] p-6">
            <div className="flex items-center gap-3">
              <PackageOpen
                size={22}
                className="text-amber-300"
              />

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-amber-300">
                  Pack Opened
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Your Pulls
                </h2>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
              {openingPulls.map(
                (pull) => {
                  const card =
                    pullCardMap.get(
                      pull
                        .card_catalog_id
                    );

                  if (!card) {
                    return null;
                  }

                  const rarity =
                    card.game_rarity ??
                    pull.pulled_rarity ??
                    "Not Rated";

                  const style =
                    rarityStyles[
                      rarity
                    ] ??
                    "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";

                  return (
                    <Link
                      key={
                        pull.id
                      }
                      href={`/cards/${card.id}?returnTo=/shop`}
                      className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-black/20 transition hover:-translate-y-1 hover:border-amber-300/20"
                    >
                      <div className="relative">
                        {card.image_url ? (
                          <Image
                            src={
                              card.image_url
                            }
                            alt={
                              card.name
                            }
                            width={
                              421
                            }
                            height={
                              614
                            }
                            className="aspect-[421/614] h-auto w-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex aspect-[421/614] items-center justify-center text-xs text-zinc-700">
                            No image
                          </div>
                        )}

                        <span
                          className={`absolute left-2 top-2 rounded-full border px-2 py-1 text-[7px] font-black uppercase backdrop-blur-md ${style}`}
                        >
                          {
                            rarity
                          }
                        </span>
                      </div>

                      <div className="p-3">
                        <p className="line-clamp-2 text-xs font-black">
                          {
                            card.name
                          }
                        </p>
                      </div>
                    </Link>
                  );
                }
              )}
            </div>

            <p className="mt-5 flex items-center gap-2 text-xs font-bold text-violet-200/80">
              <Crown
                size={13}
                className="text-amber-300"
              />

              {bossPullReaction(
                bestPullRarity
              )}
            </p>

            <div className="mt-4">
              <Link
                href="/shop"
                className="text-sm font-black text-amber-300 transition hover:text-amber-200"
              >
                Close Opening
              </Link>
            </div>
          </section>
        )}

        {/* ==================================================
            SHOP STATUS
        ================================================== */}

        <section className="mt-5 grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4">
          <div className="panel p-3 sm:p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Rotation
            </p>

            <p className="mt-1 text-base font-black text-amber-200 sm:text-xl">
              #
              {
                rotation
                  ?.rotation_number ??
                "—"
              }
            </p>
          </div>

          <div className="panel p-3 sm:p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Singles Refresh
            </p>

            <p className="mt-1 text-base font-black text-cyan-200 sm:text-xl">
              <ShopCountdown
                endsAt={
                  rotation?.ends_at
                }
              />
            </p>
          </div>

          <div className="panel p-3 sm:p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Cards Left
            </p>

            <p className="mt-1 text-base font-black text-emerald-200 sm:text-xl">
              {
                availableSlots
              }{" "}
              / 6
            </p>
          </div>

        </section>

        {/* ==================================================
            STANDARD PACKS
        ================================================== */}

        <section className="mt-8">
          <div className="flex items-center gap-3">
            <PackageOpen
              size={19}
              className="text-amber-300"
            />

            <div>
              <p className="text-[9px] font-black uppercase tracking-[.2em] text-amber-300">
                Sealed Product
              </p>

              <h2 className="mt-1 text-2xl font-black">
                Packs
              </h2>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map(
              (pack) => {
                const accent =
                  packAccent(
                    pack.code
                  );

                const neededVoucherType =
                  voucherTypeForPack(
                    pack.code
                  );

                const voucher =
                  vouchers.find(
                    (item) =>
                      item.voucher_type ===
                      neededVoucherType
                  );

                const canAfford =
                  profile.duel_points >=
                  pack.price_dp;

                return (
                  <div
                    key={
                      pack.id
                    }
                    className={`relative flex gap-4 overflow-hidden rounded-[22px] border bg-gradient-to-br p-4 ${accent.border} ${accent.background}`}
                  >
                    <div className="w-24 shrink-0 sm:w-28">
                      <PackArt
                        code={
                          pack.code
                        }
                        name={
                          pack.name
                        }
                      />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-black leading-tight">
                          {
                            pack.name
                          }
                        </h3>

                        <span className="shrink-0 rounded-full border border-cyan-300/15 bg-black/30 px-2 py-1 text-[8px] font-black uppercase text-cyan-200">
                          {
                            pack.cards_per_pack
                          }{" "}
                          cards
                        </span>
                      </div>

                      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-zinc-500">
                        {
                          pack.description
                        }
                      </p>

                      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
                            Price
                          </p>

                          <p className="mt-1 text-xl font-black text-cyan-100">
                            {
                              pack.price_dp
                            }{" "}
                            <span className="text-xs text-cyan-300">
                              DP
                            </span>
                          </p>
                        </div>

                        <form
                          action={
                            purchasePack
                          }
                        >
                          <input
                            type="hidden"
                            name="pack_code"
                            value={
                              pack.code
                            }
                          />

                          <SubmitButton
                            disabled={
                              !canAfford
                            }
                            pendingLabel="Opening..."
                            className="primary-button px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            Open
                          </SubmitButton>
                        </form>
                      </div>

                      {voucher && (
                        <div className="mt-3 border-t border-white/[0.06] pt-3">
                          <form
                            action={
                              redeemPackVoucher
                            }
                          >
                            <input
                              type="hidden"
                              name="pack_code"
                              value={
                                pack.code
                              }
                            />

                            <input
                              type="hidden"
                              name="voucher_id"
                              value={
                                voucher.id
                              }
                            />

                            <SubmitButton
                              pendingLabel="Opening..."
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[0.05] px-3 py-2 text-xs font-black text-violet-200"
                            >
                              <Ticket
                                size={13}
                              />

                              Use Voucher · x
                              {
                                voucher.quantity
                              }
                            </SubmitButton>
                          </form>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </section>

        {/* ==================================================
            SPECIAL PACKS — Attribute, Archetype and Monster Type
            Spotlight, side by side. Each rotates independently on
            its own 48h clock and is driven by real catalog data
            (see refresh_shop_special_pack_rotation_if_needed). A
            category can be legitimately absent if the catalog
            doesn't currently have enough eligible cards for any
            theme in it, or its rotation simply hasn't refreshed
            yet - the section quietly shows however many are
            currently active (1-3) rather than a broken placeholder.
        ================================================== */}

        {specialRotations.length >
          0 && (
          <section className="mt-8 grid gap-5 lg:grid-cols-3">
            {specialRotations.map(
              (special) => {
                const categoryMeta =
                  SPECIAL_CATEGORY_META[
                    special.theme_category as keyof typeof SPECIAL_CATEGORY_META
                  ] ??
                  SPECIAL_CATEGORY_META.archetype;

                const packCode =
                  categoryMeta.packCode;

                const accent =
                  categoryMeta.accent;

                // 2026-09-02 curated-pool rebuild: prefer the pack's own
                // curated description; fall back to the old theme_value-
                // derived copy only for a historical rotation row with no
                // pack_definition_id (should not occur going forward).
                const packDefinition =
                  special.pack_definition_id
                    ? packDefinitionsById.get(
                        special.pack_definition_id
                      )
                    : undefined;

                const packDescription =
                  packDefinition?.theme_description ??
                  categoryMeta.describe(
                    special.theme_value
                  );

                const voucher =
                  vouchers.find(
                    (item) =>
                      item.voucher_type ===
                      "special_pack"
                  );

                return (
                  <div
                    key={
                      special.id
                    }
                    className={`relative overflow-hidden rounded-[26px] border bg-gradient-to-br from-white/[0.03] to-black/60 p-6 ${accent.border}`}
                  >
                    <div
                      className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-[90px] ${accent.glow}`}
                    />

                    <div className="relative flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <accent.Icon
                          size={16}
                          className={
                            accent.text
                          }
                        />

                        <p
                          className={`text-[9px] font-black uppercase tracking-[.2em] ${accent.text}`}
                        >
                          {
                            accent.eyebrow
                          }
                        </p>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tabular-nums ${accent.chip}`}
                      >
                        <Clock3
                          size={11}
                        />

                        <ShopCountdown
                          endsAt={
                            special.ends_at
                          }
                        />
                      </span>
                    </div>

                    <div className="relative mt-4 flex gap-4">
                      <div className="w-20 shrink-0 sm:w-24">
                        <PackArt
                          code={
                            packCode
                          }
                          name={
                            special.theme_label
                          }
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h2 className="text-2xl font-black leading-tight">
                          {
                            special.theme_label
                          }
                        </h2>

                        <p className="mt-1 text-xs text-zinc-500">
                          {
                            packDescription
                          }
                        </p>

                        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
                              Price
                            </p>

                            <p
                              className={`mt-1 text-2xl font-black ${accent.text}`}
                            >
                              {
                                special.price_dp
                              }{" "}
                              <span className="text-xs font-black text-zinc-500">
                                DP
                              </span>{" "}
                              <span className="text-xs font-normal text-zinc-600">
                                ·{" "}
                                {
                                  special.cards_per_pack
                                }{" "}
                                cards
                              </span>
                            </p>
                          </div>

                          <form
                            action={
                              purchasePack
                            }
                          >
                            <input
                              type="hidden"
                              name="pack_code"
                              value={
                                packCode
                              }
                            />

                            <SubmitButton
                              disabled={
                                profile.duel_points <
                                special.price_dp
                              }
                              pendingLabel="Opening..."
                              className="primary-button px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Open
                            </SubmitButton>
                          </form>
                        </div>

                        {voucher && (
                          <form
                            action={
                              redeemPackVoucher
                            }
                            className="mt-3 border-t border-white/[0.06] pt-3"
                          >
                            <input
                              type="hidden"
                              name="pack_code"
                              value={
                                packCode
                              }
                            />

                            <input
                              type="hidden"
                              name="voucher_id"
                              value={
                                voucher.id
                              }
                            />

                            <SubmitButton
                              pendingLabel="Opening..."
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[0.05] px-3 py-2 text-xs font-black text-violet-200"
                            >
                              <Ticket
                                size={13}
                              />

                              Use Voucher · x
                              {
                                voucher.quantity
                              }
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </section>
        )}

        {/* ==================================================
            SIX SHARED CARDS
        ================================================== */}

        <section className="mt-9">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <Flame
                size={19}
                className="text-red-300"
              />

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-red-300">
                  First Come, First Served
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Limited Cards
                </h2>
              </div>
            </div>

            <p className="text-xs text-zinc-600">
              One purchase total per slot · shared by the whole league
            </p>
          </div>

          {rotationCards.length ===
          0 ? (
            <div className="panel mt-4 p-8 text-center">
              <Clock3
                size={26}
                className="mx-auto text-zinc-700"
              />

              <p className="mt-3 font-black">
                No active rotation
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {rotationCards.map(
                (slot) => {
                  const rarity =
                    slot.game_rarity ??
                    "Not Rated";

                  const rarityStyle =
                    rarityStyles[
                      rarity
                    ] ??
                    "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";

                  const sold =
                    Boolean(
                      slot.sold_at
                    );

                  const buyer =
                    slot
                      .sold_to_profile_id
                      ? buyerMap.get(
                          slot
                            .sold_to_profile_id
                        )
                      : null;

                  const canAfford =
                    profile.duel_points >=
                    slot.price_dp;

                  return (
                    <div
                      key={
                        slot.rotation_card_id
                      }
                      className={`panel relative overflow-hidden ${
                        sold
                          ? "opacity-65"
                          : "hover:border-amber-300/20"
                      }`}
                    >
                      <Link
                        href={`/cards/${slot.card_catalog_id}?returnTo=/shop`}
                        className="group block"
                      >
                        <div className="relative">
                          {slot.image_url ? (
                            <Image
                              src={
                                slot.image_url
                              }
                              alt={
                                slot.card_name
                              }
                              width={
                                421
                              }
                              height={
                                614
                              }
                              className="aspect-[421/614] h-auto w-full object-cover transition group-hover:scale-[1.015]"
                              unoptimized
                            />
                          ) : (
                            <div className="flex aspect-[421/614] items-center justify-center text-xs text-zinc-700">
                              No image
                            </div>
                          )}

                          <div className="absolute left-2 top-2">
                            <span
                              className={`rounded-full border px-2 py-1 text-[7px] font-black uppercase backdrop-blur-md ${rarityStyle}`}
                            >
                              {
                                rarity
                              }
                            </span>
                          </div>

                          <div className="absolute right-2 top-2">
                            <span className="rounded-full border border-black/30 bg-black/80 px-2 py-1 text-[7px] font-black uppercase text-zinc-300">
                              {
                                slot.slot_tier
                              }
                            </span>
                          </div>

                          {sold && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[1px]">
                              <div className="text-center">
                                <LockKeyhole
                                  size={24}
                                  className="mx-auto text-red-300"
                                />

                                <p className="mt-2 text-sm font-black uppercase tracking-wider text-red-200">
                                  Sold
                                </p>

                                {buyer && (
                                  <p className="mt-1 text-[9px] font-black text-zinc-400">
                                    {
                                      buyer.duelist_name
                                    }
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="p-3">
                          <p className="line-clamp-2 min-h-10 text-sm font-black">
                            {
                              slot.card_name
                            }
                          </p>

                          <div className="mt-2 flex items-center justify-between text-[9px] text-zinc-600">
                            <span>
                              {slot.atk !=
                              null
                                ? `ATK ${slot.atk}`
                                : slot.card_type}
                            </span>

                            {slot.rarity_score !=
                              null && (
                              <span>
                                {Number(
                                  slot.rarity_score
                                ).toFixed(
                                  1
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>

                      <div className="border-t border-white/[0.06] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[7px] font-black uppercase tracking-wider text-zinc-600">
                              Price
                            </p>

                            <p className="mt-1 text-lg font-black text-cyan-100">
                              {
                                slot.price_dp
                              }{" "}
                              <span className="text-[9px] text-cyan-300">
                                DP
                              </span>
                            </p>
                          </div>

                          {!sold && (
                            <form
                              action={
                                purchaseRotationCard
                              }
                            >
                              <input
                                type="hidden"
                                name="rotation_card_id"
                                value={
                                  slot.rotation_card_id
                                }
                              />

                              <SubmitButton
                                disabled={
                                  !canAfford
                                }
                                pendingLabel="Buying..."
                                className="rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-3 py-2 text-[10px] font-black text-amber-200 transition hover:bg-amber-300/[0.12] disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                Buy
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>

        {/* ==================================================
            VOUCHERS
        ================================================== */}

        <section className="panel mt-8 p-5">
          <div className="flex items-center gap-3">
            <Gift
              size={18}
              className="text-violet-300"
            />

            <div>
              <p className="text-[9px] font-black uppercase tracking-[.2em] text-violet-300">
                Tournament Rewards
              </p>

              <h2 className="mt-1 text-lg font-black">
                Pack Vouchers
              </h2>
            </div>
          </div>

          {vouchers.length ===
          0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              You currently have no pack vouchers. Competition and tournament prizes can award them later.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {vouchers.map(
                (voucher) => (
                  <span
                    key={
                      voucher.id
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-300/15 bg-violet-300/[0.04] px-3 py-2 text-xs font-black text-violet-200"
                  >
                    <Ticket
                      size={13}
                    />

                    {voucher.voucher_type
                      .replace(
                        "_pack",
                        ""
                      )
                      .replace(
                        "_",
                        " "
                      )
                      .toUpperCase()}

                    {" · "}x
                    {
                      voucher.quantity
                    }
                  </span>
                )
              )}
            </div>
          )}
        </section>

        {/* ==================================================
            RECENT PURCHASES
        ================================================== */}

        {recentPurchases.length >
          0 && (
          <section className="mt-8">
            <div className="flex items-center gap-3">
              <History
                size={17}
                className="text-zinc-500"
              />

              <div>
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-zinc-600">
                  Your History
                </p>

                <h2 className="mt-1 text-lg font-black text-zinc-300">
                  Recent Purchases
                </h2>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {recentPurchases.map(
                (purchase) => (
                  <div
                    key={
                      purchase.id
                    }
                    className="panel flex items-center justify-between gap-4 p-4"
                  >
                    <div className="flex items-center gap-3">
                      {purchase.purchase_type ===
                      "single_card" ? (
                        <Star
                          size={15}
                          className="text-amber-300"
                        />
                      ) : (
                        <PackageOpen
                          size={15}
                          className="text-violet-300"
                        />
                      )}

                      <p className="text-sm font-black capitalize text-zinc-300">
                        {purchase.purchase_type.replace(
                          "_",
                          " "
                        )}
                      </p>
                    </div>

                    <p className="text-sm font-black text-cyan-200">
                      {purchase.dp_spent >
                      0
                        ? `-${purchase.dp_spent} DP`
                        : "Voucher"}
                    </p>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {/* ==================================================
            ECONOMY INFO
        ================================================== */}

        <section className="panel mt-8 p-5">
          <div className="flex items-start gap-3">
            <Swords
              size={18}
              className="mt-0.5 shrink-0 text-amber-300"
            />

            <div>
              <p className="font-black">
                Earn First. Spend Carefully.
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Duel Points are earned through official competition and tournament rewards. Practice Duels do not generate free DP. Shop progression is intentionally slow so strong cards stay meaningful.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}