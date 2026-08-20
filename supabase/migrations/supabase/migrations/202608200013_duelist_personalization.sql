-- ============================================================
-- DUELIST PERSONALIZATION
-- Adds visual identity and Boss Monster personality settings
-- to existing profiles.
--
-- Existing fields such as:
--   custom_title
--   catchphrase
--   avatar_url
-- are intentionally NOT recreated.
-- ============================================================


-- ============================================================
-- 1. PROFILE PERSONALIZATION
-- ============================================================

alter table public.profiles
  add column if not exists accent_theme text
    not null
    default 'gold',

  add column if not exists signature_quote text,

  add column if not exists profile_banner_url text,

  add column if not exists boss_personality text
    not null
    default 'sarcastic';


-- ============================================================
-- 2. VALID ACCENT THEMES
-- ============================================================

alter table public.profiles
  drop constraint if exists profiles_accent_theme_check;

alter table public.profiles
  add constraint profiles_accent_theme_check
  check (
    accent_theme in (
      'gold',
      'blue',
      'red',
      'purple',
      'green',
      'cyan'
    )
  );


-- ============================================================
-- 3. VALID BOSS PERSONALITIES
-- ============================================================

alter table public.profiles
  drop constraint if exists profiles_boss_personality_check;

alter table public.profiles
  add constraint profiles_boss_personality_check
  check (
    boss_personality in (
      'sarcastic',
      'arrogant',
      'ruthless',
      'honorable',
      'chaotic',
      'supportive'
    )
  );


-- ============================================================
-- 4. DOCUMENTATION
-- ============================================================

comment on column public.profiles.accent_theme is
  'Visual accent theme used for the duelist profile and dashboard.';

comment on column public.profiles.signature_quote is
  'Optional personal quote displayed as part of the duelist identity.';

comment on column public.profiles.profile_banner_url is
  'Optional banner artwork URL for the duelist profile.';

comment on column public.profiles.boss_personality is
  'Controls the tone used by the player Boss Monster companion.';


-- ============================================================
-- 5. SAFE DEFAULTS FOR EXISTING PLAYERS
-- ============================================================

update public.profiles
set
  accent_theme = coalesce(
    accent_theme,
    'gold'
  ),
  boss_personality = coalesce(
    boss_personality,
    'sarcastic'
  );