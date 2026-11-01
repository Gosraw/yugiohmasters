-- Read-only. One line per part of the public schema: part|count|md5.
-- launch.sh compares this with schema-fingerprint.expected BEFORE the
-- real reset, so a difference with the tested state stops the launch
-- while nothing has been wiped yet. Rights of an object's owner and the
-- devstack's own bookkeeping table are left out. To see the actual
-- differences between two local databases: compare-schema.mjs.
--
-- After changing any migration, rebuild the expected file on a fresh
-- devstack (see docs/LAUNCH_2_0_RUNBOOK.md, appendix).

with rel as (
  select c.oid, c.relname, c.relkind, c.relowner, c.relacl,
    c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname <> '_devstack_migrations'
),
fn as (
  select p.oid, p.proowner, p.proacl,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as key
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prokind in ('f', 'p')
    and not exists (
      select 1 from pg_depend d
      where d.objid = p.oid and d.deptype = 'e'
    )
),
items(part, item) as (
  select 'functions', pg_get_functiondef(oid) from fn

  union all
  select 'function_acls', fn.key || ':' || coalesce(g.grantee, '') || '=' || a.privilege_type
  from fn
  cross join lateral aclexplode(fn.proacl) a
  left join lateral (select rolname as grantee from pg_roles r where r.oid = a.grantee) g on true
  where a.grantee <> fn.proowner

  union all
  select 'columns',
    r.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
      || case when a.attnotnull then ' not null' else '' end
      || ' default ' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), '-')
      || ' ' || a.attidentity::text || a.attgenerated::text
  from rel r
  join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where r.relkind in ('r', 'p')

  union all
  select 'constraints', r.relname || '.' || k.conname || ' ' || pg_get_constraintdef(k.oid)
  from pg_constraint k
  join rel r on r.oid = k.conrelid

  union all
  select 'indexes', indexdef
  from pg_indexes
  where schemaname = 'public'
    and tablename <> '_devstack_migrations'

  union all
  select 'triggers', t.tgenabled::text || ' ' || pg_get_triggerdef(t.oid)
  from pg_trigger t
  join rel r on r.oid = t.tgrelid
  where not t.tgisinternal

  union all
  select 'rls', relname || ' ' || relrowsecurity || ' ' || relforcerowsecurity
  from rel
  where relkind in ('r', 'p')

  union all
  select 'policies',
    concat_ws(' | ', tablename, policyname, permissive, cmd, roles::text, qual, with_check)
  from pg_policies
  where schemaname = 'public'

  union all
  select 'table_grants', r.relname || ':' || coalesce(g.grantee, '') || '=' || a.privilege_type
  from rel r
  cross join lateral aclexplode(r.relacl) a
  left join lateral (select rolname as grantee from pg_roles x where x.oid = a.grantee) g on true
  where r.relkind in ('r', 'p', 'v', 'm')
    and a.grantee <> r.relowner

  union all
  select 'column_grants',
    r.relname || '.' || c.attname || ':' || coalesce(g.grantee, '') || '=' || a.privilege_type
  from rel r
  join pg_attribute c on c.attrelid = r.oid and c.attnum > 0 and not c.attisdropped and c.attacl is not null
  cross join lateral aclexplode(c.attacl) a
  left join lateral (select rolname as grantee from pg_roles x where x.oid = a.grantee) g on true
  where a.grantee <> r.relowner

  union all
  select 'views', r.relname || ' ' || coalesce(array_to_string(c.reloptions, ','), '') || ' ' || pg_get_viewdef(r.oid, true)
  from rel r
  join pg_class c on c.oid = r.oid
  where r.relkind in ('v', 'm')

  union all
  select 'types',
    t.typname || ':' || t.typtype::text || ':' || coalesce((
      select string_agg(e.enumlabel, ',' order by e.enumsortorder)
      from pg_enum e
      where e.enumtypid = t.oid
    ), '')
  from pg_type t
  where t.typnamespace = 'public'::regnamespace
    and t.typtype in ('e', 'd')
)
select part, count(*), md5(string_agg(item, E'\n' order by item collate "C"))
from items
group by part
order by part collate "C";
