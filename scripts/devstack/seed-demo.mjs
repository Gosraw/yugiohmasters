#!/usr/bin/env node
// Fast-forwards the LOCAL devstack database to a "playable" state by
// running the real onboarding RPCs as each test user (with that
// user's own JWT, through the local gateway) - exactly what the UI
// does, just without clicking 64 draft picks:
//
//   bootstrap_private_league -> choose_boss_path -> claim_welcome_packs
//   -> start_personal_initial_draft -> (create_next_draft_offer ->
//   pick_draft_card) x 64
//
//   node scripts/devstack/seed-demo.mjs              # bossg + samo + fardin
//   node scripts/devstack/seed-demo.mjs bossg samo   # only these
//   node scripts/devstack/seed-demo.mjs --catalog    # only the catalog step
//   node scripts/devstack/seed-demo.mjs --welcome fardin
//                                  # only claim_welcome_packs as fardin
//
// Idempotent: a user who already has a Boss Path / a completed draft
// is skipped for that step. Only ever talks to 127.0.0.1.
//
// It first makes the local catalog "playable" (ensurePlayableCatalog):
// a fresh devstack catalog comes straight from the YGOPRODeck snapshot
// and has no game_rarity / Master Duel status - in production those
// were filled in by the rarity pipeline, which isn't replayable from
// migrations. Without them the draft and every shop pack fail with
// "No rarity has enough available cards".

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

import { ANON_KEY, GATEWAY_PORT } from "./keys.mjs";

export const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;
const DB_URL = "postgres://postgres@127.0.0.1:54322/postgres";
const ROOT = path.resolve(import.meta.dirname, "../..");

function readNameList(file) {
  const full = path.join(ROOT, "scripts/generated", file);

  if (!existsSync(full)) {
    return [];
  }

  return readFileSync(full, "utf8").split("\n").map((line) => line.trim()).filter(Boolean);
}

// Deterministic test rarity for cards the rarity pipeline never
// touched locally: same card -> same rarity on every reset.
function hashedRarity(externalId) {
  const bucket = createHash("sha1").update(String(externalId)).digest().readUInt16BE(0) % 100;

  if (bucket < 55) return "Normal";
  if (bucket < 80) return "Rare";
  if (bucket < 92) return "Super Rare";

  return "Ultra Rare";
}

// LOCAL ONLY. Gives every catalog card a rarity (real Legendary /
// Secret Rare name lists from scripts/generated, hashed tiers for the
// rest) and marks unknown Master Duel statuses as 'unlimited' (the
// group plays unlimited rooms). Never overwrites a rarity that a
// migration already set. Returns the number of cards updated.
export async function ensurePlayableCatalog() {
  const sql = postgres(DB_URL, {
    max: 1,
    onnotice: () => {},
  });

  try {
    const [{ missing }] = await sql`select count(*)::int as missing from public.card_catalog where game_rarity is null`;

    // The 151 Classic v2 catalog additions (202610121030) stay
    // 'unknown' on purpose - scripts/sql-tests/32 checks that, and
    // they are never format_eligible locally anyway.
    await sql`update public.card_catalog set master_duel_status = 'unlimited' where (master_duel_status = 'unknown' or master_duel_status is null) and coalesce(format_exclusion_reason, '') not like 'Classic v2 catalog addition%'`;

    if (missing === 0) {
      return 0;
    }

    const legendary = readNameList("LEGENDARY_NAMES.txt");
    const secret = readNameList("SECRET_RARE_NAMES.txt");

    await sql`update public.card_catalog set game_rarity = 'Legendary' where game_rarity is null and name = any(${legendary})`;
    await sql`update public.card_catalog set game_rarity = 'Secret Rare' where game_rarity is null and name = any(${secret})`;

    const rows = await sql`select id, external_card_id from public.card_catalog where game_rarity is null`;
    const byRarity = new Map();

    for (const row of rows) {
      const rarity = hashedRarity(row.external_card_id);
      byRarity.set(rarity, [...(byRarity.get(rarity) ?? []), row.id]);
    }

    for (const [rarity, ids] of byRarity) {
      await sql`update public.card_catalog set game_rarity = ${rarity} where id = any(${ids}::uuid[])`;
    }

    return missing;
  } finally {
    await sql.end();
  }
}

const TEST_USERS = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "test-users.json"), "utf8")
).users;

// Each test user gets a different Boss Route (by display_order), so
// the bots never collide on route-specific scarcity.
const ROUTE_ORDER_BY_USER = {
  bossg: 1,
  samo: 2,
  fardin: 3,
};

function check(result, what) {
  if (result.error) {
    throw new Error(`${what}: ${result.error.message}`);
  }

  return result.data;
}

