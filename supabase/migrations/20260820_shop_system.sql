-- =========================================================
-- DUELIST CIRCLE SHOP SYSTEM
-- =========================================================

begin;

-- =========================================================
-- ENUM-LIKE CHECK HELPERS VIA TEXT + CHECKS
-- =========================================================

-- We intentionally use text columns with check constraints
-- instead of PostgreSQL enums so future migrations remain easier.

-- =========================================================
-- PACK TYPES
-- =========================================================

create table if not exists public.shop_pack_types (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,

  name text not null,

  description text,

  price_dp integer not null check (price_dp >= 0),

  cards_per_pack integer not null check (cards_per_pack > 0),

  active boolean not null default true,

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint shop_pack_types_code_check
    check (
      code in (
        'normal',
        'premium',
        'deluxe'
      )
    )
);

-- =========================================================
-- SHOP ROTATIONS
--
-- One rotation = one 72-hour shop period.
-- =========================================================

create table if not exists public.shop_rotations (
  id uuid primary key default gen_random_uuid(),

  starts_at timestamptz not null,

  ends_at timestamptz not null,

  status text not null default 'scheduled',

  special_pack_name text,

  special_pack_description text,

  special_pack_price_dp integer check (
    special_pack_price_dp is null
    or special_pack_price_dp >= 0
  ),

  special_pack_cards_per_pack integer check (
    special_pack_cards_per_pack is null
    or special_pack_cards_per_pack > 0
  ),

  special_pack_theme_type text,

  special_pack_theme_value text,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint shop_rotations_dates_check
    check (ends_at > starts_at),

  constraint shop_rotations_status_check
    check (
      status in (
        'scheduled',
        'active',
        'completed'
      )
    ),

  constraint shop_rotations_theme_type_check
    check (
      special_pack_theme_type is null
      or special_pack_theme_type in (
        'archetype',
        'attribute',
        'monster_type',
        'card_type',
        'frame_type',
        'custom'
      )
    )
);

create index if not exists shop_rotations_time_idx
  on public.shop_rotations (
    starts_at,
    ends_at
  );

-- =========================================================
-- ROTATING SINGLE-CARD SHOP
--
-- Exactly six slots are intended per rotation.
-- Each slot can be sold only once globally.
-- =========================================================

create table if not exists public.shop_rotation_cards (
  id uuid primary key default gen_random_uuid(),

  rotation_id uuid not null
    references public.shop_rotations(id)
    on delete cascade,

  slot_number integer not null,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete restrict,

  price_dp integer not null
    check (price_dp > 0),

  slot_tier text not null default 'basic',

  sold_to_profile_id uuid
    references public.profiles(id)
    on delete set null,

  sold_at timestamptz,

  created_at timestamptz not null default now(),

  constraint shop_rotation_cards_slot_check
    check (
      slot_number between 1 and 6
    ),

  constraint shop_rotation_cards_tier_check
    check (
      slot_tier in (
        'basic',
        'mid',
        'strong',
        'premium',
        'wildcard'
      )
    ),

  constraint shop_rotation_cards_sold_state_check
    check (
      (
        sold_to_profile_id is null
        and sold_at is null
      )
      or
      (
        sold_to_profile_id is not null
        and sold_at is not null
      )
    ),

  unique (
    rotation_id,
    slot_number
  )
);

create index if not exists shop_rotation_cards_rotation_idx
  on public.shop_rotation_cards(rotation_id);

create index if not exists shop_rotation_cards_available_idx
  on public.shop_rotation_cards(
    rotation_id,
    sold_at
  );

-- =========================================================
-- REWARD VOUCHERS
--
-- Used for competition / tournament rewards.
-- =========================================================

create table if not exists public.reward_vouchers (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  voucher_type text not null,

  quantity integer not null default 1
    check (quantity > 0),

  source_type text,

  source_id uuid,

  note text,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint reward_vouchers_type_check
    check (
      voucher_type in (
        'normal_pack',
        'premium_pack',
        'deluxe_pack',
        'special_pack'
      )
    )
);

