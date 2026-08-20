begin;

create table if not exists public.card_catalog (
  id uuid primary key default gen_random_uuid(),

  external_card_id bigint not null unique,
  name text not null,

  card_type text not null,
  frame_type text,

  monster_type text,
  race text,
  attribute text,

  level integer,
  rank integer,
  link_rating integer,
  link_markers text[],

  atk integer,
  def integer,

  description text,
  archetype text,

  image_url text,
  image_url_small text,
  image_url_cropped text,

  set_information jsonb not null default '[]'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,

  source text not null default 'ygoprodeck',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint card_catalog_external_id_positive
    check (external_card_id > 0)
);

create index if not exists card_catalog_name_idx
  on public.card_catalog (name);

create index if not exists card_catalog_card_type_idx
  on public.card_catalog (card_type);

create index if not exists card_catalog_attribute_idx
  on public.card_catalog (attribute);

create index if not exists card_catalog_race_idx
  on public.card_catalog (race);

create index if not exists card_catalog_archetype_idx
  on public.card_catalog (archetype);

alter table public.card_catalog enable row level security;

drop policy if exists card_catalog_read_authenticated
  on public.card_catalog;

create policy card_catalog_read_authenticated
  on public.card_catalog
  for select
  to authenticated
  using (true);

grant select on public.card_catalog to authenticated;

-- Spelers mogen de centrale kaartdatabase niet zelf aanpassen.
revoke insert, update, delete
  on public.card_catalog
  from authenticated;

commit;