"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  z,
} from "zod";

import {
  ACHIEVEMENT_REWARDS,
  type AchievementRewardId,
} from "@/lib/achievement-rewards";

import {
  requireUser,
} from "@/lib/supabase/queries";

// =========================================================
// TYPES
// =========================================================

export type ProfileActionState = {
  error?: string;
  success?: string;
};

type AchievementMatch = {
  player_one_id: string;
  player_two_id: string;

  winner_id:
    | string
    | null;

  result:
    | "player_one_win"
    | "player_two_win"
    | "draw"
    | null;

  status:
    | "pending"
    | "accepted"
    | "result_submitted"
    | "disputed"
    | "completed"
    | "cancelled"
    | "declined";

  match_type:
    | "league"
    | "practice";

  wager_type:
    | "none"
    | "dp"
    | "card";

  completed_at:
    | string
    | null;

  created_at: string;
};

type AchievementTrade = {
  status:
    | "draft"
    | "pending"
    | "accepted"
    | "declined"
    | "cancelled";
};

type AchievementDeck = {
  status:
    | "draft"
    | "ready"
    | "archived";

  is_active: boolean;
};

// =========================================================
// PROFILE SCHEMA
//
// custom_title is intentionally NOT here.
//
// Titles may only be equipped through verified
// achievement rewards.
// =========================================================

const profileSchema = z.object({
  duelist_name: z
    .string()
    .trim()
    .min(2)
    .max(32),

  catchphrase: z
    .string()
    .trim()
    .max(160)
    .optional(),

  signature_quote: z
    .string()
    .trim()
    .max(300)
    .optional(),

  bio: z
    .string()
    .trim()
    .max(800)
    .optional(),

  avatar_url: z
    .string()
    .trim()
    .max(1000)
    .optional(),

  profile_banner_url: z
    .string()
    .trim()
    .max(1000)
    .optional(),

  accent_theme: z.enum([
    "gold",
    "blue",
    "red",
    "purple",
    "green",
    "cyan",
  ]),

  boss_personality:
    z.enum([
      "sarcastic",
      "arrogant",
      "ruthless",
      "honorable",
      "chaotic",
      "supportive",
    ]),

  favorite_play_style: z
    .string()
    .trim()
    .max(100)
    .optional(),

  favorite_card_type: z
    .string()
    .trim()
    .max(100)
    .optional(),

  favorite_attribute: z
    .string()
    .trim()
    .max(100)
    .optional(),

  favorite_monster_type: z
    .string()
    .trim()
    .max(100)
    .optional(),
});

// =========================================================
// HELPERS
// =========================================================

function emptyToNull(
  value:
    | string
    | undefined
) {
  if (!value) {
    return null;
  }

  const cleaned =
    value.trim();

  return (
    cleaned ||
    null
  );
}

function resultForPlayer(
  match: AchievementMatch,
  userId: string
) {
  if (
    match.result ===
      "draw" ||
    !match.winner_id
  ) {
    return "D";
  }

  if (
    match.winner_id ===
    userId
  ) {
    return "W";
  }

  return "L";
}

function currentLeagueWinStreak(
  matches:
    AchievementMatch[],
  userId: string
) {
  const ordered =
    [...matches].sort(
      (a, b) =>
        new Date(
          b.completed_at ??
            b.created_at
        ).getTime() -
        new Date(
          a.completed_at ??
            a.created_at
        ).getTime()
    );

  let streak = 0;

  for (
    const match of
    ordered
  ) {
    if (
      resultForPlayer(
        match,
        userId
      ) !== "W"
    ) {
      break;
    }

    streak += 1;
  }

  return streak;
}

function revalidateIdentity() {
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/league");
  revalidatePath("/matches");
  revalidatePath("/trades");
  revalidatePath("/achievements");
}

// =========================================================
// GET UNLOCKED ACHIEVEMENTS
//
// This is the authoritative server-side unlock check.
//
// The client cannot claim an achievement.
// =========================================================

