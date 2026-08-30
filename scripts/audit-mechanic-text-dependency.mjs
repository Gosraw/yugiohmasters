#!/usr/bin/env node
// =========================================================
// MECHANIC TEXT-DEPENDENCY AUDIT (Synchro / Pendulum / Link)
//
// WHY THIS SCRIPT EXISTS, AND WHY IT'S SEPARATE FROM
// is_duelist_circle_format_eligible()
//
// The live format engine
// (supabase/migrations/202608231500_duelist_circle_format_engine.sql)
// excludes a card by MECHANIC only by looking at that card's own
// card_type/frame_type ("is this card itself a Synchro/Link/Pendulum
// Monster?"). That correctly removes every Synchro/Link/Pendulum
// Monster, but it does NOT catch a Main Deck monster, Spell, or Trap
// whose card_type is ordinary ("Effect Monster", "Spell Card",
// "Trap Card") but whose EFFECT TEXT still functionally requires one
// of those excluded mechanics to exist - e.g. a Normal Spell that
// searches Pendulum Monsters, or a Trap that only works if you
// control a Synchro Monster. For a Fusion/Xyz-only alternate format
// (see docs/cardpool-classic-format-audit-*.md), those cards are
// exactly as "contaminated" as the Synchro/Link/Pendulum cards
// themselves would be, per the Codex brief's section 43 rule: "Do
// not preserve cards simply because technically part of their text
// can function without the excluded mechanic."
//
// This script is a SEPARATE, additive audit layer on top of the
// existing mechanic/cutoff checks - it never replaces them, and it
// intentionally only looks at cards that are NOT already excluded by
// frame_type (auditing those too would just be noise: they're
// already gone).
//
// CLASSIFICATION - deliberately conservative, three buckets:
//
//   hard_dependency   - the card's own text makes it non-functional,
//                        or reduces it to near-total dead weight,
//                        without the excluded mechanic being present
//                        ("if you control a Synchro Monster",
//                        "Special Summon 1 Synchro Monster from your
//                        GY", "add 1 Pendulum Monster from your Deck
//                        to your hand", "Special Summon this card
//                        from your hand, if you control a Link
//                        Monster"). Recommended: EXCLUDE.
//   soft_mention      - the mechanic is mentioned but the card has a
//                        real, independent function without it (an
//                        "or" alternative that doesn't require the
//                        excluded mechanic, an optional/additional
//                        bonus clause, or a mention of a DIFFERENT
//                        card's own summoning method that doesn't
//                        constrain THIS card). Recommended: KEEP,
//                        human spot-check.
//   ambiguous         - the mechanic keyword appears but the
//                        surrounding clause didn't match a confident
//                        pattern either way. Recommended: HUMAN
//                        REVIEW (this is intentionally the fallback,
//                        never silently resolved to hard or soft).
//
// This script is read-only / report-only, matching
// scripts/audit-card-valuation.mjs's own safety convention: it NEVER
// writes to card_catalog. With --write-overrides <format_code> it
// will (only for cards classified hard_dependency, and only by
// exact card name, since this sandbox cannot know real
// card_catalog.id / duelist_circle_formats.id values ahead of time)
// INSERT format_card_overrides exclude rows scoped to that one
// format - never season_1, never a global change, and never
// touching game_rarity or format_eligible directly. Skips any card
// that already has an override row for that format (does not
// overwrite a human decision).
//
// SANDBOX LIMITATION (same class as the rest of this project's
// tooling - see docs/SEASON_1.md §11): this session's sandbox has
// NEITHER a live network path to Supabase NOR a working local
// database, so this script has been written and self-tested against
// a small set of real, independently-verified card texts (see
// runSelfTest() below, invoked automatically when this file is run
// with no Supabase env vars present) but has NOT produced real
// numbers against the actual ~13,900-card catalog. Run it for real
// with `node --env-file=.env.local scripts/audit-mechanic-text-dependency.mjs`
// once you have network access to your Supabase project.
//
// Usage:
//   node scripts/audit-mechanic-text-dependency.mjs
//   node scripts/audit-mechanic-text-dependency.mjs --write-overrides duelist_circle_classic_v1
//   node scripts/audit-mechanic-text-dependency.mjs --self-test   (forces the offline self-test)
// =========================================================

