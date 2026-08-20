import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const players = [
  ["player_one", "Player One", "DevPassword1!"],
  ["player_two", "Player Two", "DevPassword2!"],
  ["player_three", "Player Three", "DevPassword3!"],
];

const ids = [];
for (const [username, duelistName, password] of players) {
  const email = `${username}@duelist.local`;
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = existing.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { username, duelist_name: duelistName },
    });
    if (error) throw error;
    user = data.user;
  }
  ids.push(user.id);
}

let { data: league } = await admin.from("leagues").select("id").eq("slug", "friends-league").maybeSingle();
if (!league) {
  const { data, error } = await admin.from("leagues").insert({
    name: "Friends League", slug: "friends-league", created_by: ids[0],
  }).select("id").single();
  if (error) throw error;
  league = data;
}

for (let i = 0; i < ids.length; i++) {
  const { error } = await admin.from("league_members").upsert({
    league_id: league.id, profile_id: ids[i], role: i === 0 ? "admin" : "player",
  });
  if (error) throw error;
}

const defaults = {
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
};

for (const [key, value] of Object.entries(defaults)) {
  const { error } = await admin.from("settings").upsert({
    league_id: league.id, key, value, updated_by: ids[0],
  }, { onConflict: "league_id,key" });
  if (error) throw error;
}

console.log("Development seed complete.");
console.log("player_one / DevPassword1! (admin)");
console.log("player_two / DevPassword2!");
console.log("player_three / DevPassword3!");
