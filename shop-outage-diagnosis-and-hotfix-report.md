# Live Shop outage — diagnosis and hotfix report

**No live database was touched. No migration was deployed. No Boss Path code or data was touched.** This is a code-only diagnosis and a code-only hotfix, committed separately from all Boss Path work.

## What's broken, and why

Your hypothesis is correct, and the code confirms it precisely.

GitHub/Vercel deploy the Next.js app on every push to `main`. Supabase migrations are a separate, manual step (`docs/GO_LIVE_TONIGHT.md` says this explicitly). `origin/main` — what Vercel actually builds and serves — is already at commit `1a4b395` ("Season 1 Boss Route + Special Pack audit/repair pass, round 2"), which contains today's Special Pack curated-pool rebuild: application code that unconditionally queries the `shop_special_pack_definitions` table and the `pack_definition_id` column on `shop_special_pack_rotations`. Both of those only exist after two specific migrations run — `202609020940_special_pack_curated_pools_schema.sql` and `202609021020_special_pack_15_definitions_and_pools.sql` — and both are from today's round of work, i.e. exactly the kind of migration that's easy to leave un-applied while the code that depends on it has already shipped.

I read `src/app/(app)/shop/page.tsx` directly. It fetches those two objects, and until this fix, it did this:

```
if (specialRotationError) { throw new Error(specialRotationError.message); }
...
if (packDefinitionError) { throw new Error(packDefinitionError.message); }
```

If the live database predates those two migrations, both queries fail with a Postgres "column/relation does not exist" error, and the page throws — before it ever reaches the code that renders the Normal, Premium, and Deluxe pack tiles, because all four pack types render on this one server component. That's exactly why your report says Normal/Premium/Deluxe are broken too, not just Special Packs: one missing column takes the whole page down with it.

I don't have live database or Vercel log access (no network path to either from this sandbox, same as every prior round), so I can't show you the literal production stack trace. But the code shape, the exact tables/columns involved, and the timing (these two migrations were only written earlier today, in this same audit) line up with your hypothesis exactly. I'm confident in this diagnosis; I'm not claiming to have watched it fail live.

## The hotfix

`src/app/(app)/shop/page.tsx` now has a narrow classifier, `isMissingCuratedPackSchemaObjectError`, that recognizes only this specific class of error (Postgres `42703`/`42P01`, PostgREST's `PGRST204`/`PGRST205` stale-schema-cache codes, or a message naming the missing column/table). When it fires:

- The Special Pack rotation query retries with the pre-curated-pool column list (no `pack_definition_id`) and marks every row as "historical" (`pack_definition_id: null`) — which the page's own rendering code already knows how to handle: it falls back to the old `theme_value`-based description instead of the curated one.
- The pack-definitions query is treated as empty instead of throwing.

Any other error still throws exactly as it did before — this isn't a blanket try/catch, it's a narrow compatibility shim. And it's self-retiring: once you actually run the two migrations, the columns exist, the original queries succeed, this code path never fires again, and nothing needs to be reverted.

One thing this hotfix does **not** do: if the live `purchase_shop_pack`/`pick_shop_pack_card` database functions are also still on their pre-curated-pool version, buying a *Special* Pack will keep using the old dynamic pack logic rather than today's curated one — that's a DB-side function version question, not something an app-only fix can safely change, and it doesn't crash anything (the purchase action already redirects with an error message on any RPC failure rather than throwing). Normal/Premium/Deluxe purchases don't touch any curated-pool table at all, so they're unaffected by that question either way.

## Testing

- `npx tsc --noEmit` — clean, whole repo.
- `npx eslint .` — clean, whole repo.
- `next build` — fails in this sandbox with a missing arm64 SWC binary; confirmed via `git stash` that this fails identically on the unmodified code too, so it's a pre-existing sandbox limitation, not something this change caused. Vercel's own build environment doesn't have this limitation.
- New `scripts/shop-schema-fallback.regression.test.mjs` (11 checks): the classifier's logic against representative Postgrest/Postgres error shapes (both what it must catch and what it must NOT catch), plus a static check that the real file still wires the fallback correctly and still throws on genuinely unrecognized errors.
- All 3 of the repo's pre-existing regression suites still pass (22 checks) — nothing else regressed.

## Is it safe to push immediately?

Yes. This is a pure, additive frontend change: no database touched, no migration run, no Boss Path code touched, no change to what a *successful* query does — it only changes what happens on one specific, currently-real error. Pushing it to `main` (and letting Vercel redeploy) should restore Shop page functionality for Normal, Premium, and Deluxe packs immediately, without needing the migrations run first. The curated Special Pack identities themselves will still show their pre-rebuild descriptions until you actually apply `202609020940` and `202609021020` live — that's expected and cosmetic, not broken.

## Changed files

- `src/app/(app)/shop/page.tsx`
- `scripts/shop-schema-fallback.regression.test.mjs` (new)

## Commit

`d9c8bf41f20ede83d089c552123e47a9e6eff1f8` — committed separately from the Boss Path safeguard commit (`0ab953c`), as asked.

---

**Stopping here, as instructed.**
