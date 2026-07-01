-- Corrige chaves globais herdadas do modelo "um banco por fazenda".
--
-- Objetivo:
-- - permitir que duas fazendas tenham dados no mesmo dia/tipo;
-- - manter farm_id nullable nesta etapa;
-- - nao apagar dados e nao recriar tabelas.
--
-- Observacao:
-- Esta migration NAO usa DROP TABLE, TRUNCATE ou DROP COLUMN.
-- Ela remove apenas constraints antigas globais que impedem multi-fazenda real
-- e cria constraints compostas por farm_id.

do $$
declare
  constraint_name text;
begin
  -- milk_daily era primary key apenas por date. Isso impedia duas fazendas
  -- de terem producao registrada no mesmo dia.
  if to_regclass('public.milk_daily') is not null then
    select conname
      into constraint_name
      from pg_constraint
     where conrelid = 'public.milk_daily'::regclass
       and contype = 'p'
     limit 1;

    if constraint_name is not null then
      execute format('alter table public.milk_daily drop constraint %I', constraint_name);
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.milk_daily'::regclass
         and conname = 'milk_daily_farm_id_date_key'
    ) then
      alter table public.milk_daily
        add constraint milk_daily_farm_id_date_key unique (farm_id, date);
    end if;

    create index if not exists idx_milk_daily_farm_date
      on public.milk_daily (farm_id, date);
  end if;

  -- daily_metrics era primary key apenas por date/type. Isso misturava
  -- lactacao/descarte/nascimento entre fazendas quando o dia era igual.
  constraint_name := null;
  if to_regclass('public.daily_metrics') is not null then
    select conname
      into constraint_name
      from pg_constraint
     where conrelid = 'public.daily_metrics'::regclass
       and contype = 'p'
     limit 1;

    if constraint_name is not null then
      execute format('alter table public.daily_metrics drop constraint %I', constraint_name);
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.daily_metrics'::regclass
         and conname = 'daily_metrics_farm_id_date_type_key'
    ) then
      alter table public.daily_metrics
        add constraint daily_metrics_farm_id_date_type_key unique (farm_id, date, type);
    end if;

    create index if not exists idx_daily_metrics_farm_date_type
      on public.daily_metrics (farm_id, date, type);
  end if;

  -- farm_monthly_stats era global por monthKey.
  constraint_name := null;
  if to_regclass('public.farm_monthly_stats') is not null then
    select conname
      into constraint_name
      from pg_constraint
     where conrelid = 'public.farm_monthly_stats'::regclass
       and contype = 'p'
     limit 1;

    if constraint_name is not null then
      execute format('alter table public.farm_monthly_stats drop constraint %I', constraint_name);
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.farm_monthly_stats'::regclass
         and conname = 'farm_monthly_stats_farm_id_month_key_key'
    ) then
      alter table public.farm_monthly_stats
        add constraint farm_monthly_stats_farm_id_month_key_key unique (farm_id, "monthKey");
    end if;

    create index if not exists idx_farm_monthly_stats_farm_month
      on public.farm_monthly_stats (farm_id, "monthKey");
  end if;

  -- sectors.name era unico global. Com multi-fazenda, "Ordenha" deve poder
  -- existir em varias fazendas.
  if to_regclass('public.sectors') is not null then
    alter table public.sectors drop constraint if exists sectors_name_key;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.sectors'::regclass
         and conname = 'sectors_farm_id_name_key'
    ) then
      alter table public.sectors
        add constraint sectors_farm_id_name_key unique (farm_id, name);
    end if;

    create index if not exists idx_sectors_farm_name
      on public.sectors (farm_id, name);
  end if;

  -- Configs com id fixo 1 tambem eram globais. Mantemos id, mas o conflito
  -- correto passa a ser farm_id + id para permitir configuracao por fazenda.
  if to_regclass('public.ui_config') is not null then
    constraint_name := null;
    select conname
      into constraint_name
      from pg_constraint
     where conrelid = 'public.ui_config'::regclass
       and contype = 'p'
     limit 1;

    if constraint_name is not null then
      execute format('alter table public.ui_config drop constraint %I', constraint_name);
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.ui_config'::regclass
         and conname = 'ui_config_farm_id_id_key'
    ) then
      alter table public.ui_config
        add constraint ui_config_farm_id_id_key unique (farm_id, id);
    end if;
  end if;

  if to_regclass('public.farm_settings') is not null then
    constraint_name := null;
    select conname
      into constraint_name
      from pg_constraint
     where conrelid = 'public.farm_settings'::regclass
       and contype = 'p'
     limit 1;

    if constraint_name is not null then
      execute format('alter table public.farm_settings drop constraint %I', constraint_name);
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.farm_settings'::regclass
         and conname = 'farm_settings_farm_id_id_key'
    ) then
      alter table public.farm_settings
        add constraint farm_settings_farm_id_id_key unique (farm_id, id);
    end if;
  end if;

end $$;

notify pgrst, 'reload schema';
