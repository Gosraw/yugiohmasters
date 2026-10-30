#!/usr/bin/env node
// scripts/generate-boss-routes-v3-migration.mjs
//
// Reads data/boss-route-registry-v3.mjs (the 14 Season 2 Boss Paths) and
// emits supabase/migrations/202610301000_boss_routes_v3.sql.
//
// Successor of scripts/generate-boss-route-seed-migration.mjs (the 20
// Season 1 routes), same safety discipline:
//   - every card row is looked up by NAME inside the SQL, never by a
//     hardcoded id, and the SQL itself aborts if any name does not resolve
//     to exactly one card_catalog row (no silent skips - an INSERT ...
//     SELECT that finds nothing would otherwise just insert 0 rows);
//   - this script refuses to write SQL for a name it cannot confirm
//     against the YGOPRODeck TCG snapshot (the same file the local
//     devstack seeds its catalog from), for a Synchro/Link/Pendulum card,
//     a card that is not in Master Duel, a forbidden / legendary_unique
//     support grant, a pool-external card that is not exclusive, or a card
//     used twice;
//   - the output passes the quote-safety scanner (findUnsafeSqlLiteral).
//
// USAGE
//   node scripts/generate-boss-routes-v3-migration.mjs [--out <path>]
//   node scripts/generate-boss-routes-v3-migration.mjs --check   (validate only)
//
// Pure generator: never touches a database, no network.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BOSS_ROUTES_V3 } from "../data/boss-route-registry-v3.mjs";
import { findUnsafeSqlLiteral } from "./generate-boss-route-seed-migration.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

export const DEFAULT_OUT = path.join(REPO_ROOT, "supabase", "migrations", "202610301000_boss_routes_v3.sql");

const BANNED_MECHANICS = ["synchro", "pendulum", "link"];

// Text that means "this card only does something with a banned mechanic".
// Tuners are fine as long as their effect does not need a Synchro Summon.
const BANNED_TEXT = /\b(synchro|pendulum|link monster|link material|link rating|pendulum zone|pendulum scale)\b/i;

function sqlQuote(value) {
  if (value === null || value === undefined) return "null";
  const str = String(value);
  const literal = `'${str.replace(/'/g, "''")}'`;
  if (literal.slice(1, -1).replace(/''/g, "'") !== str) {
    throw new Error(`sqlQuote() safety check failed for ${JSON.stringify(str)}`);
  }
  return literal;
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relative), "utf8"));
}

function misc(card) {
  return card.misc_info?.[0] ?? {};
}

// Same TCG filter as scripts/devstack/seed-catalog.mjs (and
// scripts/sync-cards.mjs for production): only TCG cards exist in
// card_catalog.
function isTcgCard(card) {
  return Boolean(misc(card).tcg_date) || (misc(card).formats ?? []).includes("TCG");
}

export function loadReferenceData() {
  const snapshot = readJson("data/external/ygoprodeck-cardinfo.json").data.filter(isTcgCard);
  const pool = readJson("data/cardpool/classic-v2-pool.json").cards;
  const tcg2014 = readJson("data/banlists/tcg-2014-10.json");
  const proposal = readJson("data/banlists/duelist-circle-proposal.json").entries;

  const byName = new Map();
  const duplicateNames = new Set();
  for (const card of snapshot) {
    if (byName.has(card.name)) duplicateNames.add(card.name);
    byName.set(card.name, card);
  }

  return {
    byName,
    duplicateNames,
    poolByName: new Map(pool.map((c) => [c.name, c])),
    forbidden2014: new Set(tcg2014.forbidden),
    proposalByName: new Map(proposal.map((e) => [e.name, e])),
  };
}

// Pool status of a card for the Classic v2 format:
//   "pool"        playable pool card (format_eligible after launch)
//   "pool-banned" listed in the pool file but not playable (forbidden)
//   "external"    not in the pool at all
export function poolStatus(name, ref) {
  const entry = ref.poolByName.get(name);
  if (!entry) return "external";
  return entry.playable ? "pool" : "pool-banned";
}

