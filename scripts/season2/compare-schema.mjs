#!/usr/bin/env node
// Developer tool: compares the shape of two LOCAL databases, section by
// section, for schema public (plus the catalog-level things that change
// behaviour: extensions, schema and default privileges).
//
//   node scripts/season2/compare-schema.mjs <urlA> <urlB> [outDir]
//
// Prints a summary per section and, for every difference, which side it
// is on. With outDir it also writes one <section>.a.txt / .b.txt pair
// per section, so `diff` can show the full text of a function.
//
// Refuses anything but 127.0.0.1: it is for comparing a local clone of
// production against the devstack, never for the real database.
//
// Exit code: 0 when identical, 1 when there are differences.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const [urlA, urlB, outDir] = process.argv.slice(2);

if (!urlA || !urlB) {
  console.error("Usage: compare-schema.mjs <urlA> <urlB> [outDir]");
  process.exit(2);
}

for (const url of [urlA, urlB]) {
  if (new URL(url).hostname !== "127.0.0.1") {
    console.error(`Refusing non-local database: ${new URL(url).hostname}`);
    process.exit(2);
  }
}

const aclText = (column) => `coalesce((
  select string_agg(item, ' ' order by item)
  from (
    select coalesce(nullif(grantee.rolname, ''), 'PUBLIC') || '=' || a.privilege_type
      || case when a.is_grantable then '*' else '' end as item
    from aclexplode(${column}) a
    left join pg_roles grantee on grantee.oid = a.grantee
  ) acl
), '(default)')`;

const SECTIONS = {
  extensions: `
    select extname as key, extversion as value from pg_extension
  `,
  schema_acl: `
    select nspname as key, ${aclText("nspacl")} as value
    from pg_namespace where nspname = 'public'
  `,
  default_privileges: `
    select r.rolname || ':' || coalesce(n.nspname, '*') || ':' || d.defaclobjtype::text as key,
      ${aclText("d.defaclacl")} as value
    from pg_default_acl d
    join pg_roles r on r.oid = d.defaclrole
    left join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname = 'public' or n.nspname is null
  `,
  functions: `
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as key,
      pg_get_functiondef(p.oid) as value
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  `,
  function_acls: `
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as key,
      ${aclText("p.proacl")} as value
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  `,
  columns: `
    select c.relname || '.' || a.attname as key,
      concat_ws(' | ',
        format_type(a.atttypid, a.atttypmod),
        case when a.attnotnull then 'not null' else 'null' end,
        'default: ' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), '(none)'),
        nullif(a.attidentity, ''),
        nullif(a.attgenerated, '')
      ) as value
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and a.attnum > 0 and not a.attisdropped
  `,
  column_order: `
    select c.relname as key,
      string_agg(a.attname, ', ' order by a.attnum) as value
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and a.attnum > 0 and not a.attisdropped
    group by c.relname
  `,
  constraints: `
    select c.relname || '.' || k.conname as key,
      pg_get_constraintdef(k.oid) as value
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    where c.relnamespace = 'public'::regnamespace
  `,
  indexes: `
    select indexname as key, indexdef as value
    from pg_indexes where schemaname = 'public'
  `,
  triggers: `
    select c.relname || '.' || t.tgname as key,
      t.tgenabled::text || ' ' || pg_get_triggerdef(t.oid) as value
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  `,
  auth_triggers: `
    select c.relname || '.' || t.tgname as key,
      t.tgenabled::text || ' ' || pg_get_triggerdef(t.oid) as value
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relnamespace = 'auth'::regnamespace and not t.tgisinternal
  `,
  rls: `
    select relname as key,
      'rowsecurity=' || relrowsecurity || ' force=' || relforcerowsecurity as value
    from pg_class
    where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
  `,
  policies: `
    select tablename || '.' || policyname as key,
      concat_ws(' | ', permissive, cmd, roles::text,
        'using: ' || coalesce(qual, '-'),
        'check: ' || coalesce(with_check, '-')) as value
    from pg_policies where schemaname = 'public'
  `,
  table_grants: `
    select relname as key, ${aclText("relacl")} as value
    from pg_class
    where relnamespace = 'public'::regnamespace and relkind in ('r', 'p', 'v', 'm')
  `,
  column_grants: `
    select c.relname || '.' || a.attname as key, ${aclText("a.attacl")} as value
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
      and a.attnum > 0 and not a.attisdropped and a.attacl is not null
  `,
  views: `
    select c.relname as key,
      coalesce(array_to_string(c.reloptions, ','), '') || E'\\n' || pg_get_viewdef(c.oid, true) as value
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
  `,
  sequences: `
    select c.relname as key,
      concat_ws(' | ', format_type(s.seqtypid, null), s.seqincrement, s.seqmin, s.seqmax, s.seqcycle,
        ${aclText("c.relacl")}) as value
    from pg_sequence s
    join pg_class c on c.oid = s.seqrelid
    where c.relnamespace = 'public'::regnamespace
  `,
  types: `
    select t.typname as key,
      t.typtype::text || ':' || coalesce((
        select string_agg(e.enumlabel, ',' order by e.enumsortorder)
        from pg_enum e where e.enumtypid = t.oid
      ), '') as value
    from pg_type t
    where t.typnamespace = 'public'::regnamespace and t.typtype in ('e', 'd', 'c')
      and not exists (
        select 1 from pg_class c where c.oid = t.typrelid and c.relkind <> 'c'
      )
  `,
};

