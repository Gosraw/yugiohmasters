# Duelist Circle — Phase 1

Mobile-first PWA foundation for a private 3-player Yu-Gi-Oh! friends league.

## Implemented in Phase 1

- Next.js 16 App Router + TypeScript + Tailwind CSS v4
- Supabase SSR auth using username/password UX
- PostgreSQL migration with RLS, constraints and audit foundation
- Profiles and Boss Monster onboarding
- League membership + admin role
- Central settings/config system
- Zero-balance wallet foundation
- 36 configurable Boss Monster options
- Development seed for Player One, Player Two and Player Three
- Installable PWA manifest + service worker + offline fallback
- Mobile bottom navigation
- Placeholder Phase 2+ sections explicitly marked Coming Soon
- Vitest unit tests for auth adapter/settings

## Supabase setup

1. Create a Supabase project.
2. Disable **Confirm email** for Email/Password auth for this private username-based flow.
3. Put project URL and publishable key in `.env.local` (copy `.env.example`).
4. Apply `supabase/migrations/202608190001_phase1_foundation.sql`.
5. Apply `supabase/seed.sql` for Boss Monster options.
6. For development only, add a server secret key to `.env.local` and run `npm run seed:dev`.

The UI never asks for e-mail. Usernames map server-side to `<normalized>@duelist.local`.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Validation:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Security notes

- Authorization is enforced by PostgreSQL RLS as well as server-side checks.
- Wallets start at zero and authenticated clients cannot directly mutate balances.
- Admin writes require league-admin membership.
- Settings mutations are audited by a database trigger.
- The Supabase secret/service-role key is only used by the development seed script and must never be exposed through `NEXT_PUBLIC_*`.
- Boss Monster selection does not create card ownership.

## PWA

Run on HTTPS in production, open the browser install prompt/menu, and install **Duelist Circle**. The service worker only supplies a safe offline fallback in Phase 1; league mutations remain online-only.

## Next phase

Phase 2 should add the external card catalog cache/sync, immutable card instances + ownership history, Collection, Deck Builder, ownership validation, deck snapshots, and export-ready deck data structures.