// Patterns may be a RegExp (tested against the whole text) or a
// function predicate `(text) => boolean` for order-independent /
// compound checks that a single regex can't express cleanly (oracle
// text doesn't always put the mechanic keyword and the qualifying
// clause in a fixed order - "Add from your Deck to your hand, up to
// 2 Pendulum Monsters..." puts "to your hand" BEFORE "Pendulum
// Monsters", for example).

function hasAll(text, ...substrings) {
  const lower = text.toLowerCase();
  return substrings.every((s) => lower.includes(s));
}

const MECHANIC_PATTERNS = {
  synchro: {
    label: "Synchro",
    hard: [
      /if you control an? synchro monster/i,
      /while you control an? synchro monster/i,
      /cannot (?:be activated|attack) unless you control an? synchro monster/i,
      /special summon(?:s)? (?:1|one) synchro monster/i,
      (t) => hasAll(t, "synchro monster", "special summon"),
      (t) => hasAll(t, "synchro monster", "add", "to your hand"),
      /target (?:1|one) synchro monster/i,
      /shuffle (?:1|one) synchro monster you control into the (?:deck|extra deck)/i,
      /banish (?:1|one) synchro monster from your (?:graveyard|gy)/i,
      /you can only use this effect if you control an? synchro monster/i,
      /tribute (?:1|one) synchro monster/i,
      /this card gains[^.]*for each synchro monster/i,
      /using (?:only |)synchro monsters you control as (?:the |)(?:fusion|xyz|link) material/i,
    ],
    soft: [
      // A bare mention of Synchro Summoning happening (this card's
      // own timing restriction, or a passing reference) without any
      // of the hard functional-requirement shapes above.
      /synchro summon(?:ed|ing)?/i,
    ],
  },
  pendulum: {
    label: "Pendulum",
    hard: [
      (t) => hasAll(t, "pendulum monster", "to your hand"),
      (t) => hasAll(t, "pendulum monster", "special summon"),
      /if you control an? pendulum monster/i,
      /while you control an? pendulum monster/i,
      /increase[^.]{0,40}pendulum scale/i,
      /(?:place|set)[^.]{0,40}in (?:your |)pendulum zone/i,
      /cannot (?:be activated|attack) unless you control an? pendulum monster/i,
      /shuffle (?:1|one) pendulum monster you control into the (?:deck|extra deck)/i,
    ],
    soft: [
      /pendulum summon(?:ed|ing)?/i,
    ],
  },
  link: {
    label: "Link",
    hard: [
      /if you control an? link monster/i,
      /while you control an? link monster/i,
      /special summon(?:s)? (?:1|one) link monster/i,
      (t) => hasAll(t, "link monster", "add", "to your hand"),
      /cannot (?:be activated|attack) unless you control an? link monster/i,
      /point(?:s)? (?:this card|it) at a link monster/i,
      /(?:its|this card's) link (?:arrow|marker)/i,
      /link rating/i,
      /extra monster zone[^.]{0,40}link monster/i,
    ],
    soft: [
      /link summon(?:ed|ing)?/i,
    ],
  },
};

// A quoted reference to a SPECIFIC named card that happens to itself
// be Synchro/Pendulum/Link is a "named" dependency already caught by
// the valuation engine's dependency scoring (lib/valuation-engine.mjs
// classifyReference/parseExtraDeckMaterials) and by ordinary rarity
// review - it is not this script's job to re-derive that; this
// script is only about GENERIC mechanic-shaped requirements
// (any Synchro/Pendulum/Link monster, not one specific named card).

function testPattern(pattern, text) {
  return typeof pattern === "function" ? pattern(text) : pattern.test(text);
}

function classifyCardText(description) {
  const text = description ?? "";
  const findings = [];

  for (const cfg of Object.values(MECHANIC_PATTERNS)) {
    let matched = null;
    let bucket = null;

    for (const re of cfg.hard) {
      if (testPattern(re, text)) {
        matched = re;
        bucket = "hard_dependency";
        break;
      }
    }

    if (!matched) {
      for (const re of cfg.soft) {
        if (testPattern(re, text)) {
          matched = re;
          bucket = "soft_mention";
          break;
        }
      }
    }

    if (!matched) {
      // Fallback: the bare mechanic keyword appears somewhere in the
      // text but none of the curated hard/soft patterns matched -
      // ambiguous, never silently resolved.
      const bare = new RegExp(cfg.label, "i");
      if (bare.test(text)) {
        bucket = "ambiguous";
      }
    }

    if (bucket) {
      findings.push({ mechanic: cfg.label, bucket, snippet: extractSnippet(text, cfg.label) });
    }
  }

  return findings;
}

function extractSnippet(text, label) {
  const idx = text.toLowerCase().indexOf(label.toLowerCase());
  if (idx === -1) return "";
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + label.length + 60);
  return `...${text.slice(start, end).trim()}...`;
}

