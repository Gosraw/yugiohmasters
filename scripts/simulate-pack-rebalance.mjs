#!/usr/bin/env node
// Measures what packs really give, with real purchase_shop_pack calls,
// inside one transaction that is always rolled back. Local databases
// only.
//
//   node scripts/simulate-pack-rebalance.mjs [--url=<local url>] [--packs=500] [--pool-packs=150] [--narrow-packs=500]
//
// Before each purchase the league's cards and the buyer's luck are
// cleared, so every pack is opened in a fresh league with luck 0: copy
// limits and the Legendary guarantee don't colour the numbers.

import postgres from "postgres";

const option = (name, fallback) => {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));

  return found ? found.slice(name.length + 3) : fallback;
};

const URL_ = option("url", "postgres://postgres@127.0.0.1:54322/postgres");
const PACKS = Number(option("packs", 500));
const POOL_PACKS = Number(option("pool-packs", 150));
const NARROW_PACKS = Number(option("narrow-packs", 500));
const ROLLS = Number(option("rolls", 200000));

if (!/@(127\.0\.0\.1|localhost)[:/]/.test(URL_)) {
  console.error("Local databases only.");
  process.exit(1);
}

// The scale the owner's rebalance was calculated with.
const OWNER_SCALE = { Normal: 60, Rare: 90, "Super Rare": 140, "Ultra Rare": 250, "Secret Rare": 450, Legendary: 800 };
const RARITIES = Object.keys(OWNER_SCALE);
const NARROW = ["six_samurai_warlords", "elemental_vanguard", "chaos_shadows"];
const percent = (part, whole) => `${(100 * part / whole).toFixed(2)}%`;

const sql = postgres(URL_, { max: 1, onnotice: () => {} });

