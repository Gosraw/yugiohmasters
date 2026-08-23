# CLAUDE.md — Duelist Circle

This file is for any AI coding tool (Claude Code, Codex, Cowork, etc.)
working on this repo. Read it before making changes.

## What this is

"Duelist Circle" is a private web app for a small friends group's
Yu-Gi-Oh! league. It is **not** a public product — it has a handful of
real users who are friends of the owner. Production:
`https://yugiohmasters.vercel.app`. GitHub: `Gosraw/yugiohmasters`.

The owner (Gosraw) is explicitly **not a developer**. Explain things in
plain, simple language ("Jip en Janneke" level) when talking to them —
no jargon without explanation. They mostly communicate in Dutch mixed
with English; the codebase itself is English.

## Tech stack

- Next.js 16 (App Router, Server Components, Server Actions, route
  groups: `(app)` = the logged-in app shell, `(auth)` = login/signup).
- TypeScript, React 19, Tailwind CSS v4.
- Supabase: Postgres + RLS + SECURITY DEFINER RPC functions + triggers.
  Auth is username-based (usernames map server-side to
  `<normalized>@duelist.local` — the UI never shows email).
- Deployed on Vercel, auto-deploys on every push to `main`.

## Code style — match it exactly

This codebase has one very consistent, unusual formatting convention:
**almost every import, JSX prop, and function argument is broken onto
its own line**, even when it would easily fit on one line. For example:

```tsx
import {
  Swords,
} from "lucide-react";

<SubmitButton
  pendingLabel="Accepting..."
  className="primary-button"
>
```

Match this style in any file you touch. A few files (mostly
`cards/page.tsx` and its siblings) use denser single-line imports —
match whatever style the specific file you're editing already uses,
don't mix styles within one file.

Other conventions already established:
- `.panel`, `.primary-button`, `.gold-text`, `.field` utility classes
  in `src/app/globals.css` — reuse them, don't invent new ad-hoc
  styles for things that already have a class.
- Dark/gold "Duelist Circle" premium arena aesthetic: black/near-black
  backgrounds, amber/gold accents, glassy panels, blurred glow orbs.
- Every server action that redirects after success appends
  `?success=<message>` (and sometimes `?error=`) to the redirect URL.
  `<ActionFeedbackBanner />` (mounted once in `(app)/layout.tsx`) reads
  that automatically and shows a dismissible banner — pages don't need
  to render their own success/error UI.
- Any button that submits a form should use `<SubmitButton>`
  (`src/components/submit-button.tsx`) instead of a plain
  `<button type="submit">`, so it shows a spinner and disables itself
  while the server action runs. For destructive or one-shot actions
  (decline/cancel, archive, start a draft/competition, distribute
  rewards) use `<ConfirmSubmitButton>` instead, which adds a
  `window.confirm()` gate first.
- `EmptyState`, `PageHeader`, `StatCard`, `StatusBadge` in
  `src/components/` are shared building blocks for "nothing here yet"
  screens, page headers, stat tiles and status pills — but most pages
  already have their own well-developed bespoke hero header, so don't
  force these onto a page that already looks good; use them for pages
  that are missing this treatment.

## Business rules — do not break these

- **Card ownership** (`card_instances` table) is a full scarcity model
  with individual tracked physical copies, not simple "you own N of
  card X" counters. Trades, wagers and drafts all depend on this.
  Never replace it with something simpler.
- **Duel Points (DP)** may only be granted server-side through
  `_credit_duel_points`. Never let a client mutate a DP balance
  directly.
- **League matches never have wagers.** Only practice matches can have
  a DP or card wager.
- **Initial draft is one-time per player.** A player who has already
  completed the initial draft must never be able to redo it. New
  players joining later must still get their own one-time draft.
- **The Samo rival easter egg** (`src/components/samo-rival-intro.tsx`)
  should stay unless the owner explicitly asks to remove it. It can be
  visually improved.
- **Never hardcode** the example league id
  (`1c388846-75a8-41fe-8b93-d081b1ec0d02`) into application logic — it
  may be real production data, not a placeholder.
- **Never commit secrets.** No service-role key, no
  `SUPABASE_SECRET_KEY`, nowhere in client-side code, ever.
- `purchase_shop_pack` and the shop pack RPC chain (`shop_rarity_rank`,
  `shop_card_copy_limit`, `roll_shop_pack_rarity`,
  `pick_shop_pack_card`) were reverse-engineered from production and
  captured in `supabase/migrations/202608210016_purchase_shop_pack.sql`
  — treat that migration as the source of truth for what's actually
  live. If you ever need to change these functions, keep the
  `target_voucher_id uuid default null` parameter and be very careful:
  this flow was broken once already (missing DB functions caused
  silent purchase failures) and just got fixed.