// ---------------------------------------------------------
// Offline self-test - real, independently-verified card texts
// (paraphrased-but-accurate oracle text; exact wording of a couple
// of clauses may differ from the printed card by a word or two, but
// the functional requirement described is accurate to the real
// card). This is what proves the classifier logic actually works
// before it's ever pointed at the live catalog.
// ---------------------------------------------------------

const SELF_TEST_CASES = [
  {
    name: "Iron Call",
    card_type: "Spell Card",
    description:
      "Target 1 Synchro Monster in your GY; Special Summon it, but it cannot attack this turn, also you take no battle damage this turn.",
    expect: { synchro: "hard_dependency" },
  },
  {
    name: "Pendulum Call",
    card_type: "Spell Card",
    description:
      "Add from your Deck to your hand, up to 2 Pendulum Monsters with the same Attribute, but different names.",
    expect: { pendulum: "hard_dependency" },
  },
  {
    name: "Mirror Force",
    card_type: "Trap Card",
    description:
      "When an opponent's monster declares an attack: Destroy all your opponent's Attack Position monsters.",
    expect: {},
  },
  {
    name: "Stardust Dragon",
    card_type: "Synchro Monster",
    description:
      "1 Tuner + 1 or more non-Tuner monsters. When a card or effect is activated that would destroy a card(s) on the field (Quick Effect): You can Tribute this card; negate the activation, and if you do, destroy it.",
    expect: {},
    note: "Itself a Synchro Monster - already excluded by frame_type, so this script's job is only to NOT falsely flag its own body text (it does mention no other mechanic here); included as a negative control for card_type-based exclusion, not for this script's own logic.",
  },
  {
    name: "Called by the Grave",
    card_type: "Spell Card",
    description:
      "During the turn this card is activated, if a monster(s) was banished, or if a monster(s) on the field was destroyed and sent to the GY (either by battle or as a result of a card effect this turn): You can activate this card in your hand, and if you do, target 1 monster in either GY; for the rest of this turn, its effects are negated, also you cannot Special Summon monsters for the rest of this turn, except monsters of the same type (Zombie, Spellcaster, etc.) as that banished/destroyed monster.",
    expect: {},
  },
  {
    name: "Synthetic: soft Link mention",
    card_type: "Trap Card",
    description:
      "You can only activate this card during the turn a Link Monster was Link Summoned. Draw 1 card.",
    expect: { link: "soft_mention" },
    note: "Synthetic (illustrative, not a real printed card) - included to exercise the soft_mention bucket for Link specifically, since no real, well-known Trap with this exact narrow phrasing was confidently recalled; flagged here rather than silently invented as a 'real' example.",
  },
];

