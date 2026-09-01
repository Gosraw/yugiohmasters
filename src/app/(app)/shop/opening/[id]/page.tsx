import Link from "next/link";

import {
  ArrowLeft,
  Home,
} from "lucide-react";

import {
  notFound,
} from "next/navigation";

import {
  PackOpeningReveal,
} from "@/components/pack-opening-reveal";

import {
  requireUser,
} from "@/lib/supabase/queries";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type Opening = {
  id: string;

  profile_id:
    string;

  pack_code:
    string;

  rotation_id:
    | string
    | null;

  special_pack_rotation_id:
    | string
    | null;

  opened_at:
    string;
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

  is_first_for_player:
    | boolean
    | null;
};

type Card = {
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

  def:
    | number
    | null;

  card_type: string;

  attribute:
    | string
    | null;

  monster_type:
    | string
    | null;

  archetype:
    | string
    | null;

  level:
    | number
    | null;

  rank:
    | number
    | null;

  link_rating:
    | number
    | null;
};

// =========================================================
// PAGE
// =========================================================

export default async function PackOpeningPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const {
    id,
  } = await params;

  const {
    supabase,
    userId,
  } = await requireUser();

  // ======================================================
  // OPENING
  // ======================================================

  const {
    data:
      openingData,

    error:
      openingError,
  } = await supabase
    .from(
      "shop_pack_openings"
    )
    .select(
      `
        id,
        profile_id,
        pack_code,
        rotation_id,
        special_pack_rotation_id,
        opened_at
      `
    )
    .eq(
      "id",
      id
    )
    .eq(
      "profile_id",
      userId
    )
    .maybeSingle();

  if (
    openingError ||
    !openingData
  ) {
    notFound();
  }

  const opening =
    openingData as Opening;

  // ======================================================
  // PULLS
  // ======================================================

  const {
    data:
      pullData,

    error:
      pullError,
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
        pulled_rarity,
        is_first_for_player
      `
    )
    .eq(
      "opening_id",
      opening.id
    )
    .order(
      "pull_position",
      {
        ascending:
          true,
      }
    );

  if (pullError) {
    throw new Error(
      pullError.message
    );
  }

  const pulls =
    (pullData ??
      []) as Pull[];

  if (
    pulls.length === 0
  ) {
    notFound();
  }

  // ======================================================
  // CARDS
  // ======================================================

  const cardIds = [
    ...new Set(
      pulls.map(
        (pull) =>
          pull.card_catalog_id
      )
    ),
  ];

  const {
    data:
      cardData,

    error:
      cardError,
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
        atk,
        def,
        card_type,
        attribute,
        monster_type,
        archetype,
        level,
        rank,
        link_rating
      `
    )
    .in(
      "id",
      cardIds
    );

  if (cardError) {
    throw new Error(
      cardError.message
    );
  }

  const cards =
    (cardData ??
      []) as Card[];

  const cardMap =
    new Map(
      cards.map(
        (card) => [
          card.id,
          card,
        ]
      )
    );

  const hydratedPulls =
    pulls
      .map(
        (pull) => {
          const card =
            cardMap.get(
              pull.card_catalog_id
            );

          if (!card) {
            return null;
          }

          return {
            id:
              pull.id,

            card_catalog_id:
              pull.card_catalog_id,

            card_instance_id:
              pull.card_instance_id,

            pull_position:
              pull.pull_position,

            pulled_rarity:
              pull.pulled_rarity,

            is_first_for_player:
              pull.is_first_for_player,

            card,
          };
        }
      )
      .filter(
        (
          pull
        ): pull is NonNullable<
          typeof pull
        > =>
          Boolean(pull)
      );

  // ======================================================
  // PACK NAME
  // ======================================================

  let packName =
    opening.pack_code ===
    "normal"
      ? "Normal Pack"
      : opening.pack_code ===
          "premium"
        ? "Premium Pack"
        : opening.pack_code ===
            "deluxe"
          ? "Deluxe Pack"
          : opening.pack_code ===
              "special_attribute"
            ? "Attribute Spotlight"
            : opening.pack_code ===
                "special_archetype"
              ? "Archetype Spotlight"
              : "Special Pack";

  if (
    (opening.pack_code ===
      "special_attribute" ||
      opening.pack_code ===
        "special_archetype") &&
    opening.special_pack_rotation_id
  ) {
    const {
      data:
        specialRotation,
    } = await supabase
      .from(
        "shop_special_pack_rotations"
      )
      .select(
        "theme_label"
      )
      .eq(
        "id",
        opening.special_pack_rotation_id
      )
      .maybeSingle();

    if (
      specialRotation?.theme_label
    ) {
      packName =
        specialRotation.theme_label;
    }
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.05] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-violet-500/[0.06] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <nav className="mb-4 flex flex-wrap items-center gap-3 sm:mb-6">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-sm font-black text-amber-300 transition hover:bg-amber-300/[0.1]"
          >
            <ArrowLeft
              size={16}
            />

            Shop
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm font-black text-zinc-500 transition hover:text-zinc-200"
          >
            <Home
              size={15}
            />

            Home
          </Link>
        </nav>

        <PackOpeningReveal
          packName={
            packName
          }
          packCode={
            opening.pack_code
          }
          pulls={
            hydratedPulls
          }
        />
      </div>
    </main>
  );
}