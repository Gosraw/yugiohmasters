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

// =========================================================
// HELPERS
// =========================================================

function formatRemaining(
  endsAt:
    | string
    | undefined
) {
  if (!endsAt) {
    return "No rotation";
  }

  const difference =
    new Date(
      endsAt
    ).getTime() -
    Date.now();

  if (difference <= 0) {
    return "Rotation ended";
  }

  const hours =
    Math.floor(
      difference /
        3_600_000
    );

  const minutes =
    Math.floor(
      (
        difference %
        3_600_000
      ) /
        60_000
    );

  if (hours >= 24) {
    const days =
      Math.floor(
        hours / 24
      );

    const remainingHours =
      hours % 24;

    return `${days}d ${remainingHours}h`;
  }

  return `${hours}h ${minutes}m`;
}

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
    "special"
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
  // PROFILE / DP
  // ======================================================

  const {
    data:
      profileData,

    error:
      profileError,
  } = await supabase
    .from("profiles")
    .select(
      "id,duelist_name,duel_points"
    )
    .eq(
      "id",
      userId
    )
    .single();

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

  // ======================================================
  // PACK TYPES
  // ======================================================

  const {
    data:
      packData,

    error:
      packError,
  } = await supabase
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
    );

  if (packError) {
    throw new Error(
      packError.message
    );
  }

  const packs =
    (packData ??
      []) as PackType[];

  // ======================================================
  // ACTIVE ROTATION
  // ======================================================

  const {
    data:
      rotationData,

    error:
      rotationError,
  } = await supabase
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
    );

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

  // ======================================================
  // VOUCHERS
  // ======================================================

  const {
    data:
      voucherData,

    error:
      voucherError,
  } = await supabase
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
    );

  if (voucherError) {
    throw new Error(
      voucherError.message
    );
  }

  const vouchers =
    (voucherData ??
      []) as Voucher[];

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
  // RECENT PURCHASES
  // ======================================================

  const {
    data:
      purchaseData,

    error:
      purchaseError,
  } = await supabase
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
    .limit(5);

  if (purchaseError) {
    throw new Error(
      purchaseError.message
    );
  }

  const recentPurchases =
    (purchaseData ??
      []) as Purchase[];

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

  const availableSlots =
    rotationCards.filter(
      (card) =>
        !card.sold_at
    ).length;

  const voucherTotal =
    vouchers.reduce(
      (
        total,
        voucher
      ) =>
        total +
        voucher.quantity,
      0
    );

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

        <header className="relative overflow-hidden rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-white/[0.045] via-black/50 to-black/80 p-6 shadow-[0_30px_100px_rgba(0,0,0,.5)] sm:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-amber-400/[0.07] blur-[100px]" />

            <div className="absolute bottom-[-120px] left-[25%] h-64 w-64 rounded-full bg-violet-500/[0.06] blur-[100px]" />
          </div>

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
                <ShoppingBag
                  size={12}
                />

                Duelist Shop
              </div>

              <h1 className="gold-text mt-5 text-4xl font-black sm:text-5xl">
                Shop
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                Spend hard-earned Duel Points on packs and limited cards. The six featured cards are shared by the entire league — first duelist to buy one gets it.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
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

            <div className="min-w-[220px] rounded-2xl border border-cyan-300/15 bg-black/35 p-5">
              <div className="flex items-center gap-2">
                <Coins
                  size={16}
                  className="text-cyan-300"
                />

                <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
                  Duel Point Balance
                </p>
              </div>

              <p className="mt-3 text-4xl font-black text-cyan-100">
                {
                  profile.duel_points
                }
              </p>

              <p className="mt-1 text-xs font-black uppercase tracking-wider text-cyan-300">
                DP
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

            <div className="mt-5">
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

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Rotation
            </p>

            <p className="mt-1 text-xl font-black text-amber-200">
              #
              {
                rotation
                  ?.rotation_number ??
                "—"
              }
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Refreshes In
            </p>

            <p className="mt-1 text-xl font-black text-cyan-200">
              {formatRemaining(
                rotation?.ends_at
              )}
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Cards Left
            </p>

            <p className="mt-1 text-xl font-black text-emerald-200">
              {
                availableSlots
              }{" "}
              / 6
            </p>
          </div>

          <div className="panel p-4">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Pack Vouchers
            </p>

            <p className="mt-1 text-xl font-black text-violet-200">
              {
                voucherTotal
              }
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

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {packs.map(
              (pack) => {
                const accent =
                  packAccent(
                    pack.code
                  );

                const Icon =
                  accent.icon;

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
                    className={`relative overflow-hidden rounded-[22px] border bg-gradient-to-br p-5 ${accent.border} ${accent.background}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/30 ${accent.text}`}
                      >
                        <Icon
                          size={20}
                        />
                      </div>

                      <span className="rounded-full border border-cyan-300/15 bg-black/30 px-3 py-1 text-[9px] font-black uppercase text-cyan-200">
                        {
                          pack.cards_per_pack
                        }{" "}
                        cards
                      </span>
                    </div>

                    <h3 className="mt-5 text-xl font-black">
                      {
                        pack.name
                      }
                    </h3>

                    <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-500">
                      {
                        pack.description
                      }
                    </p>

                    <div className="mt-5 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
                          Price
                        </p>

                        <p className="mt-1 text-2xl font-black text-cyan-100">
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
                          className="primary-button disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          Open
                        </SubmitButton>
                      </form>
                    </div>

                    {voucher && (
                      <div className="mt-4 border-t border-white/[0.06] pt-4">
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
                            className="inline-flex items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[0.05] px-3 py-2 text-xs font-black text-violet-200"
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
                );
              }
            )}
          </div>
        </section>

        {/* ==================================================
            SPECIAL PACK
        ================================================== */}

        {rotation &&
          rotation.special_pack_name &&
          rotation.special_pack_price_dp &&
          rotation.special_pack_cards_per_pack && (
          <section className="relative mt-8 overflow-hidden rounded-[26px] border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.07] via-violet-500/[0.05] to-black/60 p-6">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-400/[0.08] blur-[90px]" />

            <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles
                    size={18}
                    className="text-cyan-300"
                  />

                  <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">
                    72-Hour Special
                  </p>
                </div>

                <h2 className="mt-3 text-3xl font-black">
                  {
                    rotation.special_pack_name
                  }
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  {
                    rotation.special_pack_description
                  }
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] px-3 py-1 text-[9px] font-black uppercase text-cyan-200">
                    {
                      rotation.special_pack_cards_per_pack
                    }{" "}
                    Cards
                  </span>

                  <span className="rounded-full border border-violet-300/15 bg-violet-300/[0.05] px-3 py-1 text-[9px] font-black uppercase text-violet-200">
                    {
                      rotation.special_pack_theme_label ??
                      rotation.special_pack_theme_value
                    }
                  </span>
                </div>
              </div>

              <div className="min-w-[190px]">
                <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">
                  Price
                </p>

                <p className="mt-1 text-3xl font-black text-cyan-100">
                  {
                    rotation.special_pack_price_dp
                  }{" "}
                  <span className="text-sm text-cyan-300">
                    DP
                  </span>
                </p>

                <form
                  action={
                    purchasePack
                  }
                  className="mt-3"
                >
                  <input
                    type="hidden"
                    name="pack_code"
                    value="special"
                  />

                  <SubmitButton
                    disabled={
                      profile.duel_points <
                      rotation.special_pack_price_dp
                    }
                    pendingLabel="Opening..."
                    className="primary-button w-full disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Open Special Pack
                  </SubmitButton>
                </form>

                {(() => {
                  const voucher =
                    vouchers.find(
                      (item) =>
                        item.voucher_type ===
                        "special_pack"
                    );

                  if (!voucher) {
                    return null;
                  }

                  return (
                    <form
                      action={
                        redeemPackVoucher
                      }
                      className="mt-2"
                    >
                      <input
                        type="hidden"
                        name="pack_code"
                        value="special"
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
                        className="w-full rounded-xl border border-violet-300/20 bg-violet-300/[0.05] px-3 py-2 text-xs font-black text-violet-200"
                      >
                        Use Special Voucher · x
                        {
                          voucher.quantity
                        }
                      </SubmitButton>
                    </form>
                  );
                })()}
              </div>
            </div>
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