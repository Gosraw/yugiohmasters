export const DEFAULT_SETTINGS = {
  "economy.match_win_dp": 100,
  "economy.match_loss_dp": 35,
  "competition.cp_by_position": [5, 3, 1],
  "life_points.start": 8000,
  "shop.refresh_hours": 72,
  "trading.window_enabled": false,
  "draft.entry_price_dp": 0,
  "achievements.default_reward_dp": 0,
  "decks.main_min": 40,
  "decks.main_max": 60,
  "decks.extra_max": 15,
  "decks.side_max": 15
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