- Don't drop/replace a DB function or table casually. When changing an
  RPC function's signature, check every call site first.
- Don't invent new deck-building rules without checking the existing
  `add_card_to_deck` / `set_deck_status` RPCs and their constraints
  first (40–60 Main, max 15 Extra, Fusion + XYZ only in Extra).

## Working environment notes (for AI tools running in a cloud sandbox)

If you're working from a cloud sandbox with a **device bridge** into
the owner's Mac (Cowork-style), some things to know:

- The cloud sandbox's own `npm` typically has **no network access** to
  `registry.npmjs.org` in this setup — `npm install` there will fail.
  Use the Mac's own `node_modules` via the device bridge instead.
- The device bridge is architecturally a Linux ARM64 VM proxying into
  a macOS folder. This means `npm run build` and `npm test`
  (vitest, via `@rollup/rollup-linux-arm64-gnu`) usually **fail from
  the bridge** due to native binary platform mismatches, even though
  the Mac itself can run them fine. Only `npm run lint` and
  `npm run typecheck` reliably work from the bridge. Ask the owner to
  run `npm test` / `npm run build` themselves locally when you need
  those verified.
- The device bridge **cannot delete files** (`rm`/`unlink` fails with
  "Operation not permitted"). Git leaves lock files behind after
  almost every operation (`.git/index.lock`, `.git/HEAD.lock`,
  `.git/objects/maintenance.lock`, stray `tmp_obj_*` files). Before
  any git command, check for and `mv` these aside (e.g. add a
  `.stale-<timestamp>` suffix) rather than trying to delete them —
  git recreates what it needs.
- There is no verified `gh`/GitHub push credential in the cloud
  sandbox itself for this private repo. The working pattern is:
  make commits locally on the Mac via the device bridge, then ask the
  owner to run `git push` themselves — **never push automatically**
  unless the owner has explicitly said it's fine for this session.
- Always sync any edited file to the Mac (deliver it, then write it
  into the connected folder) and re-run lint/typecheck there before
  considering a change done — editing only the cloud sandbox's clone
  does not update what the owner will actually commit/push.

## Where things are

- `src/app/(app)/` — the logged-in app: Home dashboard (`page.tsx`),
  `matches/`, `trades/`, `decks/`, `cards/` (catalog + `collection/`),
  `shop/`, `competitions/`, `achievements/`, `league/`, `draft/`,
  `profile/`, `admin/`. Each top-level section has its own
  `page.tsx` list view and usually a `[id]/page.tsx` detail view.
- `src/app/actions/` — all Server Actions (`"use server"`), one file
  per domain (`matches.ts`, `trades.ts`, `decks.ts`, `shop.ts`,
  `draft.ts`, `competitions.ts`, `profile.ts`, `admin.ts`, `auth.ts`).
  These call Supabase RPC functions almost exclusively rather than
  raw table writes, so business rules live in the database.
- `src/components/` — shared UI. Notable ones: `submit-button.tsx` /
  `confirm-submit-button.tsx` (pending/confirm form buttons),
  `action-feedback-banner.tsx` (the global success/error banner),
  `bottom-nav.tsx` (mobile nav — currently 10 items), `page-header.tsx`
  / `empty-state.tsx` / `stat-card.tsx` / `status-badge.tsx` (shared
  building blocks), `pack-opening-reveal.tsx` (Shop pack-opening
  animation — see Known Issues), `samo-rival-intro.tsx` (easter egg).
- `supabase/migrations/` — applied in filename order. The database is
  the real source of truth for business rules (RLS policies, RPC
  functions, triggers) — always check here before assuming client-side
  validation is the whole story.

## Known issues / deliberately not touched

- `pack-opening-reveal.tsx` was rewritten from a CSS 3D-flip technique
  to a simpler opacity/scale cross-fade because the flip was flaky
  across mobile browsers (cards sometimes wouldn't render after
  flipping). This fix has not yet been re-confirmed by the owner in
  production as of the last session — check with them before assuming
  it's fully solved.
- `.pull-face-in` in `globals.css` is dead CSS left over from the old
  3D-flip approach — harmless but unused.
- `tsconfig.tsbuildinfo` is a tracked build-cache file that changes on
  every `typecheck` run — don't worry about it showing as modified in
  `git status`, and don't commit noisy diffs of it unless asked.