create index if not exists reward_vouchers_profile_idx
  on public.reward_vouchers(profile_id);

-- =========================================================
-- SHOP PURCHASES
--
-- One row per purchase transaction.
-- =========================================================

create table if not exists public.shop_purchases (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null
    references public.profiles(id)
    on delete restrict,

  purchase_type text not null,

  rotation_id uuid
    references public.shop_rotations(id)
    on delete set null,

  rotation_card_id uuid
    references public.shop_rotation_cards(id)
    on delete set null,

  pack_type_id uuid
    references public.shop_pack_types(id)
    on delete set null,

  used_voucher_id uuid
    references public.reward_vouchers(id)
    on delete set null,

  dp_spent integer not null default 0
    check (dp_spent >= 0),

  created_at timestamptz not null default now(),

  constraint shop_purchases_type_check
    check (
      purchase_type in (
        'single_card',
        'pack',
        'special_pack'
      )
    )
);

create index if not exists shop_purchases_profile_idx
  on public.shop_purchases(
    profile_id,
    created_at desc
  );

-- =========================================================
-- PACK OPENINGS
-- =========================================================

create table if not exists public.shop_pack_openings (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null
    references public.profiles(id)
    on delete restrict,

  purchase_id uuid
    references public.shop_purchases(id)
    on delete set null,

  rotation_id uuid
    references public.shop_rotations(id)
    on delete set null,

  pack_code text not null,

  opened_at timestamptz not null default now(),

  constraint shop_pack_openings_pack_code_check
    check (
      pack_code in (
        'normal',
        'premium',
        'deluxe',
        'special'
      )
    )
);

create index if not exists shop_pack_openings_profile_idx
  on public.shop_pack_openings(
    profile_id,
    opened_at desc
  );

-- =========================================================
-- PACK PULLS
--
-- Each pull creates an actual physical card_instance.
-- =========================================================

create table if not exists public.shop_pack_pulls (
  id uuid primary key default gen_random_uuid(),

  opening_id uuid not null
    references public.shop_pack_openings(id)
    on delete cascade,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete restrict,

  card_instance_id uuid not null
    references public.card_instances(id)
    on delete restrict,

  pull_position integer not null
    check (pull_position > 0),

  pulled_rarity text,

  created_at timestamptz not null default now(),

  unique (
    opening_id,
    pull_position
  )
);

-- =========================================================
-- PACK PITY STATE
--
-- Tracks dry streaks per player / pack family.
-- =========================================================

create table if not exists public.shop_pack_pity (
  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  pack_code text not null,

  packs_since_ultra_or_better integer not null default 0
    check (packs_since_ultra_or_better >= 0),

  updated_at timestamptz not null default now(),

  primary key (
    profile_id,
    pack_code
  ),

  constraint shop_pack_pity_pack_code_check
    check (
      pack_code in (
        'normal',
        'premium',
        'deluxe',
        'special'
      )
    )
);

-- =========================================================
-- DEFAULT PACK TYPES
-- =========================================================

insert into public.shop_pack_types (
  code,
  name,
  description,
  price_dp,
  cards_per_pack,
  sort_order
)
values
  (
    'normal',
    'Normal Pack',
    'A basic pack with mostly Normal and Rare cards, plus a small chance at stronger pulls.',
    100,
    3,
    10
  ),
  (
    'premium',
    'Premium Pack',
    'A stronger pack with improved rarity odds and more cards per opening.',
    250,
    5,
    20
  ),
  (
    'deluxe',
    'Deluxe Pack',
    'A high-end pack with the best standard rarity odds.',
    500,
    7,
    30
  )
on conflict (code)
do update set
  name = excluded.name,
  description = excluded.description,
  price_dp = excluded.price_dp,
  cards_per_pack = excluded.cards_per_pack,
  sort_order = excluded.sort_order,
  updated_at = now();

