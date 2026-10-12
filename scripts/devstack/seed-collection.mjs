#!/usr/bin/env node
// Gives the LOCAL devstack user "bossg" a realistic card collection
// (~1,500 physical copies: Effect/Normal/Tuner/Flip/Ritual monsters,
// Spells, Traps, Fusion + Xyz) and one Draft deck to build with, so
// the deck builder can be tried on real-looking data.
//
//   node scripts/devstack/seed-collection.mjs
//
// Safe to re-run: it tops bossg up to the target instead of adding a
// second collection, and only creates the deck when bossg has none.
// Every copy goes through the normal card_instances insert trigger
// (validate_new_card_instance), so league scarcity limits still apply -
// the script only ever adds copies that are still free in the league.
// Only ever talks to 127.0.0.1:54322 - never production.

import postgres from "postgres";

const DB_URL = "postgres://postgres@127.0.0.1:54322/postgres";
const USERNAME = "bossg";
const DECK_NAME = "Night Temple Test Deck";

// How many distinct cards of each kind to pick.
const PICKS = [
  { label: "Effect", count: 300, where: "card_type = 'Effect Monster'" },
  { label: "Normal", count: 50, where: "card_type in ('Normal Monster', 'Normal Tuner Monster')" },
  { label: "Tuner", count: 45, where: "card_type = 'Tuner Monster'" },
  { label: "Flip", count: 25, where: "card_type in ('Flip Effect Monster', 'Flip Tuner Effect Monster')" },
  { label: "Ritual", count: 15, where: "card_type in ('Ritual Effect Monster', 'Ritual Monster')" },
  { label: "Gemini/Union/Spirit/Toon", count: 12, where: "card_type in ('Gemini Monster', 'Union Effect Monster', 'Spirit Monster', 'Toon Monster')" },
  { label: "Spell", count: 160, where: "card_type = 'Spell Card'" },
  { label: "Trap", count: 110, where: "card_type = 'Trap Card'" },
  { label: "Fusion", count: 55, where: "card_type = 'Fusion Monster'" },
  { label: "Xyz", count: 50, where: "card_type = 'XYZ Monster'" },
  // So a search like "dark warrior level 4" always finds something.
  { label: "DARK Warrior Lv4", count: 15, where: "attribute = 'DARK' and race = 'Warrior' and level = 4" },
];

const sql = postgres(DB_URL, {
  onnotice: () => {},
});

// Deterministic 1-3 copies per card (weighted toward 2-3), based on
// the card id so re-runs pick the same amounts.
function copiesFor(cardId) {
  const n = parseInt(cardId.replace(/-/g, "").slice(0, 6), 16) % 10;

  if (n < 3) return 1;
  if (n < 6) return 2;
  return 3;
}

async function main() {
  const [user] = await sql`
    select p.id, lm.league_id
    from public.profiles p
    join public.league_members lm on lm.profile_id = p.id
    where p.username = ${USERNAME}
    limit 1
  `;

  if (!user) {
    throw new Error(`No ${USERNAME} profile/league membership - run db.mjs reset first.`);
  }

  const [{ owned }] = await sql`
    select count(*)::int as owned
    from public.card_instances
    where current_owner_id = ${user.id}
  `;

  let inserted = 0;

  if (owned >= 1200) {
    console.log(`${USERNAME} already owns ${owned} cards - collection left as is.`);
  } else {
    const picked = new Map();

    for (const pick of PICKS) {
      // md5(name) ordering = a stable pseudo-random sample.
      const rows = await sql.unsafe(`
        select id, name
        from public.card_catalog
        where format_eligible = true
          and image_url is not null
          and ${pick.where}
        order by md5(name || 'devstack')
        limit ${pick.count}
      `);

      for (const row of rows) {
        picked.set(row.id, row.name);
      }

      console.log(`  ${pick.label}: ${rows.length}`);
    }

    await sql.begin(async (tx) => {
      for (const cardId of picked.keys()) {
        const [{ free }] = await tx`
          select public.card_copy_limit(${cardId}) - count(ci.id)::int as free
          from public.card_instances ci
          where ci.league_id = ${user.league_id}
            and ci.card_catalog_id = ${cardId}
        `;

        const copies = Math.min(copiesFor(cardId), free ?? 0);

        for (let i = 0; i < copies; i++) {
          // copy_number 0 -> the insert trigger assigns the next free
          // copy number for this league.
          await tx`
            insert into public.card_instances (
              league_id, card_catalog_id, copy_number,
              current_owner_id, original_owner_id, original_acquisition_type
            ) values (
              ${user.league_id}, ${cardId}, 0,
              ${user.id}, ${user.id}, 'development'
            )
          `;

          inserted += 1;
        }
      }
    });

    console.log(`Gave ${USERNAME} ${inserted} card copies (${picked.size} different cards).`);
  }

  const [existingDeck] = await sql`
    select id from public.decks where owner_id = ${user.id} limit 1
  `;

  if (existingDeck) {
    console.log(`${USERNAME} already has a deck (${existingDeck.id}) - no new deck created.`);
  } else {
    const [deck] = await sql`
      insert into public.decks (league_id, owner_id, name, status)
      values (${user.league_id}, ${user.id}, ${DECK_NAME}, 'draft')
      returning id
    `;

    // 30 Main Deck cards (so the deck is still 10 short of legal - a
    // realistic "in progress" deck) + 4 Extra Deck cards.
    const main = await sql`
      select ci.id
      from public.card_instances ci
      join public.card_catalog cc on cc.id = ci.card_catalog_id
      where ci.current_owner_id = ${user.id}
        and ci.locked = false
        and cc.card_type not ilike '%fusion%'
        and cc.card_type not ilike '%xyz%'
      order by md5(cc.name), ci.copy_number
      limit 30
    `;

    const extra = await sql`
      select ci.id
      from public.card_instances ci
      join public.card_catalog cc on cc.id = ci.card_catalog_id
      where ci.current_owner_id = ${user.id}
        and ci.locked = false
        and (cc.card_type ilike '%fusion%' or cc.card_type ilike '%xyz%')
      order by md5(cc.name), ci.copy_number
      limit 4
    `;

    for (const row of main) {
      await sql`
        insert into public.deck_cards (deck_id, card_instance_id, section)
        values (${deck.id}, ${row.id}, 'main')
      `;
    }

    for (const row of extra) {
      await sql`
        insert into public.deck_cards (deck_id, card_instance_id, section)
        values (${deck.id}, ${row.id}, 'extra')
      `;
    }

    console.log(`Created deck "${DECK_NAME}" (${deck.id}) with ${main.length} Main + ${extra.length} Extra cards.`);
  }
}

try {
  await main();
} finally {
  await sql.end();
}