export function validateRoutesV3(routes, ref) {
  const errors = [];
  const warnings = [];
  const usedBy = new Map();
  const codes = new Set();
  const orders = new Set();

  const checkCard = (name, where) => {
    const card = ref.byName.get(name);
    if (!card) {
      errors.push(`${where}: ${JSON.stringify(name)} is not a TCG card in data/external/ygoprodeck-cardinfo.json`);
      return null;
    }
    if (ref.duplicateNames.has(name)) {
      errors.push(`${where}: ${JSON.stringify(name)} is ambiguous (two catalog rows share the name)`);
    }
    const kind = `${card.type ?? ""} ${card.frameType ?? ""}`.toLowerCase();
    for (const banned of BANNED_MECHANICS) {
      if (kind.includes(banned)) errors.push(`${where}: ${JSON.stringify(name)} is a ${banned} card`);
    }
    if (BANNED_TEXT.test(card.desc ?? "")) {
      errors.push(`${where}: ${JSON.stringify(name)} mentions Synchro/Link/Pendulum in its text`);
    }
    if (!(misc(card).formats ?? []).includes("Master Duel")) {
      errors.push(`${where}: ${JSON.stringify(name)} is not in Master Duel (not_available always blocks deck use)`);
    }
    const proposal = ref.proposalByName.get(name);
    if (proposal && ["forbidden", "legendary_unique"].includes(proposal.verdict)) {
      errors.push(`${where}: ${JSON.stringify(name)} is ${proposal.verdict} in our banlist proposal`);
    }
    return card;
  };

  for (const route of routes) {
    const where = route.code;
    if (!/^[a-z0-9_]{2,40}$/.test(route.code)) errors.push(`${where}: bad code format`);
    if (codes.has(route.code)) errors.push(`${where}: duplicate code`);
    codes.add(route.code);
    if (orders.has(route.displayOrder)) errors.push(`${where}: duplicate displayOrder ${route.displayOrder}`);
    orders.add(route.displayOrder);
    if (!["A", "A+"].includes(route.targetPowerGrade)) errors.push(`${where}: targetPowerGrade must be A or A+`);
    for (const key of ["startStrength", "growth", "bossPower", "synergy", "flexibility"]) {
      const v = route.starProfile?.[key];
      if (!Number.isInteger(v) || v < 1 || v > 5) errors.push(`${where}: starProfile.${key} must be 1-5`);
    }
    for (const key of ["consistency", "interaction", "bossImpact", "floor", "ceiling"]) {
      const v = route.balance?.[key];
      if (typeof v !== "number" || v < 1 || v > 10) errors.push(`${where}: balance.${key} must be 1-10`);
    }
    if (!route.teaserStory || !route.howItPlays) errors.push(`${where}: teaserStory and howItPlays are required`);

    const stageNumbers = route.stages.map((s) => s.stageNumber).sort();
    if (JSON.stringify(stageNumbers) !== "[1,2,3,4]") errors.push(`${where}: expected stages 1-4`);
    const boss = route.stages.find((s) => s.stageNumber === 4);
    if (!boss?.isBoss) errors.push(`${where}: stage 4 must be flagged isBoss`);

    const seenInRoute = new Set();
    const note = (name) => {
      if (seenInRoute.has(name)) errors.push(`${where}: ${JSON.stringify(name)} used twice in the route`);
      seenInRoute.add(name);
      const other = usedBy.get(name);
      if (other && other !== route.code) errors.push(`${where}: ${JSON.stringify(name)} is also used by ${other}`);
      usedBy.set(name, route.code);
    };

    for (const stage of route.stages) {
      const label = `${where} stage ${stage.stageNumber} evolution`;
      note(stage.evolutionCard);
      checkCard(stage.evolutionCard, label);
      const status = poolStatus(stage.evolutionCard, ref);
      if (status !== "pool" && !route.fairness?.[stage.evolutionCard]) {
        errors.push(`${label}: ${JSON.stringify(stage.evolutionCard)} is outside the pool - add a fairness note`);
      }
      if (typeof stage.impact !== "number") errors.push(`${label}: impact missing`);
    }

    const perStage = new Map();
    for (const grant of route.supportGrants) {
      const label = `${where} stage ${grant.stageNumber} grant`;
      perStage.set(grant.stageNumber, (perStage.get(grant.stageNumber) ?? 0) + 1);
      note(grant.cardName);
      checkCard(grant.cardName, label);
      if ((grant.quantity ?? 1) !== 1) errors.push(`${label}: v3 grants are 1 copy each`);
      if (typeof grant.impact !== "number") errors.push(`${label}: impact missing`);
      if (ref.forbidden2014.has(grant.cardName)) {
        errors.push(`${label}: ${JSON.stringify(grant.cardName)} is on the October 2014 Forbidden list`);
      }
      const status = poolStatus(grant.cardName, ref);
      if (status !== "pool" && !grant.exclusive) {
        errors.push(`${label}: ${JSON.stringify(grant.cardName)} is outside the pool, so it must be exclusive (only exclusive grants are deck-legal through the Boss-route exemption)`);
      }
      if (status === "pool" && grant.exclusive) {
        errors.push(`${label}: ${JSON.stringify(grant.cardName)} is a pool card - keep it non-exclusive so other players can still pull it`);
      }
      if (status !== "pool" && !route.fairness?.[grant.cardName]) {
        errors.push(`${label}: ${JSON.stringify(grant.cardName)} is outside the pool - add a fairness note`);
      }
    }
    for (const stageNumber of [1, 2, 3, 4]) {
      const n = perStage.get(stageNumber) ?? 0;
      if (n < 2 || n > 4) errors.push(`${where}: stage ${stageNumber} has ${n} grants (expected 2-4)`);
    }
    for (const name of Object.keys(route.fairness ?? {})) {
      if (!seenInRoute.has(name)) warnings.push(`${where}: fairness note for ${JSON.stringify(name)}, which the route does not use`);
    }
  }

  return { errors, warnings };
}

