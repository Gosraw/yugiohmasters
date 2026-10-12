-- Transfer Gosraw's votes from the Claude vote page to the live app (bossg).
-- Read-only except card_votes for bossg; safe to run twice.
insert into public.card_votes (item_id, profile_id, vote, allow_rarity)
select i.id, p.id, v.vote, v.allow_rarity
from (values
    (983995, 'too_weak', null),
    (1224927, 'too_weak', null),
    (3078576, 'agree', null),
    (4335427, 'too_strong', null),
    (5795980, 'too_weak', null),
    (5851097, 'agree', null),
    (5861892, 'agree', null),
    (10963799, 'too_weak', 'Secret Rare'),
    (12580477, 'agree', null),
    (13974207, 'agree', null),
    (18144507, 'agree', null),
    (19613556, 'agree', null),
    (19740112, 'too_weak', 'Secret Rare'),
    (23516703, 'too_weak', 'Ultra Rare'),
    (23846921, 'agree', null),
    (27581098, 'too_weak', 'Ultra Rare'),
    (31053337, 'agree', null),
    (33746252, 'too_weak', 'Secret Rare'),
    (40854197, 'agree', null),
    (42009836, 'too_weak', 'Ultra Rare'),
    (42703248, 'too_weak', null),
    (44095762, 'agree', null),
    (46145256, 'too_weak', 'Secret Rare'),
    (46772449, 'too_strong', null),
    (47084486, 'agree', null),
    (47297616, 'agree', null),
    (47961808, 'too_weak', 'Secret Rare'),
    (48229808, 'too_weak', null),
    (53129443, 'agree', null),
    (53334471, 'too_weak', 'Secret Rare'),
    (53582587, 'agree', null),
    (57774843, 'too_strong', null),
    (58921041, 'too_weak', 'Ultra Rare'),
    (59305593, 'too_weak', 'Ultra Rare'),
    (59509952, 'too_weak', 'Secret Rare'),
    (64681432, 'agree', null),
    (67688478, 'too_weak', null),
    (68140974, 'too_strong', null),
    (68937720, 'too_weak', null),
    (69162969, 'too_weak', null),
    (69831560, 'agree', null),
    (72634965, 'agree', null),
    (73356503, 'too_weak', 'Secret Rare'),
    (77498348, 'agree', null),
    (82301904, 'agree', null),
    (82732705, 'agree', null),
    (84478195, 'too_weak', 'Secret Rare'),
    (84636823, 'too_weak', null),
    (89111398, 'too_strong', null),
    (90846359, 'too_weak', 'Secret Rare'),
    (91279700, 'too_weak', 'Secret Rare'),
    (99735427, 'agree', null)
) as v(external_card_id, vote, allow_rarity)
join public.card_catalog c on c.external_card_id = v.external_card_id
join public.card_vote_items i on i.card_catalog_id = c.id
join public.profiles p on lower(p.username) = 'bossg'
join public.league_members m on m.profile_id = p.id and m.league_id = i.league_id
on conflict (item_id, profile_id) do update
  set vote = excluded.vote, allow_rarity = excluded.allow_rarity, updated_at = now();

select count(*) as stemmen_van_bossg
from public.card_votes v
join public.profiles p on p.id = v.profile_id
where lower(p.username) = 'bossg';