export async function signIn(username) {
  const user = TEST_USERS.find((u) => u.username === username);

  if (!user) {
    throw new Error(`Unknown devstack test user: ${username}`);
  }

  const supabase = createClient(GATEWAY_URL, ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${username}@duelist.local`,
    password: user.password,
  });

  if (error) {
    throw new Error(`Sign in as ${username} failed: ${error.message}`);
  }

  return {
    supabase,
    userId: data.user.id,
  };
}

async function ensureLeague(supabase, userId) {
  const membership = check(
    await supabase.from("league_members").select("league_id").eq("profile_id", userId).limit(1).maybeSingle(),
    "league membership"
  );

  if (membership?.league_id) {
    return membership.league_id;
  }

  return check(await supabase.rpc("bootstrap_private_league"), "bootstrap_private_league");
}

async function ensureBossPath(supabase, userId, username) {
  const existing = check(
    await supabase.from("player_boss_paths").select("id").eq("profile_id", userId).eq("route_slot", 1).maybeSingle(),
    "boss path lookup"
  );

  if (existing) {
    return false;
  }

  const routes = check(
    await supabase.from("boss_routes").select("id,display_order").eq("is_active", true).order("display_order"),
    "boss routes"
  );

  const wanted = ROUTE_ORDER_BY_USER[username] ?? 1;
  const route = routes.find((r) => r.display_order === wanted) ?? routes[0];

  check(await supabase.rpc("choose_boss_path", { target_route_id: route.id }), "choose_boss_path");

  return true;
}

async function draftPlayer(supabase, userId) {
  return check(
    await supabase
      .from("draft_players")
      .select("id,status")
      .eq("profile_id", userId)
      .order("status", { ascending: true })
      .limit(1)
      .maybeSingle(),
    "draft player lookup"
  );
}

async function ensureDraftCompleted(supabase, userId, leagueId, log) {
  let player = await draftPlayer(supabase, userId);

  if (player?.status === "completed") {
    return 0;
  }

  if (!player) {
    check(await supabase.rpc("start_personal_initial_draft", { target_league_id: leagueId }), "start_personal_initial_draft");
    player = await draftPlayer(supabase, userId);
  }

  let picks = 0;

  // 64 picks normally; the cap only protects against an endless loop.
  for (let guard = 0; guard < 200; guard += 1) {
    let offer = check(
      await supabase
        .from("draft_offers")
        .select("id")
        .eq("draft_player_id", player.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      "active offer lookup"
    );

    if (!offer) {
      const status = check(
        await supabase.from("draft_players").select("status").eq("id", player.id).single(),
        "draft status"
      ).status;

      if (status === "completed") {
        return picks;
      }

      check(await supabase.rpc("create_next_draft_offer", { target_draft_player_id: player.id }), "create_next_draft_offer");
      continue;
    }

    const options = check(
      await supabase
        .from("draft_offer_cards")
        .select("id")
        .eq("offer_id", offer.id)
        .eq("status", "available")
        .order("display_order"),
      "offer options"
    );

    if (options.length === 0) {
      throw new Error(`Draft offer ${offer.id} has no available options`);
    }

    check(
      await supabase.rpc("pick_draft_card", { target_offer_id: offer.id, target_option_id: options[0].id }),
      "pick_draft_card"
    );

    picks += 1;

    if (picks % 16 === 0) {
      log(`    ${picks} picks...`);
    }
  }

  throw new Error("Draft did not complete within 200 iterations");
}

// claim_welcome_packs() as the user (what src/lib/supabase/proxy.ts
// is meant to do on every request). Returns true if newly granted.
export async function claimWelcomePacks(username) {
  const { supabase } = await signIn(username);

  return check(await supabase.rpc("claim_welcome_packs"), "claim_welcome_packs");
}

// Runs the whole onboarding for one user. Returns what it did.
export async function onboardUser(username, { log = () => {} } = {}) {
  const { supabase, userId } = await signIn(username);
  const leagueId = await ensureLeague(supabase, userId);

  if (!leagueId) {
    throw new Error(`${username} has no league (league full?)`);
  }

  const choseBoss = await ensureBossPath(supabase, userId, username);

  // The app's proxy does this on every request; do it here too so a
  // seeded user looks exactly like one who clicked through.
  check(await supabase.rpc("claim_welcome_packs"), "claim_welcome_packs");

  const picks = await ensureDraftCompleted(supabase, userId, leagueId, log);

  return {
    username,
    userId,
    leagueId,
    choseBoss,
    picks,
  };
}

const isCli = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isCli) {
  const args = process.argv.slice(2);
  const catalogOnly = args.includes("--catalog");
  const welcomeOnly = args.includes("--welcome");
  const usernames = args.filter((arg) => !arg.startsWith("--"));
  const targets = catalogOnly || welcomeOnly ? [] : usernames.length ? usernames : TEST_USERS.map((u) => u.username);

  for (const username of welcomeOnly ? usernames : []) {
    const granted = await claimWelcomePacks(username);
    console.log(`${username}: welcome packs ${granted ? "granted" : "already claimed"}`);
  }

  const updated = await ensurePlayableCatalog();
  console.log(`catalog: ${updated} card(s) given a local test rarity`);

  for (const username of targets) {
    console.log(`→ ${username}`);
    const result = await onboardUser(username, { log: console.log });
    console.log(`  boss path ${result.choseBoss ? "chosen" : "already set"}, ${result.picks} draft picks made`);
  }

  if (targets.length) {
    console.log("✓ demo users are playable");
  }
}