export function generateSqlV3(routes) {
  const codes = routes.map((r) => sqlQuote(r.code)).join(", ");
  const out = [];
  const push = (...lines) => out.push(...lines);

  push(
    "-- =========================================================",
    "-- BOSS ROUTES V3: the 14 Season 2 Boss Paths",
    "--",
    "-- GENERATED FILE - do not hand-edit. Regenerate with:",
    "--   node scripts/generate-boss-routes-v3-migration.mjs",
    "-- from data/boss-route-registry-v3.mjs (design + balance notes there and",
    "-- in docs/BOSS_PATHS_V3.md).",
    "--",
    "-- WHAT IT DOES (one transaction, re-runnable):",
    "--   1. boss_routes.how_it_plays (new, nullable); display_order may go",
    "--      up to 999 so retired routes can be parked at 100+.",
    "--   2. Retires every route that is not one of the 14 (is_active =",
    "--      false, display_order + 100). Retired routes that no player path",
    "--      references are deleted (cascades to their stages / grants /",
    "--      achievement rows; no card_instances row is touched). Routes a",
    "--      player still has stay retired until the Season 2 reset wipes",
    "--      player_boss_paths and deletes them",
    "--      (scripts/season2/reset-and-activate.sql).",
    "--   3. Upserts the 14 routes, their 4 stages and their support grants,",
    "--      and removes grants that are no longer in the registry. Card ids",
    "--      are looked up by name; any name that does not resolve to exactly",
    "--      one card_catalog row aborts the whole migration.",
    "--   4. Stage prices are NOT set here: each new stage copies the price",
    "--      currently configured for that stage number on the existing",
    "--      routes (900 / 1,400 / 2,400 before runbook step 2b, the approved",
    "--      1,800 / 3,200 / 5,500 after it). An existing v3 stage keeps its",
    "--      price on a re-run.",
    "--   5. Boss-route exemption, tightened (classic v2 format):",
    "--      - is_boss_route_exempt_card / is_boss_route_reserved_card only",
    "--        look at ACTIVE routes;",
    "--      - deck legality through the exemption is per OWNER: a route card",
    "--        outside the pool is deck-legal only for a player who has that",
    "--        route (is_duelist_circle_deck_legal_for + validate_deck_card);",
    "--      - the exemption waives a banlist limit only for cards OUTSIDE",
    "--        the pool; route cards inside the pool keep their limit.",
    "--   No v3 route has achievement events: 2.0 evolution is DP only.",
    "-- =========================================================",
    "",
    "begin;",
    "",
    "-- ---------------------------------------------------------",
    "-- 1. Schema (additive)",
    "-- ---------------------------------------------------------",
    "",
    "alter table public.boss_routes",
    "  add column if not exists how_it_plays text;",
    "",
    "comment on column public.boss_routes.how_it_plays is",
    "  'One line: how this route changes your game plan (shown on the route picker). Season 2 routes only.';",
    "",
    "alter table public.boss_routes",
    "  drop constraint if exists boss_routes_display_order_range;",
    "",
    "alter table public.boss_routes",
    "  add constraint boss_routes_display_order_range",
    "  check (display_order between 1 and 999);",
    "",
    "-- Stage prices: copy the price configured today for each stage number",
    "-- (most common value on the other routes), BEFORE the old routes are",
    "-- retired / deleted below. Never hardcoded here.",
    "create temp table boss_v3_prices on commit drop as",
    "select s.stage_number, mode() within group (order by s.dp_cost_to_reach) as dp_cost_to_reach",
    "from public.boss_route_stages s",
    "join public.boss_routes r on r.id = s.route_id",
    "where s.stage_number in (2, 3, 4)",
    "  and s.dp_cost_to_reach is not null",
    `  and r.code not in (${codes})`,
    "group by s.stage_number;",
    "",
    "-- A re-run (no old routes left after the Season 2 reset) copies from",
    "-- the v3 routes themselves.",
    "insert into boss_v3_prices (stage_number, dp_cost_to_reach)",
    "select s.stage_number, mode() within group (order by s.dp_cost_to_reach)",
    "from public.boss_route_stages s",
    "join public.boss_routes r on r.id = s.route_id",
    "where s.stage_number in (2, 3, 4)",
    "  and s.dp_cost_to_reach is not null",
    `  and r.code in (${codes})`,
    "  and s.stage_number not in (select stage_number from boss_v3_prices)",
    "group by s.stage_number;",
    "",
    "do $prices$",
    "begin",
    "  if (select count(*) from boss_v3_prices where dp_cost_to_reach > 0) <> 3 then",
    "    raise exception 'BOSS ROUTES V3 ABORTED: no configured stage 2/3/4 price to copy (boss_route_stages has no priced stages).';",
    "  end if;",
    "end;",
    "$prices$;",
    "",
    "-- ---------------------------------------------------------",
    "-- 2. Retire the old routes",
    "-- ---------------------------------------------------------",
    "",
    "update public.boss_routes",
    "set is_active = false,",
    "    display_order = case when display_order < 100 then display_order + 100 else display_order end",
    `where code not in (${codes})`,
    "  and (is_active or display_order < 100);",
    "",
    "delete from public.boss_routes r",
    `where r.code not in (${codes})`,
    "  and not r.is_active",
    "  and not exists (select 1 from public.player_boss_paths p where p.route_id = r.id)",
    "  and not exists (",
    "    select 1",
    "    from public.player_boss_achievement_events pe",
    "    join public.boss_route_achievement_events e on e.id = pe.event_id",
    "    where e.route_id = r.id",
    "  );",
    "",
    "-- ---------------------------------------------------------",
    "-- 3. The 14 routes",
    "-- ---------------------------------------------------------",
    "",
    "create temp table boss_v3_routes (",
    "  code text primary key,",
    "  name text not null,",
    "  display_order integer not null,",
    "  teaser_story text not null,",
    "  how_it_plays text not null,",
    "  star_profile jsonb not null,",
    "  target_power_grade text not null",
    ") on commit drop;",
    "",
    "create temp table boss_v3_stages (",
    "  code text not null,",
    "  stage_number integer not null,",
    "  card_name text not null,",
    "  primary key (code, stage_number)",
    ") on commit drop;",
    "",
    "create temp table boss_v3_grants (",
    "  code text not null,",
    "  stage_number integer not null,",
    "  card_name text not null,",
    "  is_route_exclusive boolean not null,",
    "  quantity integer not null,",
    "  primary key (code, stage_number, card_name)",
    ") on commit drop;",
    "",
  );

  push("insert into boss_v3_routes (code, name, display_order, teaser_story, how_it_plays, star_profile, target_power_grade) values");
  push(
    routes
      .map((r) => `  (${sqlQuote(r.code)}, ${sqlQuote(r.name)}, ${r.displayOrder}, ${sqlQuote(r.teaserStory)}, ${sqlQuote(r.howItPlays)}, ${sqlQuote(JSON.stringify(r.starProfile))}::jsonb, ${sqlQuote(r.targetPowerGrade)})`)
      .join(",\n") + ";",
    "",
  );

  push("insert into boss_v3_stages (code, stage_number, card_name) values");
  push(
    routes
      .flatMap((r) => r.stages.map((s) => `  (${sqlQuote(r.code)}, ${s.stageNumber}, ${sqlQuote(s.evolutionCard)})`))
      .join(",\n") + ";",
    "",
  );

  push("insert into boss_v3_grants (code, stage_number, card_name, is_route_exclusive, quantity) values");
  push(
    routes
      .flatMap((r) => r.supportGrants.map((g) => `  (${sqlQuote(r.code)}, ${g.stageNumber}, ${sqlQuote(g.cardName)}, ${g.exclusive ? "true" : "false"}, ${g.quantity ?? 1})`))
      .join(",\n") + ";",
    "",
  );

  push(
    "-- Every card name must resolve to exactly one card_catalog row.",
    "do $names$",
    "declare",
    "  v_missing text;",
    "begin",
    "  select string_agg(format('%s (%s)', n.card_name, coalesce(m.hits, 0)), ', ' order by n.card_name)",
    "  into v_missing",
    "  from (",
    "    select card_name from boss_v3_stages",
    "    union",
    "    select card_name from boss_v3_grants",
    "  ) n",
    "  left join (",
    "    select c.name, count(*) as hits",
    "    from public.card_catalog c",
    "    group by c.name",
    "  ) m on m.name = n.card_name",
    "  where coalesce(m.hits, 0) <> 1;",
    "",
    "  if v_missing is not null then",
    "    raise exception 'BOSS ROUTES V3 ABORTED: these card names do not match exactly one card_catalog row: %', v_missing;",
    "  end if;",
    "end;",
    "$names$;",
    "",
    "insert into public.boss_routes (code, name, display_order, teaser_story, how_it_plays, star_profile, target_power_grade, is_active)",
    "select code, name, display_order, teaser_story, how_it_plays, star_profile, target_power_grade, true",
    "from boss_v3_routes",
    "on conflict (code) do update set",
    "  name = excluded.name,",
    "  display_order = excluded.display_order,",
    "  teaser_story = excluded.teaser_story,",
    "  how_it_plays = excluded.how_it_plays,",
    "  star_profile = excluded.star_profile,",
    "  target_power_grade = excluded.target_power_grade,",
    "  is_active = true;",
    "",
    "-- Evolution cards. The (route_id, evolution_card_catalog_id) unique",
    "-- check could trip if a re-run moved a card between two stages of the",
    "-- same route; clear the stage rows whose card changes first (their",
    "-- grants are re-inserted below, players keep their unlock rows).",
    "update public.boss_route_stages s",
    "set evolution_card_catalog_id = c.id",
    "from boss_v3_stages v",
    "join public.boss_routes r on r.code = v.code",
    "join public.card_catalog c on c.name = v.card_name",
    "where s.route_id = r.id",
    "  and s.stage_number = v.stage_number",
    "  and s.evolution_card_catalog_id <> c.id",
    "  and not exists (",
    "    select 1 from public.boss_route_stages other",
    "    where other.route_id = r.id and other.evolution_card_catalog_id = c.id and other.id <> s.id",
    "  );",
    "",
    "insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)",
    "select r.id, v.stage_number, c.id, case when v.stage_number = 1 then null else p.dp_cost_to_reach end",
    "from boss_v3_stages v",
    "join public.boss_routes r on r.code = v.code",
    "join public.card_catalog c on c.name = v.card_name",
    "left join boss_v3_prices p on p.stage_number = v.stage_number",
    "on conflict (route_id, stage_number) do nothing;",
    "",
    "-- Support grants: remove what is no longer in the registry, upsert the rest.",
    "delete from public.boss_route_stage_grants g",
    "using public.boss_route_stages s, public.boss_routes r, public.card_catalog c",
    "where g.stage_id = s.id",
    "  and s.route_id = r.id",
    "  and c.id = g.card_catalog_id",
    "  and r.code in (select code from boss_v3_routes)",
    "  and not exists (",
    "    select 1 from boss_v3_grants v",
    "    where v.code = r.code and v.stage_number = s.stage_number and v.card_name = c.name",
    "  );",
    "",
    "insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)",
    "select s.id, c.id, v.is_route_exclusive, v.quantity",
    "from boss_v3_grants v",
    "join public.boss_routes r on r.code = v.code",
    "join public.boss_route_stages s on s.route_id = r.id and s.stage_number = v.stage_number",
    "join public.card_catalog c on c.name = v.card_name",
    "on conflict (stage_id, card_catalog_id) do update set",
    "  is_route_exclusive = excluded.is_route_exclusive,",
    "  quantity = excluded.quantity;",
    "",
  );

  push(...EXEMPTION_SQL.split("\n"), "");

  push(
    "-- ---------------------------------------------------------",
    "-- 6. Verify",
    "-- ---------------------------------------------------------",
    "",
    "do $verify$",
    "declare",
    "  v_active integer;",
    "  v_stages integer;",
    "  v_grants integer;",
    "  v_expected_grants integer := (select count(*) from boss_v3_grants);",
    "  v_bad_stage text;",
    "  v_bad_card text;",
    "begin",
    "  select count(*) into v_active from public.boss_routes where is_active;",
    "  if v_active <> (select count(*) from boss_v3_routes) then",
    "    raise exception 'BOSS ROUTES V3 ABORTED: % active routes, expected %', v_active, (select count(*) from boss_v3_routes);",
    "  end if;",
    "",
    "  if exists (select 1 from public.boss_routes where is_active and code not in (select code from boss_v3_routes)) then",
    "    raise exception 'BOSS ROUTES V3 ABORTED: a non-v3 route is still active';",
    "  end if;",
    "",
    "  select count(*) into v_stages",
    "  from public.boss_route_stages s",
    "  join public.boss_routes r on r.id = s.route_id",
    "  where r.is_active;",
    "  if v_stages <> 4 * v_active then",
    "    raise exception 'BOSS ROUTES V3 ABORTED: % stages for % active routes', v_stages, v_active;",
    "  end if;",
    "",
    "  select string_agg(r.code || ' stage ' || s.stage_number, ', ') into v_bad_stage",
    "  from public.boss_route_stages s",
    "  join public.boss_routes r on r.id = s.route_id",
    "  left join boss_v3_stages v on v.code = r.code and v.stage_number = s.stage_number",
    "  left join public.card_catalog c on c.id = s.evolution_card_catalog_id",
    "  where r.is_active",
    "    and (v.card_name is distinct from c.name",
    "         or (s.stage_number = 1 and s.dp_cost_to_reach is not null)",
    "         or (s.stage_number > 1 and coalesce(s.dp_cost_to_reach, 0) <= 0));",
    "  if v_bad_stage is not null then",
    "    raise exception 'BOSS ROUTES V3 ABORTED: stage card or price wrong for %', v_bad_stage;",
    "  end if;",
    "",
    "  select count(*) into v_grants",
    "  from public.boss_route_stage_grants g",
    "  join public.boss_route_stages s on s.id = g.stage_id",
    "  join public.boss_routes r on r.id = s.route_id",
    "  where r.is_active;",
    "  if v_grants <> v_expected_grants then",
    "    raise exception 'BOSS ROUTES V3 ABORTED: % grants on active routes, expected %', v_grants, v_expected_grants;",
    "  end if;",
    "",
    "  select string_agg(c.name, ', ') into v_bad_card",
    "  from public.boss_route_stages s",
    "  join public.boss_routes r on r.id = s.route_id",
    "  join public.card_catalog c on c.id = s.evolution_card_catalog_id",
    "  where r.is_active",
    "    and (coalesce(c.card_type, '') ~* '(synchro|link|pendulum)' or coalesce(c.frame_type, '') ~* '(synchro|link|pendulum)');",
    "  if v_bad_card is null then",
    "    select string_agg(c.name, ', ') into v_bad_card",
    "    from public.boss_route_stage_grants g",
    "    join public.boss_route_stages s on s.id = g.stage_id",
    "    join public.boss_routes r on r.id = s.route_id",
    "    join public.card_catalog c on c.id = g.card_catalog_id",
    "    where r.is_active",
    "      and (coalesce(c.card_type, '') ~* '(synchro|link|pendulum)' or coalesce(c.frame_type, '') ~* '(synchro|link|pendulum)');",
    "  end if;",
    "  if v_bad_card is not null then",
    "    raise exception 'BOSS ROUTES V3 ABORTED: Synchro/Link/Pendulum route card(s): %', v_bad_card;",
    "  end if;",
    "",
    "  raise notice 'BOSS ROUTES V3 OK: % active routes, % stages, % grants; % retired route(s) still referenced by a player (deleted by the Season 2 reset)',",
    "    v_active, v_stages, v_grants, (select count(*) from public.boss_routes where not is_active);",
    "end;",
    "$verify$;",
    "",
    "commit;",
    "",
  );

  return out.join("\n");
}

