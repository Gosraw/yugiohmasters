#!/bin/bash
# =========================================================
# Duelist Circle 2.0 - launch in one go (the runbook's steps 1-4).
#
#   bash scripts/season2/launch.sh
#
# Asks once for the database address, then:
#   0. read-only checks (changes nothing)
#   1. makes a backup file (outside the repo)
#   2. applies every 2.0 migration, starting with the one that repairs
#      the hand-made differences in production's database
#   2b. sets the approved Season 2 numbers, then checks that the
#      database now has exactly the tested shape
#   3. dry-runs the reset and checks the expected numbers
#   4. asks you to type WISSEN, then does the real reset
#
# Safe to start again after a stop in steps 0-3: it continues where it
# stopped. After a finished launch it refuses to run.
#
# Stops at the first problem. The address is never written to disk;
# the log file holds only the output of the steps.
#
# Local rehearsal only: DUELIST_LAUNCH_TEST_DB=<local url> skips the
# prompts and the production address checks.
# =========================================================

set -u

cd "$(dirname "$0")/../.." || exit 1

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${DUELIST_LAUNCH_OUT_DIR:-$HOME/Desktop}"
LOG="$OUT_DIR/duelist-launch-$STAMP.log"
BACKUP="$OUT_DIR/duelist-backup-$STAMP.dump"
LAUNCH_DATE="$(TZ=Europe/Amsterdam date +%Y-%m-%d)"

stop() {
  echo
  echo "=================================================="
  echo " GESTOPT: $1"
  echo " Kopieer deze melding naar Claude."
  echo " Logbestand: $LOG"
  echo "=================================================="
  exit 1
}

say() {
  echo
  echo "--- $1"
}

# The Mac's Postgres 17 tools, also when they are not on the PATH.
[ -d /opt/homebrew/opt/postgresql@17/bin ] && PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

for tool in psql pg_dump; do
  command -v "$tool" >/dev/null 2>&1 || stop "$tool ontbreekt op deze Mac."
done

# ---------------------------------------------------------
# The address
# ---------------------------------------------------------

if [ -n "${DUELIST_LAUNCH_TEST_DB:-}" ]; then
  DB="$DUELIST_LAUNCH_TEST_DB"
else
  echo "Plak het database-adres uit Supabase en druk op Enter."
  echo "(Je ziet niets verschijnen tijdens het plakken; dat hoort zo.)"
  IFS= read -r -s DB
  echo

  # A terminal can wrap pasted text in invisible markers (ESC[200~ and
  # ESC[201~) or add a stray return or space; the pooler then refuses
  # the address as "Invalid format for user or db_name".
  DB="$(printf '%s' "$DB" | LC_ALL=C tr -d '\000-\040\177' | sed -e 's/\[200~//g' -e 's/\[201~//g')"

  [ -n "$DB" ] || stop "Er is geen adres geplakt."

  case "$DB" in
    postgresql://*@*|postgres://*@*) ;;
    *) stop "Dit lijkt geen database-adres. Het moet beginnen met postgresql:// (er is niets veranderd)." ;;
  esac

  case "$DB" in
    *"[YOUR-PASSWORD]"*|*"[YOUR_PASSWORD]"*)
      stop "In het adres staat nog [YOUR-PASSWORD]. Vervang dat door het database-wachtwoord."
      ;;
  esac

  # Must be this project, not another Supabase project on this account.
  REF="$(sed -n -E 's#^NEXT_PUBLIC_SUPABASE_URL=.*https://([a-z0-9]+)\.supabase\.co.*#\1#p' .env.local | head -1)"

  [ -n "$REF" ] || stop "Kan het project niet vinden in .env.local."

  case "$DB" in
    *"$REF"*) ;;
    *) stop "Dit adres hoort niet bij het Duelist Circle-project. Kies in Supabase het project van yugiohmasters." ;;
  esac

  # Transaction pooler: step 2b needs one session across two commands.
  case "$DB" in
    *":6543"*) stop "Dit is de 'Transaction pooler' (poort 6543). Kies in Supabase bij Connect de 'Session pooler'." ;;
  esac
fi

export PGCONNECT_TIMEOUT=20

touch "$LOG" || stop "Kan geen logbestand maken in $OUT_DIR."

say "Verbinding testen"

PLAYERS="$(psql "$DB" -At -v ON_ERROR_STOP=1 -c "select count(*) from public.league_members" 2>>"$LOG")" \
  || stop "Kan niet verbinden. Klopt het wachtwoord in het adres?"

echo "Verbonden. Spelers in de league: $PLAYERS"

# Long files must not hit a server timeout; a lock held by something
# else must stop the script instead of hanging it forever.
SESSION=(-c "set statement_timeout = 0" -c "set lock_timeout = '60s'")

