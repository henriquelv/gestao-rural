-- Multi-fazenda, licencas e dispositivos.
--
-- Regras desta etapa:
-- - Nao usa DROP TABLE, TRUNCATE ou DROP COLUMN.
-- - Nao torna farm_id NOT NULL.
-- - Nao endurece RLS ainda.
-- - Associa dados antigos a uma fazenda padrao "Cliente Atual".

create extension if not exists "pgcrypto";

create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  activation_code text unique,
  max_devices integer default 10,
  grace_period_days integer default 7,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid references public.farms(id),
  status text not null default 'active',
  starts_at timestamptz default now(),
  expires_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- employees.id ja existe como text no cliente atual. Por seguranca, devices.employee_id
-- fica text para referenciar a tabela existente sem recria-la.
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid references public.farms(id),
  employee_id text references public.employees(id),
  device_id text not null,
  device_name text,
  platform text,
  status text not null default 'active',
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  unique(farm_id, device_id)
);

do $$
declare
  default_farm_id uuid;
  table_name text;
begin
  insert into public.farms (
    name,
    status,
    activation_code,
    max_devices,
    grace_period_days
  )
  values (
    'Cliente Atual',
    'active',
    'CLIENTE-ATUAL-MIGRACAO',
    50,
    7
  )
  on conflict (activation_code) do update
    set name = excluded.name,
        status = excluded.status,
        max_devices = greatest(coalesce(public.farms.max_devices, 0), excluded.max_devices),
        grace_period_days = excluded.grace_period_days,
        updated_at = now()
  returning id into default_farm_id;

  if default_farm_id is null then
    select id into default_farm_id
    from public.farms
    where activation_code = 'CLIENTE-ATUAL-MIGRACAO'
    limit 1;
  end if;

  insert into public.licenses (farm_id, status, notes)
  values (default_farm_id, 'active', 'Licenca inicial criada para preservar dados existentes.')
  on conflict do nothing;

  -- Ajustes seguros em employees existente.
  alter table public.employees add column if not exists farm_id uuid references public.farms(id);
  alter table public.employees add column if not exists status text default 'active';
  alter table public.employees add column if not exists created_at timestamptz;
  alter table public.employees add column if not exists updated_at timestamptz;
  update public.employees
     set farm_id = default_farm_id,
         status = coalesce(status, 'active'),
         created_at = coalesce(created_at, now()),
         updated_at = coalesce(updated_at, now())
   where farm_id is null;

  foreach table_name in array array[
    'anomalies',
    'instructions',
    'notices',
    'improvements',
    'farm_docs',
    'milk_daily',
    'daily_metrics',
    'farm_monthly_stats',
    'sectors',
    'ui_config',
    'farm_settings'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I add column if not exists farm_id uuid references public.farms(id)', table_name);
      execute format('update public.%I set farm_id = $1 where farm_id is null', table_name)
        using default_farm_id;
      execute format('create index if not exists %I on public.%I (farm_id)', 'idx_' || table_name || '_farm_id', table_name);
    end if;
  end loop;

  -- Compatibilidade: algumas versoes do app usam "settings"; o SQL antigo usa
  -- "farm_settings". Nao renomeamos nem apagamos nada. Se settings existir, tambem
  -- recebe farm_id; se nao existir, o app tera fallback em codigo.
  if to_regclass('public.settings') is not null then
    alter table public.settings add column if not exists farm_id uuid references public.farms(id);
    update public.settings set farm_id = default_farm_id where farm_id is null;
    create index if not exists idx_settings_farm_id on public.settings (farm_id);
  end if;
end $$;

create index if not exists idx_farms_activation_code on public.farms (activation_code);
create index if not exists idx_farms_status on public.farms (status);
create index if not exists idx_devices_farm_id on public.devices (farm_id);
create index if not exists idx_devices_employee_id on public.devices (employee_id);
create index if not exists idx_licenses_farm_id on public.licenses (farm_id);

-- Policies permissivas para novas tabelas, alinhadas ao estado atual.
-- Endurecimento de RLS fica para etapa posterior apos validacao do app.
alter table public.farms enable row level security;
alter table public.devices enable row level security;
alter table public.licenses enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['farms','devices','licenses']
  loop
    execute format('drop policy if exists %I on public.%I;', 'allow_select_all', table_name);
    execute format('create policy allow_select_all on public.%I for select to anon, authenticated using (true);', table_name);

    execute format('drop policy if exists %I on public.%I;', 'allow_insert_all', table_name);
    execute format('create policy allow_insert_all on public.%I for insert to anon, authenticated with check (true);', table_name);

    execute format('drop policy if exists %I on public.%I;', 'allow_update_all', table_name);
    execute format('create policy allow_update_all on public.%I for update to anon, authenticated using (true) with check (true);', table_name);

    execute format('drop policy if exists %I on public.%I;', 'allow_delete_all', table_name);
    execute format('create policy allow_delete_all on public.%I for delete to anon, authenticated using (true);', table_name);
  end loop;
end $$;
