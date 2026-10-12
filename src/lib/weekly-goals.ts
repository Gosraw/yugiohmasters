import type {
  SeasonPathTier,
} from "@/lib/season-path";

// =========================================================
// WEEKLY GOALS + SEASON OVERVIEW (2.0) - types and pure helpers
//
// get_my_season_overview() (migration 202610120810) refreshes the
// signed-in player's weekly goals / Season Path in the database and
// returns one JSON object. parseSeasonOverview() turns that into
// typed data defensively (a missing or odd field never breaks Home),
// the rest are small display helpers.
// =========================================================

export type WeeklyGoalItem = {
  id: string;
  slot: number;
  category: string;
  goalType: string;
  title: string;
  description: string | null;
  target: number;
  progress: number;
  completed: boolean;
  dpReward: number;
};

export type WeeklyGoals = {
  setId: string;
  isoWeek: string;
  weekStart: string;
  endsAt: string | null;
  items: WeeklyGoalItem[];
  bonus: {
    voucherType: string | null;
    voucherQuantity: number;
    granted: boolean;
  };
};

export type XpEvent = {
  source: string;
  xp: number;
  description: string;
  createdAt: string;
};

export type XpSource = {
  source: string;
  xp: number;
  label: string;
};

export type SeasonOverview = {
  season: {
    number: number;
    name: string;
    startsOn: string | null;
    week: number | null;
  } | null;
  weekly: WeeklyGoals | null;
  path: {
    xp: number;
    tiers: SeasonPathTier[];
    recentXp: XpEvent[];
    xpSources: XpSource[];
  };
  titles: string[];
};

type Json = Record<string, unknown>;

function isObject(
  value: unknown
): value is Json {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function num(
  value: unknown,
  fallback = 0
) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function str(
  value: unknown
): string | null {
  return typeof value === "string"
    ? value
    : null;
}

function list(
  value: unknown
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

export const EMPTY_SEASON_OVERVIEW: SeasonOverview = {
  season: null,
  weekly: null,
  path: {
    xp: 0,
    tiers: [],
    recentXp: [],
    xpSources: [],
  },
  titles: [],
};

export function parseSeasonOverview(
  raw: unknown
): SeasonOverview {
  if (!isObject(raw)) {
    return EMPTY_SEASON_OVERVIEW;
  }

  const season =
    isObject(raw.season)
      ? {
          number: num(raw.season.number),
          name:
            str(raw.season.name) ??
            `Season ${num(raw.season.number)}`,
          startsOn: str(raw.season.starts_on),
          week:
            raw.season.week === null ||
            raw.season.week === undefined
              ? null
              : num(raw.season.week),
        }
      : null;

  const weekly =
    isObject(raw.weekly)
      ? {
          setId: str(raw.weekly.set_id) ?? "",
          isoWeek: str(raw.weekly.iso_week) ?? "",
          weekStart: str(raw.weekly.week_start) ?? "",
          endsAt: str(raw.weekly.ends_at),
          items: list(raw.weekly.items)
            .filter(isObject)
            .map(
              (item): WeeklyGoalItem => ({
                id: str(item.id) ?? "",
                slot: num(item.slot),
                category: str(item.category) ?? "",
                goalType: str(item.goal_type) ?? "",
                title: str(item.title) ?? "Weekly goal",
                description: str(item.description),
                target: Math.max(1, num(item.target, 1)),
                progress: Math.max(0, num(item.progress)),
                completed: item.completed === true,
                dpReward: num(item.dp_reward),
              })
            )
            .sort(
              (a, b) =>
                a.slot - b.slot
            ),
          bonus: {
            voucherType: isObject(raw.weekly.bonus)
              ? str(raw.weekly.bonus.voucher_type)
              : null,
            voucherQuantity: isObject(raw.weekly.bonus)
              ? num(raw.weekly.bonus.voucher_quantity)
              : 0,
            granted:
              isObject(raw.weekly.bonus) &&
              raw.weekly.bonus.granted === true,
          },
        }
      : null;

  const path =
    isObject(raw.path)
      ? raw.path
      : {};

  return {
    season,
    weekly,
    path: {
      xp: num(path.xp),
      tiers: list(path.tiers)
        .filter(isObject)
        .map(
          (tier): SeasonPathTier => ({
            tier: num(tier.tier),
            xp_required: num(tier.xp_required),
            cumulative_xp: num(tier.cumulative_xp),
            dp_reward: num(tier.dp_reward),
            voucher_type: str(tier.voucher_type),
            voucher_quantity: num(tier.voucher_quantity),
            title_reward: str(tier.title_reward),
            cosmetic_reward: str(tier.cosmetic_reward),
            label: str(tier.label),
            granted: tier.granted === true,
          })
        ),
      recentXp: list(path.recent_xp)
        .filter(isObject)
        .map(
          (event): XpEvent => ({
            source: str(event.source) ?? "",
            xp: num(event.xp),
            description: str(event.description) ?? "",
            createdAt: str(event.created_at) ?? "",
          })
        ),
      xpSources: list(path.xp_sources)
        .filter(isObject)
        .map(
          (source): XpSource => ({
            source: str(source.source) ?? "",
            xp: num(source.xp),
            label: str(source.label) ?? "",
          })
        ),
    },
    titles: list(raw.titles).filter(
      (title): title is string =>
        typeof title === "string"
    ),
  };
}

/** 0-100 for a progress bar. */
export function goalPercent(
  progress: number,
  target: number
) {
  if (target <= 0) {
    return 100;
  }

  return Math.round(
    Math.min(
      1,
      Math.max(
        0,
        progress / target
      )
    ) * 100
  );
}

export function weeklyGoalsDone(
  items: Pick<WeeklyGoalItem, "completed">[]
) {
  return items.filter(
    (item) =>
      item.completed
  ).length;
}

/** "Season 2 · Week 3" (or just "Season 2" before it starts). */
export function seasonWeekLabel(
  season: SeasonOverview["season"]
) {
  if (!season) {
    return "Season";
  }

  return season.week && season.week > 0
    ? `${season.name} · Week ${season.week}`
    : season.name;
}

/** "Resets in 3 days" / "Resets in 5 hours" / "Resets soon". */
export function resetsInLabel(
  endsAt: string | null,
  now: Date = new Date()
) {
  if (!endsAt) {
    return null;
  }

  const ms =
    Date.parse(endsAt) -
    now.getTime();

  if (!Number.isFinite(ms)) {
    return null;
  }

  if (ms <= 60 * 60 * 1000) {
    return "Resets soon";
  }

  const hours =
    Math.floor(ms / (60 * 60 * 1000));

  if (hours < 24) {
    return `Resets in ${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const days =
    Math.floor(hours / 24);

  return `Resets in ${days} day${days === 1 ? "" : "s"}`;
}