function runSelfTest() {
  let passed = 0;
  let failed = 0;

  for (const testCase of SELF_TEST_CASES) {
    const findings = classifyCardText(testCase.description);
    const gotByMechanic = Object.fromEntries(findings.map((f) => [f.mechanic.toLowerCase(), f.bucket]));
    const expectedKeys = Object.keys(testCase.expect);

    let ok = true;
    for (const mech of expectedKeys) {
      if (gotByMechanic[mech] !== testCase.expect[mech]) ok = false;
    }
    // Also fail if we found a mechanic hit that wasn't expected at all
    for (const mech of Object.keys(gotByMechanic)) {
      if (!(mech in testCase.expect)) ok = false;
    }

    if (ok) {
      passed++;
      console.log(`  PASS  ${testCase.name}`);
    } else {
      failed++;
      console.log(`  FAIL  ${testCase.name}`);
      console.log(`        expected: ${JSON.stringify(testCase.expect)}`);
      console.log(`        got:      ${JSON.stringify(gotByMechanic)}`);
    }
  }

  console.log(`\nSelf-test: ${passed} passed, ${failed} failed (${SELF_TEST_CASES.length} total).`);
  if (failed > 0) process.exitCode = 1;
}

// ---------------------------------------------------------
// Live-catalog audit (requires Supabase env vars + network).
// ---------------------------------------------------------

async function runLiveAudit() {
  const { createClient } = await import("@supabase/supabase-js");

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SECRET_KEY =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const writeOverridesIdx = process.argv.indexOf("--write-overrides");
  const targetFormatCode = writeOverridesIdx >= 0 ? process.argv[writeOverridesIdx + 1] : null;

  const rows = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("card_catalog")
      .select("id,name,card_type,frame_type,description")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Fetching card_catalog failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const isAlreadyExcludedByType = (frameType, cardType) => {
    const t = `${frameType ?? ""} ${cardType ?? ""}`.toLowerCase();
    return t.includes("synchro") || t.includes("pendulum") || t.includes("link");
  };

  const results = { hard_dependency: [], soft_mention: [], ambiguous: [] };

  for (const card of rows) {
    if (isAlreadyExcludedByType(card.frame_type, card.card_type)) continue;
    const findings = classifyCardText(card.description);
    for (const f of findings) {
      results[f.bucket].push({ id: card.id, name: card.name, card_type: card.card_type, mechanic: f.mechanic, snippet: f.snippet });
    }
  }

  console.log(`Scanned ${rows.length} cards not already excluded by frame_type.`);
  console.log(`  hard_dependency: ${results.hard_dependency.length}`);
  console.log(`  soft_mention:    ${results.soft_mention.length}`);
  console.log(`  ambiguous:       ${results.ambiguous.length}`);

  const fs = await import("node:fs");
  const path = await import("node:path");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join("reports", "mechanic-text-dependency", timestamp);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\nFull results written to ${dir}/results.json`);

  if (targetFormatCode) {
    const { data: fmt, error: fmtErr } = await supabase
      .from("duelist_circle_formats")
      .select("id,code")
      .eq("code", targetFormatCode)
      .maybeSingle();
    if (fmtErr) throw fmtErr;
    if (!fmt) {
      console.error(`No duelist_circle_formats row with code '${targetFormatCode}' - not writing overrides.`);
      return;
    }

    let inserted = 0;
    let skipped = 0;
    for (const card of results.hard_dependency) {
      const { data: existing } = await supabase
        .from("format_card_overrides")
        .select("id")
        .eq("format_id", fmt.id)
        .eq("card_catalog_id", card.id)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
      const { error: insErr } = await supabase.from("format_card_overrides").insert({
        format_id: fmt.id,
        card_catalog_id: card.id,
        override_type: "exclude",
        reason: `Automated mechanic-text-dependency audit: text requires a ${card.mechanic} Monster to function ("${card.snippet}"). Human-reviewable - see reports/mechanic-text-dependency/.`,
      });
      if (insErr) throw insErr;
      inserted++;
    }
    console.log(`\nWrote ${inserted} new exclude overrides for format '${targetFormatCode}' (${skipped} already had an override and were left untouched).`);
  }
}

// ---------------------------------------------------------
// Entry point
// ---------------------------------------------------------

const forceSelfTest = process.argv.includes("--self-test");
const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY));

if (forceSelfTest || !hasEnv) {
  if (!hasEnv && !forceSelfTest) {
    console.log("No Supabase env vars found - running the offline self-test instead of a live audit.\n");
  }
  runSelfTest();
} else {
  await runLiveAudit();
}
