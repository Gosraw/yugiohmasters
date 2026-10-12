// Seeds public.card_catalog in the LOCAL devstack database from the
// YGOPRODeck snapshot (data/external/ygoprodeck-cardinfo.json, made
// by scripts/cardpool/fetch-catalog.mjs). Same field mapping as
// scripts/sync-cards.mjs, same TCG-only filter (format=tcg), but
// written straight to Postgres so it never needs a Supabase URL/key -
// and therefore can never hit production by accident.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SNAPSHOT = path.resolve(
  import.meta.dirname,
  "../../data/external/ygoprodeck-cardinfo.json"
);

function isTcgCard(card) {
  const info = card.misc_info?.[0];

  return Boolean(info?.tcg_date) || (info?.formats ?? []).includes("TCG");
}

function normalizeCard(card) {
  const type = card.type ?? "";
  const image = card.card_images?.[0];

  return {
    external_card_id: card.id,
    name: card.name,
    card_type: type || "Unknown",
    frame_type: card.frameType ?? null,
    monster_type: card.typeline?.join(" / ") ?? null,
    race: card.race ?? null,
    attribute: card.attribute ?? null,
    level: type.includes("XYZ") || type.includes("Link") ? null : card.level ?? null,
    rank: type.includes("XYZ") ? card.level ?? null : null,
    link_rating: type.includes("Link") ? card.linkval ?? null : null,
    link_markers: Array.isArray(card.linkmarkers) ? card.linkmarkers : [],
    atk: card.atk ?? null,
    def: card.def ?? null,
    description: card.desc ?? null,
    archetype: card.archetype ?? null,
    image_url: image?.image_url ?? null,
    image_url_small: image?.image_url_small ?? null,
    image_url_cropped: image?.image_url_cropped ?? null,
    set_information: card.card_sets ?? [],
    raw_data: card,
    source: "ygoprodeck",
  };
}

export async function seedCatalog(sql) {
  if (!existsSync(SNAPSHOT)) {
    throw new Error(
      "No card snapshot - run: node scripts/cardpool/fetch-catalog.mjs"
    );
  }

  const cards = JSON.parse(readFileSync(SNAPSHOT, "utf8")).data
    .filter(isTcgCard)
    .map(normalizeCard);

  for (let offset = 0; offset < cards.length; offset += 500) {
    const batch = cards.slice(offset, offset + 500);

    await sql`
      insert into public.card_catalog ${sql(batch.map((card) => ({
        ...card,
        set_information: sql.json(card.set_information),
        raw_data: sql.json(card.raw_data),
      })))}
      on conflict (external_card_id) do nothing
    `;
  }

  return cards.length;
}

const TEST_USERS = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "test-users.json"), "utf8")
);

// Creates local test accounts the way signup does (auth.users row ->
// handle_new_auth_user trigger -> profile + wallet) and joins each to
// the league via bootstrap_private_league(), as the app does on first
// login. First user created becomes league admin.
export async function createTestUsers(sql, usernames) {
  for (const user of TEST_USERS.users.filter((u) => usernames.includes(u.username))) {
    const [existing] = await sql`select id from public.profiles where username = ${user.username}`;

    if (existing) {
      continue;
    }

    const [row] = await sql`
      insert into auth.users (email, encrypted_password, raw_user_meta_data)
      values (
        ${`${user.username}@duelist.local`},
        crypt(${user.password}, gen_salt('bf')),
        ${sql.json({ username: user.username, duelist_name: user.username })}
      )
      returning id
    `;

    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: row.id, role: "authenticated" })}, true)`;
      await tx`select public.bootstrap_private_league()`;
    });
  }
}