async function getUnlockedAchievementIds(
  supabase: Awaited<
    ReturnType<
      typeof requireUser
    >
  >["supabase"],
  userId: string
): Promise<
  Set<AchievementRewardId>
> {
  // ======================================================
  // LEAGUE
  // ======================================================

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("league_members")
    .select("league_id")
    .eq(
      "profile_id",
      userId
    )
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    throw new Error(
      "League niet gevonden."
    );
  }

  const leagueId =
    membership.league_id;

  // ======================================================
  // PROFILE / DP
  // ======================================================

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("duel_points")
    .eq(
      "id",
      userId
    )
    .maybeSingle();

  if (
    profileError ||
    !profile
  ) {
    throw new Error(
      "Profiel kon niet worden geladen."
    );
  }

  const duelPoints =
    profile.duel_points ??
    0;

  // ======================================================
  // MATCHES
  // ======================================================

  const {
    data: matchData,
    error: matchError,
  } = await supabase
    .from("matches")
    .select(
      `
        player_one_id,
        player_two_id,
        winner_id,
        result,
        status,
        match_type,
        wager_type,
        completed_at,
        created_at
      `
    )
    .eq(
      "league_id",
      leagueId
    )
    .or(
      `player_one_id.eq.${userId},player_two_id.eq.${userId}`
    );

  if (matchError) {
    throw new Error(
      matchError.message
    );
  }

  const matches =
    (matchData ??
      []) as AchievementMatch[];

  const leagueMatches =
    matches.filter(
      (match) =>
        match.status ===
          "completed" &&
        match.match_type ===
          "league"
    );

  const leagueWins =
    leagueMatches.filter(
      (match) =>
        match.winner_id ===
        userId
    ).length;

  const winStreak =
    currentLeagueWinStreak(
      leagueMatches,
      userId
    );

  // ======================================================
  // RIVAL WINS
  // ======================================================

  const rivalWins =
    new Map<
      string,
      number
    >();

  for (
    const match of
    leagueMatches
  ) {
    if (
      match.winner_id !==
      userId
    ) {
      continue;
    }

    const opponentId =
      match.player_one_id ===
      userId
        ? match.player_two_id
        : match.player_one_id;

    rivalWins.set(
      opponentId,
      (rivalWins.get(
        opponentId
      ) ?? 0) + 1
    );
  }

  const mostWinsVsRival =
    Math.max(
      0,
      ...rivalWins.values()
    );

  // ======================================================
  // WAGER WINS
  // ======================================================

  const wagerWins =
    matches.filter(
      (match) =>
        match.status ===
          "completed" &&
        match.match_type ===
          "practice" &&
        match.wager_type !==
          "none" &&
        match.winner_id ===
          userId
    ).length;

  // ======================================================
  // TRADES
  // ======================================================

  const {
    data: tradeData,
    error: tradeError,
  } = await supabase
    .from("trades")
    .select("status")
    .eq(
      "league_id",
      leagueId
    )
    .or(
      `sender_id.eq.${userId},receiver_id.eq.${userId}`
    );

  if (tradeError) {
    throw new Error(
      tradeError.message
    );
  }

  const trades =
    (tradeData ??
      []) as AchievementTrade[];

  const completedTrades =
    trades.filter(
      (trade) =>
        trade.status ===
        "accepted"
    ).length;

  // ======================================================
  // COLLECTION
  // ======================================================

  const {
    count:
      collectionCountRaw,
    error:
      collectionError,
  } = await supabase
    .from(
      "card_instances"
    )
    .select(
      "id",
      {
        count: "exact",
        head: true,
      }
    )
    .eq(
      "current_owner_id",
      userId
    );

  if (
    collectionError
  ) {
    throw new Error(
      collectionError.message
    );
  }

  const collectionCount =
    collectionCountRaw ??
    0;

  // ======================================================
  // DECKS
  // ======================================================

  const {
    data: deckData,
    error: deckError,
  } = await supabase
    .from("decks")
    .select(
      "status,is_active"
    )
    .eq(
      "league_id",
      leagueId
    )
    .eq(
      "owner_id",
      userId
    );

  if (deckError) {
    throw new Error(
      deckError.message
    );
  }

  const decks =
    (deckData ??
      []) as AchievementDeck[];

  const readyDecks =
    decks.filter(
      (deck) =>
        deck.status ===
        "ready"
    );

  const hasActiveReadyDeck =
    readyDecks.some(
      (deck) =>
        deck.is_active
    );

  // ======================================================
  // UNLOCKS
  // ======================================================

  const unlocked =
    new Set<
      AchievementRewardId
    >();

  if (
    leagueWins >= 1
  ) {
    unlocked.add(
      "first-blood"
    );
  }

  if (
    leagueMatches.length >=
    10
  ) {
    unlocked.add(
      "seasoned-duelist"
    );
  }

  if (
    winStreak >= 3
  ) {
    unlocked.add(
      "on-fire"
    );
  }

  if (
    winStreak >= 5
  ) {
    unlocked.add(
      "unstoppable"
    );
  }

  if (
    mostWinsVsRival >=
    3
  ) {
    unlocked.add(
      "rival-crusher"
    );
  }

  if (
    completedTrades >=
    1
  ) {
    unlocked.add(
      "trade-initiate"
    );
  }

  if (
    completedTrades >=
    5
  ) {
    unlocked.add(
      "trade-master"
    );
  }

  if (
    collectionCount >=
    25
  ) {
    unlocked.add(
      "collector"
    );
  }

  if (
    collectionCount >=
    50
  ) {
    unlocked.add(
      "vault-keeper"
    );
  }

  if (
    hasActiveReadyDeck
  ) {
    unlocked.add(
      "battle-ready"
    );
  }

  if (
    readyDecks.length >=
    3
  ) {
    unlocked.add(
      "deck-builder"
    );
  }

  if (
    wagerWins >= 1
  ) {
    unlocked.add(
      "high-roller"
    );
  }

  if (
    duelPoints >= 500
  ) {
    unlocked.add(
      "duel-banker"
    );
  }

  if (
    duelPoints >= 1000
  ) {
    unlocked.add(
      "dp-legend"
    );
  }

  return unlocked;
}