try {
  await sql.unsafe("begin");

  const [buyer] = await sql`
    select lm.profile_id as id
    from public.league_members lm
    order by lm.joined_at nulls last
    limit 1
  `;

  await sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: buyer.id, role: "authenticated" })}, true)`;
  await sql`update public.profiles set duel_points = 100000000 where id = ${buyer.id}`;

  const singles = {};

  for (const rarity of RARITIES) {
    const [row] = await sql`select public.shop_single_card_price(${rarity}) as price`;

    singles[rarity] = row.price;
  }

  await sql.unsafe(`
    create function pg_temp.fresh_league(target uuid)
    returns void
    language plpgsql
    as $$
    begin
      set local session_replication_role = replica;
      delete from public.shop_pack_pulls;
      delete from public.ownership_history;
      delete from public.card_instances;
      set local session_replication_role = origin;

      insert into public.player_pack_luck (profile_id, luck_points)
      values (target, 0)
      on conflict (profile_id) do update set luck_points = 0;
    end;
    $$;
  `);

  async function buy(code) {
    await sql`select pg_temp.fresh_league(${buyer.id})`;

    const [{ opening }] = await sql`select public.purchase_shop_pack(${code}) as opening`;

    return sql`
      select
        p.pulled_rarity as rarity,
        p.card_catalog_id as card,
        nullif(lower(btrim(c.archetype)), '') as archetype
      from public.shop_pack_pulls p
      join public.card_catalog c on c.id = p.card_catalog_id
      where p.opening_id = ${opening}
    `;
  }

  async function run(code, count, price) {
    const stats = {
      packs: 0, cards: 0, duplicates: 0, owner: 0, singles: 0, rarity: {}, maxArchetype: {},
    };

    for (let i = 0; i < count; i += 1) {
      const pulls = await buy(code);
      const perArchetype = {};

      stats.packs += 1;
      stats.cards += pulls.length;
      stats.duplicates += pulls.length - new Set(pulls.map((pull) => pull.card)).size;

      for (const pull of pulls) {
        stats.rarity[pull.rarity] = (stats.rarity[pull.rarity] ?? 0) + 1;
        stats.owner += OWNER_SCALE[pull.rarity];
        stats.singles += singles[pull.rarity];

        if (pull.archetype) {
          perArchetype[pull.archetype] = (perArchetype[pull.archetype] ?? 0) + 1;
        }
      }

      const most = Math.max(0, ...Object.values(perArchetype));

      stats.maxArchetype[most] = (stats.maxArchetype[most] ?? 0) + 1;
    }

    stats.price = price;

    return stats;
  }

  function line(name, stats) {
    const rarity = RARITIES.map((r) => `${r} ${percent(stats.rarity[r] ?? 0, stats.cards)}`).join(", ");

    console.log(`\n${name}: ${stats.packs} packs, ${(stats.cards / stats.packs).toFixed(2)} cards per pack, ${stats.duplicates} repeats`);
    console.log(`  rarity: ${rarity}`);
    console.log(`  Legendaries per 100 packs: ${(100 * (stats.rarity.Legendary ?? 0) / stats.packs).toFixed(2)}`);
    console.log(`  value per DP: owner's scale ${(stats.owner / stats.packs / stats.price).toFixed(3)}x, shop_single_card_price ${(stats.singles / stats.packs / stats.price).toFixed(3)}x`);
    console.log(`  max cards per archetype, packs: ${JSON.stringify(stats.maxArchetype)}`);
  }

  const merge = (a, b) => {
    for (const key of ["packs", "cards", "duplicates", "owner", "singles"]) {
      a[key] += b[key];
    }

    for (const key of ["rarity", "maxArchetype"]) {
      for (const [k, v] of Object.entries(b[key])) {
        a[key][k] = (a[key][k] ?? 0) + v;
      }
    }

    a.price = b.price;

    return a;
  };

  console.log(`Database: ${URL_.replace(/:\/\/[^@]*@/, "://")}`);
  console.log(`Singles prices in the database: ${JSON.stringify(singles)}`);
  console.log(`Owner's scale: ${JSON.stringify(OWNER_SCALE)}`);

  console.log(`\n--- Roll functions, ${ROLLS} rolls each ---`);

  for (const code of ["normal", "special_archetype", "premium", "deluxe"]) {
    for (const fn of ["peak", "filler"]) {
      const rows = await sql.unsafe(`
        select coalesce(public.roll_shop_pack_${fn}_rarity('${code}'), 'none') as rarity, count(*)::int as n
        from generate_series(1, ${ROLLS})
        group by 1
      `);
      const text = [...RARITIES, "none"]
        .filter((r) => rows.some((row) => row.rarity === r))
        .map((r) => `${r} ${percent(rows.find((row) => row.rarity === r).n, ROLLS)}`)
        .join(", ");

      console.log(`${code} ${fn}: ${text}`);
    }
  }

  console.log("\n--- Real purchases, fixed packs ---");

  const fixed = {};

  for (const [code, name] of [["normal", "Standard"], ["premium", "Premium"], ["deluxe", "Deluxe"]]) {
    const [{ price }] = await sql`select price_dp as price from public.shop_pack_types where code = ${code}`;

    fixed[code] = await run(code, PACKS, price);
    line(name, fixed[code]);
  }

  console.log("\n--- Real purchases, Special Packs, every curated pool ---");

  const pools = await sql`select code, id from public.shop_special_pack_definitions where is_active order by display_order`;
  const [{ price: specialPrice }] = await sql`
    select price_dp as price from public.shop_special_pack_rotations
    where theme_category = 'archetype' and status = 'active'
  `;
  let all = { packs: 0, cards: 0, duplicates: 0, owner: 0, singles: 0, rarity: {}, maxArchetype: {} };
  const narrowStats = {};

  for (const pool of pools) {
    await sql`
      update public.shop_special_pack_rotations
      set pack_definition_id = ${pool.id}
      where theme_category = 'archetype' and status = 'active'
    `;

    const isNarrow = NARROW.includes(pool.code);
    const stats = await run("special_archetype", isNarrow ? NARROW_PACKS : POOL_PACKS, specialPrice);

    line(pool.code, stats);

    if (isNarrow) {
      narrowStats[pool.code] = stats;
    }

    // Every pool counts equally in the Special total.
    const scale = POOL_PACKS / stats.packs;

    all = merge(all, {
      ...stats,
      packs: stats.packs * scale,
      cards: stats.cards * scale,
      duplicates: stats.duplicates * scale,
      owner: stats.owner * scale,
      singles: stats.singles * scale,
      rarity: Object.fromEntries(Object.entries(stats.rarity).map(([k, v]) => [k, v * scale])),
      maxArchetype: Object.fromEntries(Object.entries(stats.maxArchetype).map(([k, v]) => [k, v * scale])),
    });
  }

  line("Special (all pools, equal weight)", all);

  console.log("\n--- Summary: value per DP, ascending is the goal ---");

  for (const [name, stats] of [["Standard", fixed.normal], ["Special", all], ["Premium", fixed.premium], ["Deluxe", fixed.deluxe]]) {
    console.log(`${name.padEnd(9)} ${stats.price} DP, ${(stats.cards / stats.packs).toFixed(1)} cards: owner's scale ${(stats.owner / stats.packs / stats.price).toFixed(3)}x, singles function ${(stats.singles / stats.packs / stats.price).toFixed(3)}x`);
  }
} finally {
  await sql.unsafe("rollback");
  await sql.end();
}
