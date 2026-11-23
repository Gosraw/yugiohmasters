-- =========================================================
-- PASTE INTO THE SUPABASE SQL EDITOR (production), 2026-11-23
--
-- Perks (Pay-to-win, real-life achievements), owner decision:
--   * weekly cap 600 -> 1000 DP
--   * THE CLEANING PHASE   150 -> 200
--   * SNACK PHASE          150 -> 200
--   * HOME-COOKED ADVANTAGE 100 -> 400
--   * FAST FOOD TECH       200 -> 500, becomes "WINGSTOP RUN"
--     (Wingstop for the group; the key fast_food_tech stays, so
--     its icon and any old claims keep working)
--   * DELIVERY FROM ANOTHER DIMENSION 250 -> 400
--   * FINE DINING SUMMON   300 -> 600
--   * THE CREATOR          400 -> 500
--
-- Only these values change; nothing else is touched. Approved
-- claims are paid from dp_value at approval time, so the new
-- amounts apply to every approval from now on.
-- Safe to run twice. The last row must say checks_passed = true.
-- =========================================================

begin;

update public.perk_config
set
  weekly_dp_cap = 1000,
  updated_at = now();

update public.achievements as a
set dp_value = v.dp_value
from (
  values
    ('the_cleaning_phase', 200),
    ('snack_phase', 200),
    ('home_cooked_advantage', 400),
    ('fast_food_tech', 500),
    ('delivery_from_another_dimension', 400),
    ('fine_dining_summon', 600),
    ('the_creator', 500)
) as v(key, dp_value)
where a.key = v.key;

update public.achievements
set
  title = 'WINGSTOP RUN',
  description = 'Picked up Wingstop for the group.'
where key = 'fast_food_tech';

commit;

-- =========================================================
-- VERIFICATION (reads only)
-- =========================================================

select
  (select weekly_dp_cap from public.perk_config) as weekly_cap,
  (
    select string_agg(title || ' ' || dp_value, ' | ' order by sort_order)
    from public.achievements
  ) as perks,
  (
    (select weekly_dp_cap from public.perk_config) = 1000
    and (
      select count(*)
      from public.achievements a
      join (
        values
          ('the_cleaning_phase', 'THE CLEANING PHASE', 200),
          ('snack_phase', 'SNACK PHASE', 200),
          ('home_cooked_advantage', 'HOME-COOKED ADVANTAGE', 400),
          ('fast_food_tech', 'WINGSTOP RUN', 500),
          ('delivery_from_another_dimension', 'DELIVERY FROM ANOTHER DIMENSION', 400),
          ('fine_dining_summon', 'FINE DINING SUMMON', 600),
          ('the_creator', 'THE CREATOR', 500)
      ) as v(key, title, dp_value)
        on v.key = a.key
       and v.title = a.title
       and v.dp_value = a.dp_value
      where a.active
    ) = 7
  ) as checks_passed;