# ---------------------------------------------------------
# 0. Read-only checks
# ---------------------------------------------------------

say "Controles vooraf (verandert niets)"

ALREADY="$(psql "$DB" -At -v ON_ERROR_STOP=1 -c "select count(*) from public.duelist_circle_formats where code = 'duelist_circle_classic_v2' and is_active" 2>>"$LOG")" \
  || stop "De database kon niet gelezen worden. Er is niets veranderd."

[ "$ALREADY" = "0" ] || stop "Seizoen 2 staat al aan: de lancering is al gedaan. Er is niets veranderd."

# Migrations can only change what this login owns.
NOT_OWNED="$(psql "$DB" -At -v ON_ERROR_STOP=1 2>>"$LOG" <<'SQL'
select string_agg(name, ', ') from (
  select c.relname as name
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p', 'v', 'm')
    and c.relowner <> current_user::regrole
  union all
  select p.proname
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proowner <> current_user::regrole
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
) x;
SQL
)" || stop "De eigenaars konden niet gelezen worden. Er is niets veranderd."

[ -z "$NOT_OWNED" ] || stop "Deze login is geen eigenaar van: $NOT_OWNED. Er is niets veranderd."

# Without this trigger a new signup gets no profile. Not a launch
# blocker (the reset doesn't touch auth), so only a warning.
SIGNUP_TRIGGER="$(psql "$DB" -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and tgenabled <> 'D'" 2>>"$LOG")" \
  || SIGNUP_TRIGGER="onbekend"

if [ "$SIGNUP_TRIGGER" != "1" ]; then
  echo "LET OP: on_auth_user_created op auth.users niet gevonden ($SIGNUP_TRIGGER). Meld dit aan Claude; je kunt gewoon doorgaan."
fi

SERVER="$(psql "$DB" -At -c "show server_version" 2>>"$LOG")"

echo "Goed. Postgres $SERVER. Seizoen 2 staat nog niet aan."

# ---------------------------------------------------------
# 1. Backup
# ---------------------------------------------------------

say "Stap 1 van 4: back-up maken"

# Keeps owners and rights: a restore without the rights would lock the
# app out of its own tables.
if ! pg_dump "$DB" --format=custom \
  --schema=public --schema=auth \
  --file="$BACKUP" >>"$LOG" 2>&1; then
  # The reset never touches accounts, and some Supabase versions keep
  # auth tables this login can't read. The game data is what matters.
  echo "De accounts konden niet mee in de back-up; alleen de speldata wordt bewaard." | tee -a "$LOG"

  pg_dump "$DB" --format=custom \
    --schema=public \
    --file="$BACKUP" >>"$LOG" 2>&1 \
    || stop "De back-up is mislukt. Er is niets veranderd."
fi

[ -s "$BACKUP" ] || stop "Het back-upbestand is leeg. Er is niets veranderd."

chmod 600 "$BACKUP"

echo "Back-up gemaakt: $BACKUP ($(du -h "$BACKUP" | cut -f1))"

# ---------------------------------------------------------
# 2. Migrations
# ---------------------------------------------------------

say "Stap 2 van 4: database bijwerken"

# Not every migration can run twice, so remember what is done: starting
# the script again after a stop goes on where it stopped. This small
# schema is removed again at the end of the launch.
psql "$DB" -q -v ON_ERROR_STOP=1 >>"$LOG" 2>&1 <<'SQL' \
  || stop "Kon de voortgang niet bijhouden. Er is niets veranderd."
create schema if not exists duelist_launch;
revoke all on schema duelist_launch from public;
create table if not exists duelist_launch.applied (
  name text primary key,
  applied_at timestamptz not null default now()
);
SQL

DONE="|$(psql "$DB" -At -c "select string_agg(name, '|') from duelist_launch.applied" 2>>"$LOG")|"

for f in supabase/migrations/202610115900_prod_drift_normalize.sql supabase/migrations/2026101[245]*.sql supabase/migrations/20261030*.sql supabase/migrations/20261102*.sql; do
  case "$f" in
    # Production already has the live vote; this old test version
    # would fail there (see the runbook).
    *202610120500_card_votes.sql) continue ;;
  esac

  name="$(basename "$f")"

  case "$DONE" in
    *"|$name|"*) printf 's'; echo "== skip (already applied) $f" >>"$LOG"; continue ;;
  esac

  echo "== $f" >>"$LOG"
  printf '.'

  # One transaction per file: a file that fails leaves nothing behind.
  psql "$DB" -1 -v ON_ERROR_STOP=1 -q "${SESSION[@]}" -f "$f" >>"$LOG" 2>&1 \
    || stop "Fout in $f. De back-up staat veilig op $BACKUP."

  psql "$DB" -q -v ON_ERROR_STOP=1 -c "insert into duelist_launch.applied (name) values ('$name') on conflict do nothing" >>"$LOG" 2>&1 \
    || stop "$f is gelukt, maar kon niet genoteerd worden. Start niet opnieuw; meld dit."