-- =========================================================
-- HELPER: CURRENT ACTIVE ROTATION
-- =========================================================

create or replace function public.get_active_shop_rotation()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.shop_rotations
  where
    starts_at <= now()
    and ends_at > now()
    and status = 'active'
  order by starts_at desc
  limit 1;
$$;

-- =========================================================
-- HELPER: BASE SINGLE-CARD PRICE
--
-- Uses rarity + rarity_score.
-- Intended as a starting economy formula.
-- =========================================================

create or replace function public.calculate_shop_card_price(
  target_card_catalog_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_rarity text;
  target_score numeric;

  base_price integer;
  score_price integer;
begin
  select
    game_rarity,
    coalesce(rarity_score, 0)
  into
    target_rarity,
    target_score
  from public.card_catalog
  where id = target_card_catalog_id;

  if not found then
    raise exception 'Card not found.';
  end if;

  base_price :=
    case target_rarity
      when 'Normal' then 40
      when 'Rare' then 80
      when 'Super Rare' then 140
      when 'Ultra Rare' then 250
      when 'Secret Rare' then 450
      when 'Legendary' then 800
      else 60
    end;

  score_price :=
    round(
      greatest(
        0,
        target_score
      ) * 3
    );

  return greatest(
    25,
    base_price + score_price
  );
end;
$$;

-- =========================================================
-- PURCHASE UNIQUE ROTATION CARD
--
-- FIRST COME, FIRST SERVED.
--
-- Critical behavior:
-- - locks the shop slot
-- - verifies unsold
-- - verifies active rotation
-- - verifies DP balance
-- - deducts DP
-- - creates real card_instance
-- - marks slot sold
--
-- All inside one transaction.
-- =========================================================

create or replace function public.purchase_shop_rotation_card(
  target_rotation_card_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;

  slot_row public.shop_rotation_cards%rowtype;

  rotation_row public.shop_rotations%rowtype;

  current_dp integer;

  next_copy_number integer;

  new_instance_id uuid;

  new_purchase_id uuid;
begin
  current_user_id :=
    auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into slot_row
  from public.shop_rotation_cards
  where id = target_rotation_card_id
  for update;

  if not found then
    raise exception 'Shop card not found.';
  end if;

  if slot_row.sold_at is not null then
    raise exception 'This card has already been sold.';
  end if;

  select *
  into rotation_row
  from public.shop_rotations
  where id = slot_row.rotation_id;

  if not found then
    raise exception 'Shop rotation not found.';
  end if;

  if
    rotation_row.status <> 'active'
    or rotation_row.starts_at > now()
    or rotation_row.ends_at <= now()
  then
    raise exception 'This shop rotation is not active.';
  end if;

  select duel_points
  into current_dp
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  if current_dp < slot_row.price_dp then
    raise exception 'Not enough Duel Points.';
  end if;

  update public.profiles
  set
    duel_points =
      duel_points -
      slot_row.price_dp,

    updated_at =
      now()
  where id =
    current_user_id;

  select
    coalesce(
      max(copy_number),
      0
    ) + 1
  into next_copy_number
  from public.card_instances
  where card_catalog_id =
    slot_row.card_catalog_id;

  insert into public.card_instances (
    card_catalog_id,
    current_owner_id,
    copy_number,
    acquired_at,
    locked
  )
  values (
    slot_row.card_catalog_id,
    current_user_id,
    next_copy_number,
    now(),
    false
  )
  returning id
  into new_instance_id;

  update public.shop_rotation_cards
  set
    sold_to_profile_id =
      current_user_id,

    sold_at =
      now()
  where id =
    target_rotation_card_id
    and sold_at is null;

  if not found then
    raise exception 'This card was sold before your purchase completed.';
  end if;

  insert into public.shop_purchases (
    profile_id,
    purchase_type,
    rotation_id,
    rotation_card_id,
    dp_spent
  )
  values (
    current_user_id,
    'single_card',
    slot_row.rotation_id,
    slot_row.id,
    slot_row.price_dp
  )
  returning id
  into new_purchase_id;

  return new_instance_id;
end;
$$;

-- =========================================================
-- REDEEM VOUCHER QUANTITY
--
-- Internal helper for future pack-purchase RPCs.
-- =========================================================

create or replace function public.consume_reward_voucher(
  target_voucher_id uuid,
  target_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  voucher_row public.reward_vouchers%rowtype;
begin
  select *
  into voucher_row
  from public.reward_vouchers
  where
    id = target_voucher_id
    and profile_id = target_profile_id
  for update;

  if not found then
    raise exception 'Voucher not found.';
  end if;

  if voucher_row.quantity <= 0 then
    raise exception 'Voucher has already been used.';
  end if;

  if voucher_row.quantity = 1 then
    delete from public.reward_vouchers
    where id = voucher_row.id;
  else
    update public.reward_vouchers
    set
      quantity =
        quantity - 1,

      updated_at =
        now()
    where id =
      voucher_row.id;
  end if;
end;
$$;

-- =========================================================
-- RLS
-- =========================================================

alter table public.shop_pack_types
  enable row level security;

alter table public.shop_rotations
  enable row level security;

alter table public.shop_rotation_cards
  enable row level security;

alter table public.reward_vouchers
  enable row level security;

alter table public.shop_purchases
  enable row level security;

alter table public.shop_pack_openings
  enable row level security;

alter table public.shop_pack_pulls
  enable row level security;

alter table public.shop_pack_pity
  enable row level security;

-- =========================================================
-- READ POLICIES
-- =========================================================

drop policy if exists
  "Authenticated users can read pack types"
on public.shop_pack_types;

create policy
  "Authenticated users can read pack types"
on public.shop_pack_types
for select
to authenticated
using (true);

drop policy if exists
  "Authenticated users can read shop rotations"
on public.shop_rotations;

create policy
  "Authenticated users can read shop rotations"
on public.shop_rotations
for select
to authenticated
using (true);

drop policy if exists
  "Authenticated users can read rotation cards"
on public.shop_rotation_cards;

create policy
  "Authenticated users can read rotation cards"
on public.shop_rotation_cards
for select
to authenticated
using (true);

drop policy if exists
  "Users can read own vouchers"
on public.reward_vouchers;

create policy
  "Users can read own vouchers"
on public.reward_vouchers
for select
to authenticated
using (
  profile_id =
  auth.uid()
);

drop policy if exists
  "Users can read own shop purchases"
on public.shop_purchases;

create policy
  "Users can read own shop purchases"
on public.shop_purchases
for select
to authenticated
using (
  profile_id =
  auth.uid()
);

drop policy if exists
  "Users can read own pack openings"
on public.shop_pack_openings;

create policy
  "Users can read own pack openings"
on public.shop_pack_openings
for select
to authenticated
using (
  profile_id =
  auth.uid()
);

drop policy if exists
  "Users can read own pack pulls"
on public.shop_pack_pulls;

create policy
  "Users can read own pack pulls"
on public.shop_pack_pulls
for select
to authenticated
using (
  exists (
    select 1
    from public.shop_pack_openings opening
    where
      opening.id =
        shop_pack_pulls.opening_id
      and opening.profile_id =
        auth.uid()
  )
);

drop policy if exists
  "Users can read own pity state"
on public.shop_pack_pity;

create policy
  "Users can read own pity state"
on public.shop_pack_pity
for select
to authenticated
using (
  profile_id =
  auth.uid()
);

-- =========================================================
-- RPC PERMISSIONS
-- =========================================================

grant execute
on function public.get_active_shop_rotation()
to authenticated;

grant execute
on function public.calculate_shop_card_price(uuid)
to authenticated;

grant execute
on function public.purchase_shop_rotation_card(uuid)
to authenticated;

-- consume_reward_voucher is intentionally NOT granted
-- directly to authenticated users.
-- It will be called internally by pack-purchase logic.

commit;