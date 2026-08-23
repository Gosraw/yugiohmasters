#!/usr/bin/env node
// =========================================================
// SEASON RESET - CLI wrapper around season_reset_preview() /
// season_reset_apply() (supabase/migrations/202608231520_
// season_reset.sql).
//
// DEFAULT BEHAVIOR IS A DRY RUN. Nothing is ever deleted unless
// you pass --apply AND type the exact confirmation phrase when
// prompted.
//
//   npm run season:reset            -> dry run (preview only)
//   npm run season:reset:apply      -> real, destructive reset
//
// WHY TWO SEPARATE SUPABASE CLIENTS
// season_reset_preview()/season_reset_apply()/
// claim_league_admin_if_none() are admin-gated the SAME way
// every other admin RPC in this codebase is: they read
// auth.uid() (populated from the caller's JWT "sub" claim) and
// check league_members.role = 'admin' for that specific person.
// A service-role key has NO "sub" claim at all (it authenticates
// as the Postgres role "service_role", not as any specific user),
// so auth.uid() would resolve to null and the RPC would reject it
// with "Not authenticated" - this is standard, documented
// Supabase/PostgREST behavior, not something specific to this
// script. That means these RPCs can only be called the same way
// a human admin uses any other admin feature in the app: signed
// in as themselves. This script therefore signs in as the actual
// operator (email + password, matching how they'd log into the
// app) to call those three RPCs, and uses a SEPARATE, second
// client authenticated with the service-role key ONLY for the
// final step - deleting the old auth.users rows - because that is
// Supabase's Admin API (supabase.auth.admin.deleteUser), a
// completely different permission model that has nothing to do
// with RLS or auth.uid() and is unavoidably service-role-only.
//
// Required environment (.env.local, never committed):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
//   SEASON_RESET_ADMIN_EMAIL       - the operator's own login email
//   SEASON_RESET_ADMIN_PASSWORD    - the operator's own login password
//                                     (omit to be prompted interactively -
//                                     recommended, keeps it out of shell
//                                     history/CI logs)
//   SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY
//                                   - ONLY read/used for the final
//                                     auth.users cleanup step, after
//                                     season_reset_apply() has already
//                                     succeeded.
//
// Flags:
//   --apply                 actually run the destructive reset
//                            (default: dry run / preview only)
//   --confirm "<phrase>"    pass the confirmation phrase
//                            non-interactively (for scripting/CI).
//                            Without it, --apply prompts
//                            interactively and requires the exact
//                            phrase to be typed:
//                              RESET DUELIST CIRCLE SEASON
//   --skip-auth-cleanup     stop after season_reset_apply()
//                            succeeds; do NOT call
//                            auth.admin.deleteUser() at all. Useful
//                            to inspect the DB state before
//                            removing logins, or if you'd rather
//                            delete accounts by hand in the
//                            Supabase Dashboard.
//
// This script never guesses: any RPC error is printed verbatim
// and the script exits non-zero. It never retries a failed
// destructive call automatically.
// =========================================================

import { createClient } from "@supabase/supabase-js";
import readline from "node:readline";

const CONFIRMATION_PHRASE = "RESET DUELIST CIRCLE SEASON";

// Control-character codes used by promptHidden() below, expressed
// as codes rather than literal characters in a string so nothing
// depends on non-printable bytes surviving inside this source file.
const CHAR_CODE_ENTER_LF = 10; // \n
const CHAR_CODE_ENTER_CR = 13; // \r
const CHAR_CODE_CTRL_C = 3;
const CHAR_CODE_CTRL_D = 4;
const CHAR_CODE_BACKSPACE_DEL = 127;
const CHAR_CODE_BACKSPACE_BS = 8;