done

echo
echo "Database bijgewerkt."

# ---------------------------------------------------------
# 2b. Approved numbers
# ---------------------------------------------------------

say "Seizoenscijfers zetten"

psql "$DB" -v ON_ERROR_STOP=1 \
  -c "set duelist.approve_season2_numbers = 'yes'" \
  -f supabase/proposals/season2_numbers.sql >>"$LOG" 2>&1 \
  || stop "De seizoenscijfers konden niet gezet worden."

echo "Cijfers gezet."

# The last moment before anything is wiped: does the database now have
# exactly the shape every test ran on?
say "Vorm van de database vergelijken met de geteste versie"

psql "$DB" -At -v ON_ERROR_STOP=1 -f scripts/season2/schema-fingerprint.sql \
  >"$OUT_DIR/duelist-fingerprint-$STAMP.txt" 2>>"$LOG" \
  || stop "De vorm van de database kon niet gelezen worden. Er is niets gewist."

if ! diff scripts/season2/schema-fingerprint.expected "$OUT_DIR/duelist-fingerprint-$STAMP.txt" >>"$LOG" 2>&1; then
  if [ "${DUELIST_LAUNCH_ACCEPT_SCHEMA_DIFF:-}" = "yes" ]; then
    echo "LET OP: de vorm wijkt af, maar DUELIST_LAUNCH_ACCEPT_SCHEMA_DIFF=yes staat aan." | tee -a "$LOG"
  else
    stop "De database wijkt af van de geteste versie (zie de regels met < en > in het logbestand). Er is niets gewist."
  fi
else
  echo "Gelijk aan de geteste versie."
fi

rm -f "$OUT_DIR/duelist-fingerprint-$STAMP.txt"

# ---------------------------------------------------------
# 3. Dry run
# ---------------------------------------------------------

say "Stap 3 van 4: proefdraaien (verandert niets)"

DRY="$(psql "$DB" -v ON_ERROR_STOP=1 -v launch_date="$LAUNCH_DATE" -v mode=dry_run \
  "${SESSION[@]}" -f scripts/season2/reset-and-activate.sql 2>&1)"
DRY_STATUS=$?

echo "$DRY" >>"$LOG"

[ "$DRY_STATUS" -eq 0 ] || stop "De proefdraai gaf een fout. Er is niets gewist."

for expected in \
  "PRE-FLIGHT OK" \
  "POST-FLIGHT OK" \
  "exactly 6167 eligible cards" \
  "Legendary 21, Secret Rare 219, Ultra Rare 1103, Super Rare 1270, Rare 1513, Normal 2041" \
  "14 Boss Paths active (stage prices 1800 / 3200 / 5500)" \
  "DRY RUN finished"
do
  case "$DRY" in
    *"$expected"*) ;;
    *) stop "De proefdraai mist: $expected. Er is niets gewist." ;;
  esac
done

echo "Proefdraai goed: 6167 kaarten, 21 Legendaries, 14 Boss-paden."

# ---------------------------------------------------------
# 4. The real reset
# ---------------------------------------------------------

say "Stap 4 van 4: alles wissen en Seizoen 2 starten (startdatum $LAUNCH_DATE)"

echo "Dit wist alle kaarten, DP, decks, duels, competities en Boss-voortgang."
echo "Accounts, wachtwoorden en de league blijven bestaan."

if [ -z "${DUELIST_LAUNCH_TEST_DB:-}" ]; then
  echo
  printf 'Typ WISSEN en druk op Enter om door te gaan: '
  IFS= read -r ANSWER
  [ "$ANSWER" = "WISSEN" ] || stop "Niet bevestigd. Er is niets gewist."
fi

APPLY="$(psql "$DB" -v ON_ERROR_STOP=1 -v launch_date="$LAUNCH_DATE" -v mode=apply \
  "${SESSION[@]}" -f scripts/season2/reset-and-activate.sql 2>&1)"
APPLY_STATUS=$?

echo "$APPLY" >>"$LOG"

[ "$APPLY_STATUS" -eq 0 ] || stop "De reset gaf een fout. Alles is teruggedraaid; er is niets gewist."

case "$APPLY" in
  *"SEASON 2 RESET APPLIED"*) ;;
  *) stop "De reset gaf geen bevestiging." ;;
esac

# The API caches the list of database functions; refresh it now.
psql "$DB" -q -c "drop schema if exists duelist_launch cascade" -c "notify pgrst, 'reload schema'" >>"$LOG" 2>&1

echo
echo "=================================================="
echo " KLAAR. De database staat op Seizoen 2."
echo " Zeg tegen Claude: klaar"
echo "=================================================="