// Hand-written part (not data-driven): the exemption functions.
const EXEMPTION_SQL = `-- ---------------------------------------------------------
-- 5. Boss-route exemption (Classic v2), tightened
-- ---------------------------------------------------------

-- Exempt set = evolution cards (any stage) + exclusive grants of ACTIVE
-- routes. Same signature as 202610121010.
create or replace function public.is_boss_route_exempt_card(
  target_card_catalog_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.boss_route_stages s
    join public.boss_routes r on r.id = s.route_id
    where s.evolution_card_catalog_id = target_card_catalog_id
      and r.is_active
  )
  or exists (
    select 1
    from public.boss_route_stage_grants g
    join public.boss_route_stages s on s.id = g.stage_id
    join public.boss_routes r on r.id = s.route_id
    where g.card_catalog_id = target_card_catalog_id
      and g.is_route_exclusive = true
      and r.is_active
  );
$$;

comment on function public.is_boss_route_exempt_card(uuid) is
  'Boss evolution monster (any stage) or route-exclusive support grant of an ACTIVE route. Card-level; deck legality is per owner (is_duelist_circle_deck_legal_for).';

revoke all on function public.is_boss_route_exempt_card(uuid) from public;
grant execute on function public.is_boss_route_exempt_card(uuid) to authenticated;

-- Reserved set (never offered by packs / draft / shop singles): stage 4
-- Bosses + exclusive grants of ACTIVE routes. Same signature as
-- 202610120140. (The inline copies in the draft / pack pickers read the
-- tables directly; the Season 2 reset deletes retired routes, so they
-- end up on the same set.)
create or replace function public.is_boss_route_reserved_card(
  target_card_catalog_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.boss_route_stages brs
    join public.boss_routes r on r.id = brs.route_id
    where brs.evolution_card_catalog_id = target_card_catalog_id
      and brs.stage_number = 4
      and r.is_active
  )
  or exists (
    select 1
    from public.boss_route_stage_grants brg
    join public.boss_route_stages brs on brs.id = brg.stage_id
    join public.boss_routes r on r.id = brs.route_id
    where brg.card_catalog_id = target_card_catalog_id
      and brg.is_route_exclusive = true
      and r.is_active
  );
$$;

comment on function public.is_boss_route_reserved_card(uuid) is
  'True for a Stage-4 Boss or an is_route_exclusive support card of an ACTIVE Boss Route: these only come from the Boss Path, never from packs, draft or shop singles.';

-- Owner check: does this profile have an active route that hands out
-- this card (as an evolution or an exclusive grant)?
create or replace function public.is_boss_route_exempt_for_profile(
  target_card_catalog_id uuid,
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.player_boss_paths p
    join public.boss_routes r on r.id = p.route_id and r.is_active
    join public.boss_route_stages s on s.route_id = r.id
    where p.profile_id = target_profile_id
      and s.evolution_card_catalog_id = target_card_catalog_id
  )
  or exists (
    select 1
    from public.player_boss_paths p
    join public.boss_routes r on r.id = p.route_id and r.is_active
    join public.boss_route_stages s on s.route_id = r.id
    join public.boss_route_stage_grants g on g.stage_id = s.id
    where p.profile_id = target_profile_id
      and g.card_catalog_id = target_card_catalog_id
      and g.is_route_exclusive = true
  );
$$;

comment on function public.is_boss_route_exempt_for_profile(uuid, uuid) is
  'True when the profile has an active Boss Route whose evolution cards or exclusive grants include this card.';

revoke all on function public.is_boss_route_exempt_for_profile(uuid, uuid) from public, anon;
grant execute on function public.is_boss_route_exempt_for_profile(uuid, uuid) to authenticated;

-- Deck legality for a specific deck owner: format_eligible, or (active
-- format with boss_route_exempt) a route card of a route this owner has.
-- not_available in Master Duel and explicit excludes always block.
create or replace function public.is_duelist_circle_deck_legal_for(
  target_card_catalog_id uuid,
  target_profile_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  card public.card_catalog;
  fmt public.duelist_circle_formats;
begin
  select * into card from public.card_catalog where id = target_card_catalog_id;
  if card is null then
    return false;
  end if;

  if card.format_eligible then
    return true;
  end if;

  select * into fmt from public.duelist_circle_formats where is_active = true limit 1;

  if fmt is null or not fmt.boss_route_exempt then
    return false;
  end if;

  if coalesce(card.master_duel_status, 'unknown') = 'not_available' then
    return false;
  end if;

  if exists (
    select 1
    from public.format_card_overrides o
    where o.format_id = fmt.id
      and o.card_catalog_id = card.id
      and o.override_type = 'exclude'
  ) then
    return false;
  end if;

  return public.is_boss_route_exempt_for_profile(card.id, target_profile_id);
end;
$$;

comment on function public.is_duelist_circle_deck_legal_for(uuid, uuid) is
  'May THIS player put a copy of this card in a deck? format_eligible, or - active format with boss_route_exempt - an evolution / exclusive grant of a Boss Route the player has. Used by validate_deck_card. is_duelist_circle_deck_legal(card) stays as the card-level (any owner) answer.';

revoke all on function public.is_duelist_circle_deck_legal_for(uuid, uuid) from public, anon;
grant execute on function public.is_duelist_circle_deck_legal_for(uuid, uuid) to authenticated;

-- Banlist limit: the exemption only waives a limit for a route card that
-- is OUTSIDE the pool (not format_eligible, e.g. Dark Magician of
-- Chaos). Route cards inside the pool keep their normal limit, so a
-- route never lets its owner play extra copies of a limited pool card.
create or replace function public.duelist_circle_deck_copy_limit(
  target_card_catalog_id uuid,
  target_format_code text default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fmt public.duelist_circle_formats;
begin
  if target_format_code is null then
    select * into fmt from public.duelist_circle_formats where is_active = true limit 1;
  else
    select * into fmt from public.duelist_circle_formats where code = target_format_code;
  end if;

  if fmt is null then
    return null;
  end if;

  if fmt.boss_route_exempt
    and public.is_boss_route_exempt_card(target_card_catalog_id)
    and not coalesce((select c.format_eligible from public.card_catalog c where c.id = target_card_catalog_id), false)
  then
    return null;
  end if;

  return (
    select l.max_copies
    from public.duelist_circle_card_limits l
    where l.format_code = fmt.code
      and l.card_catalog_id = target_card_catalog_id
  );
end;
$$;

comment on function public.duelist_circle_deck_copy_limit(uuid, text) is
  'Max copies of a card per deck under our own banlist (0/1/2), or null = no extra limit. Boss-route exemption: no limit only for a route card outside the pool. Default format = the active one; no active format = null (no limits).';

revoke all on function public.duelist_circle_deck_copy_limit(uuid, text) from public;
grant execute on function public.duelist_circle_deck_copy_limit(uuid, text) to authenticated;

-- validate_deck_card: identical to 202610121010 except that legality is
-- now asked for the deck owner (is_duelist_circle_deck_legal_for).
create or replace function public.validate_deck_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner_id uuid;
  target_league_id uuid;

  instance_owner_id uuid;
  instance_league_id uuid;
  instance_locked boolean;

  target_card_type text;
  target_catalog_id uuid;

  current_main_count integer;
  current_extra_count integer;

  main_max integer;
  extra_max integer;
begin
  select d.owner_id, d.league_id
  into target_owner_id, target_league_id
  from public.decks d
  where d.id = new.deck_id;

  if not found then
    raise exception 'Deck does not exist';
  end if;

  select ci.current_owner_id, ci.league_id, ci.locked, cc.card_type, cc.id
  into instance_owner_id, instance_league_id, instance_locked, target_card_type, target_catalog_id
  from public.card_instances ci
  join public.card_catalog cc on cc.id = ci.card_catalog_id
  where ci.id = new.card_instance_id;

  if not found then
    raise exception 'Card instance does not exist';
  end if;

  if instance_owner_id <> target_owner_id then
    raise exception 'You do not own this card instance';
  end if;

  if instance_league_id <> target_league_id then
    raise exception 'Card instance belongs to another league';
  end if;

  if instance_locked = true then
    raise exception 'Locked cards cannot be added to a deck';
  end if;

  if not public.is_duelist_circle_deck_legal_for(target_catalog_id, target_owner_id) then
    raise exception 'This card is not legal in the Duelist Circle format';
  end if;

  -- Fusion + XYZ go to the Extra Deck, everything else to Main.
  if (
    lower(target_card_type) like '%fusion%monster%'
    or lower(target_card_type) like '%xyz%monster%'
  ) then
    if new.section <> 'extra' then
      raise exception 'Fusion and XYZ Monsters must be placed in the Extra Deck';
    end if;
  else
    if new.section <> 'main' then
      raise exception 'Only Fusion and XYZ Monsters may be placed in the Extra Deck';
    end if;
  end if;

  main_max := public.get_deck_setting(target_league_id, 'deck.main_max', 60);
  extra_max := public.get_deck_setting(target_league_id, 'deck.extra_max', 15);

  select count(*)
  into current_main_count
  from public.deck_cards dc
  where dc.deck_id = new.deck_id
    and dc.section = 'main'
    and (tg_op = 'INSERT' or dc.id <> new.id);

  select count(*)
  into current_extra_count
  from public.deck_cards dc
  where dc.deck_id = new.deck_id
    and dc.section = 'extra'
    and (tg_op = 'INSERT' or dc.id <> new.id);

  if new.section = 'main' and current_main_count >= main_max then
    raise exception 'Main Deck is full. Maximum: %', main_max;
  end if;

  if new.section = 'extra' and current_extra_count >= extra_max then
    raise exception 'Extra Deck is full. Maximum: %', extra_max;
  end if;

  return new;
end;
$$;`;

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outPath = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;
  const checkOnly = args.includes("--check");

  const ref = loadReferenceData();
  const { errors, warnings } = validateRoutesV3(BOSS_ROUTES_V3, ref);

  for (const w of warnings) console.log(`warning: ${w}`);

  if (errors.length) {
    console.error(`REFUSING TO GENERATE SQL - ${errors.length} validation error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const sql = generateSqlV3(BOSS_ROUTES_V3);
  const unsafe = findUnsafeSqlLiteral(sql);
  if (unsafe) {
    console.error(`REFUSING TO WRITE - quote-safety check failed: ${unsafe}`);
    process.exit(1);
  }

  const grants = BOSS_ROUTES_V3.reduce((n, r) => n + r.supportGrants.length, 0);
  const external = BOSS_ROUTES_V3.flatMap((r) => [...r.stages.map((s) => s.evolutionCard), ...r.supportGrants.map((g) => g.cardName)])
    .filter((name) => poolStatus(name, ref) !== "pool").length;

  if (checkOnly) {
    console.log(`OK: ${BOSS_ROUTES_V3.length} routes, ${grants} grants, ${external} pool-external cards - registry valid (no file written).`);
    return;
  }

  fs.writeFileSync(outPath, sql, "utf8");
  console.log(`Wrote ${path.relative(REPO_ROOT, outPath)}: ${BOSS_ROUTES_V3.length} routes, ${BOSS_ROUTES_V3.length * 4} stages, ${grants} grants (${external} pool-external cards).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
