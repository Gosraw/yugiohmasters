begin;

-- Duelist Circle gameplay rarity.
-- Dit staat volledig los van officiële Yu-Gi-Oh! print rarities.

alter table public.card_catalog
  add column if not exists game_rarity text,
  add column if not exists rarity_score numeric(5,2),
  add column if not exists rarity_confidence numeric(4,3),
  add column if not exists rarity_needs_review boolean not null default true,
  add column if not exists rarity_reason text,
  add column if not exists rarity_manually_overridden boolean not null default false,
  add column if not exists rarity_reviewed_at timestamptz,
  add column if not exists rarity_reviewed_by uuid references public.profiles(id);

alter table public.card_catalog
  drop constraint if exists card_catalog_game_rarity_valid;

alter table public.card_catalog
  add constraint card_catalog_game_rarity_valid
  check (
    game_rarity is null
    or game_rarity in (
      'Normal',
      'Rare',
      'Super Rare',
      'Ultra Rare',
      'Secret Rare',
      'Legendary'
    )
  );

alter table public.card_catalog
  drop constraint if exists card_catalog_rarity_score_valid;

alter table public.card_catalog
  add constraint card_catalog_rarity_score_valid
  check (
    rarity_score is null
    or (rarity_score >= 0 and rarity_score <= 100)
  );

alter table public.card_catalog
  drop constraint if exists card_catalog_rarity_confidence_valid;

alter table public.card_catalog
  add constraint card_catalog_rarity_confidence_valid
  check (
    rarity_confidence is null
    or (
      rarity_confidence >= 0
      and rarity_confidence <= 1
    )
  );

create index if not exists card_catalog_game_rarity_idx
  on public.card_catalog (game_rarity);

create index if not exists card_catalog_rarity_review_idx
  on public.card_catalog (rarity_needs_review)
  where rarity_needs_review = true;

commit;