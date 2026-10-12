-- =========================================================
-- Stage 1 Boss Route achievements in English (2026-10-12)
--
-- The stage-1 achievement labels/descriptions seeded by
-- 202609041115_stage1_boss_achievement_balance.sql were the last
-- Dutch text players still see (Boss Route page). Text only,
-- matched on the exact old wording, so it is safe to re-run and
-- backwards compatible with the live app.
-- =========================================================

update public.boss_route_achievement_events as e
set
  label = v.new_label,
  description = v.new_description
from (
  values
    ('Gebruik een Armed Dragon Spell/Trap',
     'Use an Armed Dragon Spell/Trap',
     'Confirm at most once per duel when the player activated at least 1 Armed Dragon Spell or Trap.'),
    ('Gebruik een Cyber Spell/Trap',
     'Use a Cyber Spell/Trap',
     'Confirm at most once per duel when the player activated at least 1 Cyber-related Spell or Trap.'),
    ('Gebruik een Magician Girl-effect',
     'Use a Magician Girl effect',
     'Confirm at most once per duel when the player used at least 1 Magician Girl effect.'),
    ('Summon Armed Dragon LV3',
     'Summon Armed Dragon LV3',
     'Confirm at most once per duel when Armed Dragon LV3 was summoned.'),
    ('Summon een Cyber Dragon-monster',
     'Summon a Cyber Dragon monster',
     'Confirm at most once per duel when the player summoned at least 1 Cyber Dragon monster.'),
    ('Summon een Magician Girl',
     'Summon a Magician Girl',
     'Confirm at most once per duel when the player summoned at least 1 Magician Girl.'),
    ('Win met Armed Dragon LV3 in je deck',
     'Win with Armed Dragon LV3 in your deck',
     'Confirm when the player won the duel with Armed Dragon LV3 in the deck they used.'),
    ('Win met een Cyber Dragon-kaart in je deck',
     'Win with a Cyber Dragon card in your deck',
     'Confirm when the player won the duel with at least 1 Cyber Dragon card in the deck they used.'),
    ('Win met een Magician Girl in je deck',
     'Win with a Magician Girl in your deck',
     'Confirm when the player won the duel with at least 1 Magician Girl in the deck they used.')
) as v(old_label, new_label, new_description)
where e.label = v.old_label
  and e.event_key like 'stage1\_%'
  and (e.label <> v.new_label or e.description like 'Bevestig%');
