// =========================================================
// THE ONE PLACE the test bots read reward numbers from.
//
// CURRENT_RULES mirrors what is live today
// (supabase/migrations/202609042200_fix_full_round_economy.sql +
// 202609042210_full_round_economy_guard_fix.sql, shop prices from
// shop_pack_types). When the 2.0 economy is approved, add a
// RULES_2_0 object below and switch ACTIVE_RULES to it - every spec
// follows automatically.
// =========================================================

export type EconomyRules = {
  name: string;

  match: {
    winDp: number;
    lossDp: number;
    drawDp: number;
    // ledger reason written by _award_match_duel_points_internal
    reason: string;
  };

  // Paid once per FULL round (everyone played everyone once).
  round: {
    participation: {
      dp: number;
      reason: string;
      vouchers: Record<string, number>;
    };
    // index 0 = #1, 1 = #2, 2 = #3
    placements: {
      dp: number;
      reason: string;
      vouchers: Record<string, number>;
    }[];
  };

  // End-of-competition placement payout (disabled in the live rules:
  // placement is paid per full round instead).
  competitionEndDp: number[];

  welcomePack: {
    vouchers: Record<string, number>;
  };

  // DP ledger reasons of side systems (2.0 weekly goals, Season Path,
  // bounty / catch-up, mini games). They can fire alongside any action
  // (e.g. "collect 20 cards" during the draft), so exact accounting of
  // the round / shop / onboarding economy leaves them out. They still
  // count for the ledger == balance invariant.
  extraRewardReasons: string[];

  initialDraft: {
    mainPicks: number;
    fusionPicks: number;
    xyzPicks: number;
  };

  shop: {
    normalPack: {
      code: string;
      priceDp: number;
      cards: number;
    };
  };
};

export const CURRENT_RULES: EconomyRules = {
  name: "live (2026-09-04 full-round economy)",

  match: {
    winDp: 100,
    lossDp: 75,
    drawDp: 75,
    reason: "match_reward",
  },

  round: {
    participation: {
      dp: 300,
      reason: "round_participation",
      vouchers: {
        premium_pack: 1,
      },
    },
    placements: [
      {
        dp: 400,
        reason: "round_winner_bonus",
        vouchers: {
          normal_pack: 1,
        },
      },
      {
        dp: 300,
        reason: "round_runner_up_bonus",
        vouchers: {},
      },
      {
        dp: 200,
        reason: "round_third_bonus",
        vouchers: {},
      },
    ],
  },

  competitionEndDp: [0, 0, 0],

  welcomePack: {
    vouchers: {
      normal_pack: 1,
      premium_pack: 1,
      deluxe_pack: 1,
    },
  },

  extraRewardReasons: [
    "weekly_goal",
    "season_path_reward",
    "mini_game_reward",
    "season_bounty",
    "season_bounty_reversal",
    "season_catch_up",
    "season_catch_up_reversal",
  ],

  initialDraft: {
    mainPicks: 60,
    fusionPicks: 2,
    xyzPicks: 2,
  },

  shop: {
    normalPack: {
      code: "normal",
      priceDp: 300,
      cards: 7,
    },
  },
};

export const ACTIVE_RULES: EconomyRules = CURRENT_RULES;

export function draftTotal(rules: EconomyRules = ACTIVE_RULES) {
  return rules.initialDraft.mainPicks + rules.initialDraft.fusionPicks + rules.initialDraft.xyzPicks;
}