function parseArgs(argv) {
  const args = {
    apply: false,
    confirm: null,
    skipAuthCleanup: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--confirm") {
      args.confirm = argv[i + 1] ?? null;
      i++;
    } else if (arg === "--skip-auth-cleanup") {
      args.skipAuthCleanup = true;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Reads one line from stdin without echoing it to the terminal
// (for the admin password prompt). Falls back to a normal, visible
// prompt when stdin isn't a real TTY (piped input, some CI runners)
// since raw mode isn't available there.
function promptHidden(question) {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return prompt(question);
  }
  return new Promise((resolve) => {
    process.stdout.write(question);
    let input = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (char) => {
      const code = char.charCodeAt(0);
      const isEnter = code === CHAR_CODE_ENTER_LF || code === CHAR_CODE_ENTER_CR;
      const isCtrlD = code === CHAR_CODE_CTRL_D;
      const isCtrlC = code === CHAR_CODE_CTRL_C;
      const isBackspace =
        code === CHAR_CODE_BACKSPACE_DEL || code === CHAR_CODE_BACKSPACE_BS;

      if (isEnter || isCtrlD) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (isCtrlC) {
        stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(1);
      } else if (isBackspace) {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.on("data", onData);
  });
}

function requireEnv(name, altName) {
  const value = process.env[name] ?? (altName ? process.env[altName] : undefined);
  if (!value) {
    const label = altName ? `${name} or ${altName}` : name;
    console.error(`Missing required environment variable: ${label}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabasePublicKey = requireEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
  const adminEmail = requireEnv("SEASON_RESET_ADMIN_EMAIL");
  let adminPassword = process.env.SEASON_RESET_ADMIN_PASSWORD;
  if (!adminPassword) {
    adminPassword = await promptHidden(`Password for ${adminEmail}: `);
  }

  // ---- Client 1: signed in as the real operator (for the
  // admin-gated RPCs - auth.uid() must resolve to their profile) ----
  const userClient = createClient(supabaseUrl, supabasePublicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Signing in as ${adminEmail} ...`);
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (signInError) {
    console.error(`Sign-in failed: ${signInError.message}`);
    console.error(
      "season_reset_preview()/season_reset_apply() require a real signed-in league admin - a service-role key cannot call them (see the header comment in this file)."
    );
    process.exit(1);
  }
  console.log("Signed in.\n");

  // ---- Step 1: ALWAYS preview first, dry run or not ----
  console.log("=== SEASON RESET PREVIEW (read-only, changes nothing) ===\n");
  const { data: preview, error: previewError } = await userClient.rpc(
    "season_reset_preview"
  );
  if (previewError) {
    console.error(`season_reset_preview() failed: ${previewError.message}`);
    console.error(
      "If this says you're not a league admin, you may need to run claim_league_admin_if_none() first (see the migration's comments) - this is expected right after a PRIOR reset wiped every admin."
    );
    process.exit(1);
  }

  const willReset = preview.filter((row) => row.will_be_reset);
  const kept = preview.filter((row) => !row.will_be_reset);

  console.log("Will be RESET (deleted, or un-sold for shop_rotation_cards):");
  for (const row of willReset) {
    console.log(`  ${row.row_count.toString().padStart(6)}  ${row.table_name}`);
  }
  console.log("\nWill be KEPT (untouched):");
  for (const row of kept) {
    console.log(`  ${row.row_count.toString().padStart(6)}  ${row.table_name}`);
  }

  const totalRowsAffected = willReset.reduce(
    (sum, row) => sum + Number(row.row_count),
    0
  );
  console.log(
    `\nTotal rows across reset tables: ${totalRowsAffected}. This preview changed nothing.\n`
  );

  if (!args.apply) {
    console.log(
      "Dry run only (no --apply flag). Nothing was changed. Re-run with --apply to actually perform the reset."
    );
    return;
  }

  // ---- Step 2: interactive/explicit confirmation before the
  // destructive call ----
  console.log(
    "!!! --apply was passed. This will PERMANENTLY DELETE every row listed above as 'RESET' and then delete every current login account. !!!"
  );
  let confirmation = args.confirm;
  if (!confirmation) {
    confirmation = await prompt(
      `Type exactly "${CONFIRMATION_PHRASE}" to proceed, or anything else to abort: `
    );
  }
  if (confirmation !== CONFIRMATION_PHRASE) {
    console.log("Confirmation did not match. Aborting. Nothing was changed.");
    process.exit(1);
  }

  // ---- Step 3: the destructive call itself ----
  console.log("\nCalling season_reset_apply() ...");
  const { data: resetProfiles, error: applyError } = await userClient.rpc(
    "season_reset_apply",
    { confirmation_phrase: confirmation }
  );
  if (applyError) {
    console.error(`season_reset_apply() failed: ${applyError.message}`);
    console.error(
      "Because this runs inside one Postgres transaction, a failure here means NOTHING was changed - the whole reset rolled back automatically."
    );
    process.exit(1);
  }

  const profileIds = (resetProfiles ?? []).map((row) => row.reset_profile_id);
  console.log(
    `season_reset_apply() succeeded. ${profileIds.length} profile(s) were reset at the database level:`
  );
  for (const id of profileIds) {
    console.log(`  ${id}`);
  }

  if (args.skipAuthCleanup) {
    console.log(
      "\n--skip-auth-cleanup was passed: stopping here. The old login accounts (auth.users) still exist - delete them yourself in the Supabase Dashboard, or re-run this script without --skip-auth-cleanup."
    );
    printAdminGapWarning();
    return;
  }

  if (profileIds.length === 0) {
    console.log(
      "\nNo profiles to remove logins for (the database had none). Skipping the auth-cleanup step."
    );
    printAdminGapWarning();
    return;
  }

  // ---- Step 4: delete the old auth.users rows via the Admin API.
  // This is a SEPARATE client, authenticated with the service-role
  // key - unrelated to the RPC calls above. ----
  const serviceKey = requireEnv(
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  );
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(
    `\nDeleting ${profileIds.length} auth.users login(s) via the Admin API ...`
  );
  let deleted = 0;
  const failures = [];
  for (const id of profileIds) {
    const { error } = await adminClient.auth.admin.deleteUser(id);
    if (error) {
      console.error(`  FAILED to delete ${id}: ${error.message}`);
      failures.push({ id, message: error.message });
    } else {
      console.log(`  deleted ${id}`);
      deleted++;
    }
  }

  console.log(
    `\nAuth cleanup: ${deleted}/${profileIds.length} login(s) deleted.`
  );
  if (failures.length > 0) {
    console.log(
      "The following accounts were NOT deleted and need manual follow-up (Supabase Dashboard -> Authentication -> Users):"
    );
    for (const failure of failures) {
      console.log(`  ${failure.id}: ${failure.message}`);
    }
  }

  console.log("\n=== SEASON RESET COMPLETE ===");
  printAdminGapWarning();
}

function printAdminGapWarning() {
  console.log(
    "\nIMPORTANT: league_members is now empty, so nobody currently holds the 'admin' role.\n" +
      "The 'leagues' row itself was kept (by design), so when players register again they will\n" +
      "join that EXISTING league via bootstrap_private_league() and be added as role='player' -\n" +
      "bootstrap_private_league() only grants 'admin' when creating a brand-new league.\n" +
      "Once at least one real player has registered and joined the league again, have THAT\n" +
      "player call the new claim_league_admin_if_none(<league_id>) RPC once (it only ever\n" +
      "succeeds when the league currently has zero admins, so it's safe to leave callable) to\n" +
      "restore admin access before doing anything else admin-gated."
  );
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
