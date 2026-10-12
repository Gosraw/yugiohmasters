import {
  voucherLabel,
} from "@/lib/match-settlement-summary";

// =========================================================
// SEASON PATH (2.0) - pure helpers
//
// The database owns XP and rewards (season_path_* tables, migration
// 202610120810): XP comes from real events, reaching a tier grants
// its reward automatically. These helpers only turn the numbers
// get_my_season_overview() returns into what the UI shows
// ("Tier 6 of 20", "40 / 85 XP to tier 7", "400 DP + Premium Pack").
// =========================================================

export type SeasonPathTier = {
  tier: number;
  xp_required: number;
  cumulative_xp: number;
  dp_reward: number;
  voucher_type: string | null;
  voucher_quantity: number;
  title_reward: string | null;
  cosmetic_reward: string | null;
  label: string | null;
  granted: boolean;
};

export type SeasonPathStatus = {
  xp: number;
  /** Highest tier the XP reaches (0 = none yet). */
  tier: number;
  maxTier: number;
  complete: boolean;
  /** The tier being worked towards, null when complete. */
  nextTier: SeasonPathTier | null;
  xpIntoTier: number;
  xpForTier: number;
  /** 0-100, progress inside the current tier. */
  percentToNext: number;
  /** 0-100, progress along the whole track. */
  percentTotal: number;
};

function clampPercent(
  value: number
) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      value
    )
  );
}

export function seasonPathStatus(
  xp: number,
  tiers: SeasonPathTier[]
): SeasonPathStatus {
  const ordered = [
    ...tiers,
  ].sort(
    (a, b) =>
      a.tier - b.tier
  );

  const safeXp = Math.max(
    0,
    Math.floor(xp || 0)
  );

  const maxTier =
    ordered.length;

  const totalXp =
    ordered.at(-1)?.cumulative_xp ?? 0;

  let tier = 0;
  let previousCumulative = 0;

  for (const row of ordered) {
    if (safeXp < row.cumulative_xp) {
      break;
    }

    tier = row.tier;
    previousCumulative = row.cumulative_xp;
  }

  const nextTier =
    ordered.find(
      (row) =>
        row.cumulative_xp > safeXp
    ) ?? null;

  const xpForTier =
    nextTier?.xp_required ?? 0;

  const xpIntoTier =
    nextTier
      ? safeXp - previousCumulative
      : 0;

  return {
    xp: safeXp,
    tier,
    maxTier,
    complete:
      maxTier > 0 &&
      nextTier === null,
    nextTier,
    xpIntoTier,
    xpForTier,
    percentToNext:
      nextTier
        ? clampPercent(
            (xpIntoTier / Math.max(1, xpForTier)) * 100
          )
        : 100,
    percentTotal:
      totalXp > 0
        ? clampPercent(
            (safeXp / totalXp) * 100
          )
        : 0,
  };
}

/** "400 DP", "Premium Pack", "Title: Pharaoh's Ascendant"... */
export function tierRewardParts(
  tier: Pick<
    SeasonPathTier,
    | "dp_reward"
    | "voucher_type"
    | "voucher_quantity"
    | "title_reward"
    | "cosmetic_reward"
  >
): string[] {
  const parts: string[] = [];

  if (tier.dp_reward > 0) {
    parts.push(
      `${tier.dp_reward.toLocaleString("en-US")} DP`
    );
  }

  if (tier.voucher_type && tier.voucher_quantity > 0) {
    parts.push(
      `${tier.voucher_quantity > 1 ? `${tier.voucher_quantity}× ` : ""}${voucherLabel(tier.voucher_type)}`
    );
  }

  if (tier.title_reward) {
    parts.push(
      `Title: ${tier.title_reward}`
    );
  }

  if (tier.cosmetic_reward) {
    parts.push(
      tier.cosmetic_reward
    );
  }

  return parts;
}
