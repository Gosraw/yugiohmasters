export type AchievementRewardId =
  | "first-blood"
  | "seasoned-duelist"
  | "on-fire"
  | "unstoppable"
  | "rival-crusher"
  | "trade-initiate"
  | "trade-master"
  | "collector"
  | "vault-keeper"
  | "battle-ready"
  | "deck-builder"
  | "high-roller"
  | "duel-banker"
  | "dp-legend";

export type AchievementReward = {
  achievementId: AchievementRewardId;

  title: string;

  rewardType:
    | "title"
    | "accent"
    | "prestige";

  rewardValue: string;

  description: string;

  tier:
    | "bronze"
    | "silver"
    | "gold"
    | "legendary";
};

export const ACHIEVEMENT_REWARDS: AchievementReward[] = [
  {
    achievementId:
      "first-blood",

    title:
      "First Blood",

    rewardType:
      "title",

    rewardValue:
      "First Blood",

    description:
      "Unlocked by winning your first official League Duel.",

    tier:
      "bronze",
  },

  {
    achievementId:
      "seasoned-duelist",

    title:
      "Seasoned Duelist",

    rewardType:
      "title",

    rewardValue:
      "Seasoned Duelist",

    description:
      "Unlocked after completing 10 official League Duels.",

    tier:
      "silver",
  },

  {
    achievementId:
      "on-fire",

    title:
      "On Fire",

    rewardType:
      "title",

    rewardValue:
      "On Fire",

    description:
      "Unlocked by winning 3 official League Duels in a row.",

    tier:
      "silver",
  },

  {
    achievementId:
      "unstoppable",

    title:
      "Unstoppable",

    rewardType:
      "title",

    rewardValue:
      "The Unstoppable",

    description:
      "Unlocked by winning 5 official League Duels in a row.",

    tier:
      "legendary",
  },

  {
    achievementId:
      "rival-crusher",

    title:
      "Rival Crusher",

    rewardType:
      "title",

    rewardValue:
      "Rival Crusher",

    description:
      "Unlocked after defeating the same rival 3 times in official League Duels.",

    tier:
      "gold",
  },

  {
    achievementId:
      "trade-initiate",

    title:
      "Trade Initiate",

    rewardType:
      "title",

    rewardValue:
      "Card Negotiator",

    description:
      "Unlocked after completing your first physical card trade.",

    tier:
      "bronze",
  },

  {
    achievementId:
      "trade-master",

    title:
      "Trade Master",

    rewardType:
      "title",

    rewardValue:
      "Master Trader",

    description:
      "Unlocked after completing 5 trades.",

    tier:
      "gold",
  },

  {
    achievementId:
      "collector",

    title:
      "Collector",

    rewardType:
      "title",

    rewardValue:
      "The Collector",

    description:
      "Unlocked after owning 25 tracked physical cards.",

    tier:
      "silver",
  },

  {
    achievementId:
      "vault-keeper",

    title:
      "Vault Keeper",

    rewardType:
      "title",

    rewardValue:
      "Vault Keeper",

    description:
      "Unlocked after owning 50 tracked physical cards.",

    tier:
      "gold",
  },

  {
    achievementId:
      "battle-ready",

    title:
      "Battle Ready",

    rewardType:
      "title",

    rewardValue:
      "Battle Ready",

    description:
      "Unlocked after activating a Ready Deck.",

    tier:
      "bronze",
  },

  {
    achievementId:
      "deck-builder",

    title:
      "Deck Architect",

    rewardType:
      "title",

    rewardValue:
      "Deck Architect",

    description:
      "Unlocked after building 3 Ready Decks.",

    tier:
      "gold",
  },

  {
    achievementId:
      "high-roller",

    title:
      "High Roller",

    rewardType:
      "title",

    rewardValue:
      "High Roller",

    description:
      "Unlocked after winning a Practice Duel with DP or cards at stake.",

    tier:
      "gold",
  },

  {
    achievementId:
      "duel-banker",

    title:
      "Duel Banker",

    rewardType:
      "title",

    rewardValue:
      "DP Tycoon",

    description:
      "Unlocked after reaching a balance of 500 DP.",

    tier:
      "gold",
  },

  {
    achievementId:
      "dp-legend",

    title:
      "DP Legend",

    rewardType:
      "prestige",

    rewardValue:
      "Duel Point Legend",

    description:
      "Unlocked after reaching a balance of 1000 DP.",

    tier:
      "legendary",
  },
];

export function getAchievementReward(
  achievementId: AchievementRewardId
) {
  return (
    ACHIEVEMENT_REWARDS.find(
      (reward) =>
        reward.achievementId ===
        achievementId
    ) ?? null
  );
}

export function getTitleRewards() {
  return ACHIEVEMENT_REWARDS.filter(
    (reward) =>
      reward.rewardType ===
        "title" ||
      reward.rewardType ===
        "prestige"
  );
}