// =========================================================
// UPDATE PROFILE
//
// Does NOT update custom_title.
// =========================================================

export async function updateProfile(
  formData: FormData
): Promise<ProfileActionState> {
  const rawData = {
    duelist_name:
      String(
        formData.get(
          "duelist_name"
        ) ?? ""
      ),

    catchphrase:
      String(
        formData.get(
          "catchphrase"
        ) ?? ""
      ),

    signature_quote:
      String(
        formData.get(
          "signature_quote"
        ) ?? ""
      ),

    bio:
      String(
        formData.get(
          "bio"
        ) ?? ""
      ),

    avatar_url:
      String(
        formData.get(
          "avatar_url"
        ) ?? ""
      ),

    profile_banner_url:
      String(
        formData.get(
          "profile_banner_url"
        ) ?? ""
      ),

    accent_theme:
      String(
        formData.get(
          "accent_theme"
        ) ?? "gold"
      ),

    boss_personality:
      String(
        formData.get(
          "boss_personality"
        ) ?? "sarcastic"
      ),

    favorite_play_style:
      String(
        formData.get(
          "favorite_play_style"
        ) ?? ""
      ),

    favorite_card_type:
      String(
        formData.get(
          "favorite_card_type"
        ) ?? ""
      ),

    favorite_attribute:
      String(
        formData.get(
          "favorite_attribute"
        ) ?? ""
      ),

    favorite_monster_type:
      String(
        formData.get(
          "favorite_monster_type"
        ) ?? ""
      ),
  };

  const parsed =
    profileSchema.safeParse(
      rawData
    );

  if (!parsed.success) {
    return {
      error:
        "Controleer de profielvelden.",
    };
  }

  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    data,
  } = parsed;

  const {
    error,
  } = await supabase
    .from("profiles")
    .update({
      duelist_name:
        data.duelist_name,

      catchphrase:
        emptyToNull(
          data.catchphrase
        ),

      signature_quote:
        emptyToNull(
          data.signature_quote
        ),

      bio:
        emptyToNull(
          data.bio
        ),

      avatar_url:
        emptyToNull(
          data.avatar_url
        ),

      profile_banner_url:
        emptyToNull(
          data.profile_banner_url
        ),

      accent_theme:
        data.accent_theme,

      boss_personality:
        data.boss_personality,

      favorite_play_style:
        emptyToNull(
          data.favorite_play_style
        ),

      favorite_card_type:
        emptyToNull(
          data.favorite_card_type
        ),

      favorite_attribute:
        emptyToNull(
          data.favorite_attribute
        ),

      favorite_monster_type:
        emptyToNull(
          data.favorite_monster_type
        ),

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      userId
    );

  if (error) {
    return {
      error:
        `Profiel opslaan mislukt: ${error.message}`,
    };
  }

  revalidateIdentity();

  return {
    success:
      "Profiel opgeslagen.",
  };
}

