-- Corrige compatibilidade do app multi-fazenda com o schema atual.
--
-- Seguro para aplicar no projeto de teste/novo:
-- - Nao usa DROP, TRUNCATE ou DELETE.
-- - Nao torna campos NOT NULL.
-- - Nao altera dados historicos de forma destrutiva.
-- - Apenas adiciona metadados opcionais enviados pelo app novo.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'anomalies',
    'instructions',
    'notices',
    'improvements',
    'farm_docs',
    'milk_daily',
    'daily_metrics',
    'farm_monthly_stats'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I add column if not exists employee_id text', table_name);
      execute format('alter table public.%I add column if not exists employee_name text', table_name);
      execute format('alter table public.%I add column if not exists device_id text', table_name);

      execute format(
        'create index if not exists %I on public.%I (employee_id)',
        'idx_' || table_name || '_employee_id',
        table_name
      );
      execute format(
        'create index if not exists %I on public.%I (device_id)',
        'idx_' || table_name || '_device_id',
        table_name
      );
    end if;
  end loop;

  -- Backfill leve para preservar filtros por responsavel/funcionario nos dados antigos.
  if to_regclass('public.anomalies') is not null then
    update public.anomalies
       set employee_name = responsible
     where employee_name is null
       and responsible is not null;
  end if;

  if to_regclass('public.notices') is not null then
    update public.notices
       set employee_name = responsible
     where employee_name is null
       and responsible is not null;
  end if;

  if to_regclass('public.improvements') is not null then
    update public.improvements
       set employee_name = employee
     where employee_name is null
       and employee is not null;
  end if;

  if to_regclass('public.farm_docs') is not null then
    update public.farm_docs
       set employee_name = responsible
     where employee_name is null
       and responsible is not null;
  end if;
end $$;