async function snapshot(url) {
  const sql = postgres(url, {
    max: 1,
    onnotice: () => {},
  });
  const result = {};

  try {
    for (const [section, query] of Object.entries(SECTIONS)) {
      const rows = await sql.unsafe(query);

      result[section] = new Map(rows.map((row) => [row.key, row.value]));
    }
  } finally {
    await sql.end();
  }

  return result;
}

function dump(map) {
  return [...map.keys()].sort().map((key) => `### ${key}\n${map.get(key)}\n`).join("\n");
}

const [a, b] = await Promise.all([snapshot(urlA), snapshot(urlB)]);
let total = 0;

if (outDir) {
  mkdirSync(outDir, {
    recursive: true,
  });
}

for (const section of Object.keys(SECTIONS)) {
  const onlyA = [...a[section].keys()].filter((key) => !b[section].has(key)).sort();
  const onlyB = [...b[section].keys()].filter((key) => !a[section].has(key)).sort();
  const changed = [...a[section].keys()]
    .filter((key) => b[section].has(key) && a[section].get(key) !== b[section].get(key))
    .sort();
  const count = onlyA.length + onlyB.length + changed.length;

  total += count;
  console.log(`${count === 0 ? "ok  " : "DIFF"} ${section}: ${a[section].size} vs ${b[section].size}${count ? ` (${onlyA.length} only A, ${onlyB.length} only B, ${changed.length} changed)` : ""}`);

  for (const key of onlyA) console.log(`     only A: ${key}`);
  for (const key of onlyB) console.log(`     only B: ${key}`);

  for (const key of changed) {
    const left = a[section].get(key);
    const right = b[section].get(key);
    const short = left.length < 300 && right.length < 300;
    const whitespaceOnly = left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();

    console.log(`     changed: ${key}${whitespaceOnly ? " (whitespace only)" : ""}`);

    if (short) {
      console.log(`       A: ${left}`);
      console.log(`       B: ${right}`);
    }
  }

  if (outDir) {
    writeFileSync(path.join(outDir, `${section}.a.txt`), dump(a[section]));
    writeFileSync(path.join(outDir, `${section}.b.txt`), dump(b[section]));
  }
}

console.log(total === 0 ? "\nSchemas are identical." : `\n${total} difference(s).`);
process.exitCode = total === 0 ? 0 : 1;