- The `cards/page.tsx` and `trades/new/page.tsx` empty states still
  have a little Dutch/English text mixing (e.g. "Er zijn nog geen
  andere spelers in deze league") — left as-is, not in scope unless
  the owner asks for a full i18n pass.
- **NEVER run `npm run build` (or `npm run start`) from the device
  bridge.** It fails with "Failed to load SWC binary for linux/arm64"
  (same root cause as the existing `npm test`/`npm run build` note
  above), but critically it does NOT fail cleanly first — it writes a
  partial `.next` build (BUILD_ID, manifests, a `.next/server/app/...`
  tree missing most routes) into the owner's real project folder
  *before* crashing on the missing SWC binary. That corrupted `.next`
  then sits there and can cause confusing, inconsistent runtime errors
  (routes that were compiled before the crash keep working, routes
  that weren't throw a generic digest-only "Server Components render"
  error - e.g. minified React error #441) the next time the owner runs
  `npm run dev` or `npm start` themselves, for reasons that have
  nothing to do with their actual code. This already happened once
  (2026-08-21) and cost real debugging time chasing a phantom code
  bug. If you need a production build verified, ask the owner to run
  `npm run build` in their own terminal - don't attempt it from the
  bridge. If `.next` is ever suspected of being corrupted, `mv` it
  aside (the bridge can't delete) and tell the owner to run
  `rm -rf .next` themselves, then rebuild clean.
- There is a nested, duplicate `supabase/migrations/supabase/migrations/`
  directory containing at least one load-bearing file
  (`202608190007_draft_rarity_roll.sql`, the original
  `create_next_draft_offer()` with the draft rarity-roll logic). The
  standard Supabase CLI only scans the top-level `supabase/migrations/`
  folder, so this nested copy is almost certainly NOT applied by a real
  deploy — the live behavior comes from whichever top-level migration
  most recently did `create or replace function
  public.create_next_draft_offer` (as of this session, that's
  `202608220020_master_duel_compatibility.sql`). This was flagged in an
  earlier session and is still unresolved — needs the owner to confirm
  against their real project (does `supabase migration list` even see
  the nested file?) before anyone deletes/moves it. A full local
  migration-chain replay test only iterates `supabase/migrations/*.sql`
  and will silently miss this nested folder too — don't assume a clean
  replay proves this anomaly doesn't matter.
- `public.card_instances` has a deliberate, hard `BEFORE DELETE` trigger
  (`prevent_card_instance_delete_trigger`, from
  `202608190004_card_instances.sql`) that unconditionally raises on any
  `DELETE` — "Card instances cannot be deleted. Transfer ownership
  instead," enforcing the full-scarcity ownership model. Any future
  admin tooling that needs to actually remove card_instances rows (like
  `season_reset_apply()` in `202608231520_season_reset.sql`) must
  explicitly `alter table ... disable trigger
  prevent_card_instance_delete_trigger` immediately before the delete
  and `enable trigger` immediately after, inside the same transaction —
  never drop or weaken the trigger itself.
- `season_reset_apply()` deletes every `league_members` row, but keeps
  `leagues` rows as structure. `bootstrap_private_league()` (in
  `202608190001_phase1_foundation.sql`) only grants `role = 'admin'`
  when it creates a brand-new league — re-joining an EXISTING (kept)
  league always grants `role = 'player'`. That means after a season
  reset, nobody has admin until someone calls the new
  `claim_league_admin_if_none(<league_id>)` RPC (added in
  `202608231520_season_reset.sql` specifically to solve this — it only
  ever does anything when that league currently has zero admins, so
  it's safe to leave broadly executable). `scripts/season-reset.mjs`
  prints a reminder about this at the end of every real reset.
- `season_reset_preview()` / `season_reset_apply()` /
  `claim_league_admin_if_none()` are admin-gated via `auth.uid()` +
  `league_members.role = 'admin'`, same as every other admin RPC in
  this schema — which means a **service-role key cannot call them**
  (a service-role JWT has no `sub` claim, so `auth.uid()` resolves to
  null and they reject with "Not authenticated"). `scripts/season-reset.mjs`
  therefore signs in as the real operator (email+password) for those
  three calls, and only switches to the service-role client for the
  final `auth.admin.deleteUser()` loop (Supabase's Admin API, a
  completely different, unavoidably-service-role-only permission
  model). Keep this split if this script is ever modified.
- `npx vitest` (and therefore `npm test`) currently fails on the device
  bridge with `Cannot find module @rollup/rollup-linux-arm64-gnu` even
  though the device is `darwin/arm64` — the same npm optional-dependency
  bug documented above for `npm run build`'s missing SWC binary, just
  hitting Rollup's native binary instead. Don't attempt `npm test` from
  the device bridge; verify pure-logic changes some other way (e.g. a
  throwaway `node --experimental-strip-types` harness) and ask the owner
  to run `npm test` themselves when a real Vitest run is needed.

## Talking to the owner

- Plain language, no unexplained jargon. Assume zero developer
  background.
- Confirm working end-to-end in production before considering a fix
  "done" — the owner tests by actually using the app, not by reading
  code.
- Don't push to GitHub without being asked for that specific round of
  changes — commit locally and let them decide when to push, unless
  they've explicitly said otherwise for the current task.