// =========================================================
// EQUIP ACHIEVEMENT TITLE
//
// Server verifies:
// 1. achievement exists
// 2. reward is title/prestige
// 3. player actually unlocked it
// =========================================================

export async function equipAchievementTitle(
  formData: FormData
) {
  const achievementId =
    String(
      formData.get(
        "achievement_id"
      ) ?? ""
    ).trim() as
      AchievementRewardId;

  const reward =
    ACHIEVEMENT_REWARDS.find(
      (item) =>
        item.achievementId ===
        achievementId
    );

  if (!reward) {
    throw new Error(
      "Onbekende achievement reward."
    );
  }

  if (
    reward.rewardType !==
      "title" &&
    reward.rewardType !==
      "prestige"
  ) {
    throw new Error(
      "Deze achievement ontgrendelt geen titel."
    );
  }

  const {
    supabase,
    userId,
  } = await requireUser();

  const unlocked =
    await getUnlockedAchievementIds(
      supabase,
      userId
    );

  if (
    !unlocked.has(
      achievementId
    )
  ) {
    throw new Error(
      "Deze titel heb je nog niet ontgrendeld."
    );
  }

  const {
    error,
  } = await supabase
    .from("profiles")
    .update({
      custom_title:
        reward.rewardValue,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      userId
    );

  if (error) {
    throw new Error(
      `Titel equippen mislukt: ${error.message}`
    );
  }

  revalidateIdentity();

  redirect("/profile");
}

// =========================================================
// UNEQUIP ACHIEVEMENT TITLE
// =========================================================

export async function unequipAchievementTitle() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    error,
  } = await supabase
    .from("profiles")
    .update({
      custom_title:
        null,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      userId
    );

  if (error) {
    throw new Error(
      `Titel verwijderen mislukt: ${error.message}`
    );
  }

  revalidateIdentity();

  redirect("/profile");
}

// =========================================================
// CHOOSE BOSS MONSTER
// =========================================================

export async function chooseBossMonster(
  formData: FormData
) {
  const id =
    z
      .string()
      .uuid()
      .safeParse(
        formData.get(
          "boss_monster_option_id"
        )
      );

  if (!id.success) {
    return;
  }

  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    data: option,
    error: optionError,
  } = await supabase
    .from(
      "boss_monster_options"
    )
    .select("id")
    .eq(
      "id",
      id.data
    )
    .eq(
      "active",
      true
    )
    .single();

  if (
    optionError ||
    !option
  ) {
    return;
  }

  const {
    error,
  } = await supabase
    .from("profiles")
    .update({
      boss_monster_option_id:
        option.id,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      userId
    );

  if (error) {
    return;
  }

revalidateIdentity();

redirect("/draft");
}