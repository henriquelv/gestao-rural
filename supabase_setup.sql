-- =========================================================
-- Supabase setup: tabelas + RLS (sem login) + Storage bucket
-- =========================================================
-- ATENÇÃO: Estas políticas deixam o banco ABERTO para leitura/escrita
-- para role anon/authenticated. Use apenas em ambiente controlado
-- (ex.: app interno) e considere restringir depois.

-- Extensões úteis
create extension if not exists "pgcrypto";

-- -------------------------
-- 1) TABELAS PRINCIPAIS
-- -------------------------

-- UI Config (id fixo = 1)
create table if not exists public.ui_config (
  id bigint primary key,
  buttons jsonb not null default '[]'::jsonb,
  "customPages" jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.ui_config (id) values (1)
on conflict (id) do nothing;

-- Farm settings (id fixo = 1)
create table if not exists public.farm_settings (
  id bigint primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.farm_settings (id, data) values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- Sectors
create table if not exists public.sectors (
  id bigserial primary key,
  name text not null unique
);

-- Employees
create table if not exists public.employees (
  id text primary key,
  name text not null,
  role text not null,
  "photoUri" text
);

-- Anomalies
create table if not exists public.anomalies (
  id text primary key,
  "createdAt" timestamptz not null,
  responsible text not null,
  sector text not null,
  description text not null,
  "immediateSolution" text not null,
  media jsonb not null default '[]'::jsonb,
  "resolvedAt" timestamptz,
  "resolvedBy" text
);

-- Instructions
create table if not exists public.instructions (
  id text primary key,
  "createdAt" timestamptz not null,
  title text not null,
  sector text not null,
  description text not null,
  media jsonb not null default '[]'::jsonb
);

-- Notices
create table if not exists public.notices (
  id text primary key,
  "createdAt" timestamptz not null,
  responsible text not null,
  content text not null,
  media jsonb not null default '[]'::jsonb
);

-- Improvements
create table if not exists public.improvements (
  id text primary key,
  "createdAt" timestamptz not null,
  employee text not null,
  sector text not null,
  description text not null,
  media jsonb not null default '[]'::jsonb
);

-- Farm Docs (documentos)
create table if not exists public.farm_docs (
  id text primary key,
  "updatedAt" timestamptz not null,
  title text not null,
  sector text not null,
  responsible text,
  media jsonb
);

-- Milk daily (histórico de litros)
create table if not exists public.milk_daily (
  date date primary key,
  liters numeric not null
);

-- Daily metrics (gráficos)
create table if not exists public.daily_metrics (
  date date not null,
  type text not null check (type in ('lactation','discard','births')),
  value numeric not null,
  primary key (date, type)
);

-- Monthly stats
create table if not exists public.farm_monthly_stats (
  "monthKey" text primary key,
  "lactatingCows" integer not null,
  "discardedCows" integer not null,
  births integer not null
);

-- -------------------------
-- 2) RLS (sem login)
-- -------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'ui_config','farm_settings','sectors','employees','anomalies','instructions','notices','improvements','farm_docs','milk_daily','daily_metrics','farm_monthly_stats'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);

    -- SELECT
    execute format('drop policy if exists %I on public.%I;', 'allow_select_all', t);
    execute format($p$
      create policy allow_select_all on public.%I
      for select to anon, authenticated
      using (true);
    $p$, t);

    -- INSERT
    execute format('drop policy if exists %I on public.%I;', 'allow_insert_all', t);
    execute format($p$
      create policy allow_insert_all on public.%I
      for insert to anon, authenticated
      with check (true);
    $p$, t);

    -- UPDATE
    execute format('drop policy if exists %I on public.%I;', 'allow_update_all', t);
    execute format($p$
      create policy allow_update_all on public.%I
      for update to anon, authenticated
      using (true)
      with check (true);
    $p$, t);

    -- DELETE
    execute format('drop policy if exists %I on public.%I;', 'allow_delete_all', t);
    execute format($p$
      create policy allow_delete_all on public.%I
      for delete to anon, authenticated
      using (true);
    $p$, t);
  end loop;
end $$;

-- -------------------------
-- 3) STORAGE: bucket "media"
-- -------------------------
-- "Pastas" no Storage são VIRTUAIS (aparecem quando você envia arquivos com prefixo).
-- O que você cria de verdade é o BUCKET.

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Políticas para acessar o bucket "media"
alter table storage.objects enable row level security;

drop policy if exists "media_select" on storage.objects;
create policy "media_select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'media');

drop policy if exists "media_insert" on storage.objects;
create policy "media_insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'media');

drop policy if exists "media_update" on storage.objects;
create policy "media_update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'media')
with check (bucket_id = 'media');

drop policy if exists "media_delete" on storage.objects;
create policy "media_delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'media');
