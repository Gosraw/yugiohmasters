#!/usr/bin/env node
// Builds the shareable card-vote page (a claude.ai Artifact) from
// data/cardpool/ranking-vote-lists.json: every "vote here" card with a
// small embedded art crop, the proposal and the reason. Votes are kept
// in the Artifact's own shared store (one document per voter), so the
// live app and its database are not involved.
//
//   node scripts/cardpool/build-vote-page.mjs
//   -> .devstack/vote/card-vote.html   (publish with the Artifact tool)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT_DIR = path.join(ROOT, ".devstack/vote");
const IMG_DIR = path.join(OUT_DIR, "img");

mkdirSync(IMG_DIR, { recursive: true });

const lists = JSON.parse(readFileSync(path.join(ROOT, "data/cardpool/ranking-vote-lists.json"), "utf8")).lists;
const catalog = new Map(
  JSON.parse(readFileSync(path.join(ROOT, "data/external/ygoprodeck-cardinfo.json"), "utf8")).data
    .map((card) => [card.id, card])
);

const items = [];

for (const list of lists) {
  for (const item of list.items) {
    if (item.vote_here) {
      items.push({ list, item });
    }
  }
}

// Download + shrink the art crops (cached between runs).
async function fetchImage(id) {
  const file = path.join(IMG_DIR, `${id}.jpg`);

  if (existsSync(file)) {
    return file;
  }

  const card = catalog.get(id);
  const url = card?.card_images?.[0]?.image_url_cropped;

  if (!url) {
    return null;
  }

  const response = await fetch(url, { headers: { "User-Agent": "Duelist-Circle/1.0" } });

  if (!response.ok) {
    return null;
  }

  const raw = path.join(IMG_DIR, `${id}.raw.jpg`);

  writeFileSync(raw, Buffer.from(await response.arrayBuffer()));
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "42", "--resampleWidth", "120", raw, "--out", file], { stdio: "ignore" });
  execFileSync("rm", ["-f", raw]);

  return file;
}

const queue = [...items];
const images = new Map();

await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const { item } = queue.shift();
    const file = await fetchImage(item.id);

    if (file) {
      images.set(item.id, `data:image/jpeg;base64,${readFileSync(file).toString("base64")}`);
    }
  }
}));

function shortText(text, max = 240) {
  if (!text) {
    return "";
  }

  const clean = text.replace(/\s+/g, " ").trim();

  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const data = lists
  .map((list) => ({
    key: list.key,
    title: list.title,
    description: list.description,
    items: list.items
      .filter((item) => item.vote_here)
      .map((item) => {
        const card = catalog.get(item.id);

        return {
          id: String(item.id),
          name: item.name,
          verdict: item.proposed_verdict,
          context: item.context.replace(/\s*\(category:[^)]*\)\s*$/, "").replace(/\s*\(confidence:[^)]*\)\s*$/, ""),
          type: card ? [card.attribute, card.race, card.type].filter(Boolean).join(" · ") : "",
          text: shortText(card?.desc),
          img: images.get(item.id) ?? "",
        };
      }),
  }))
  .filter((list) => list.items.length);

const template = readFileSync(path.join(import.meta.dirname, "vote-page.template.html"), "utf8");
const html = template.replace("/*__DATA__*/null", JSON.stringify(data).replace(/</g, "\\u003c"));
const out = path.join(OUT_DIR, "card-vote.html");

writeFileSync(out, html);

console.log(`${data.reduce((n, l) => n + l.items.length, 0)} cards in ${data.length} lists, ${images.size} images -> ${path.relative(ROOT, out)} (${Math.round(html.length / 1024)} KB)`);
