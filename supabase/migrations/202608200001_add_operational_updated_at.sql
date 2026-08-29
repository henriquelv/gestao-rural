-- Cursor de sincronizacao separado da data de negocio.
-- Seguro para atualizacao sobre APK/schema antigo: apenas adiciona colunas,
-- preenche valores ausentes e cria triggers idempotentes.

create or replace function public.set_operational_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
  business_column text;
begin
  foreach table_name in array['anomalies', 'instructions', 'notices', 'improvements', 'farm_docs']
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    business_column := case when table_name = 'farm_docs' then '"updatedAt"' else '"createdAt"' end;
    execute format('alter table public.%I add column if not exists updated_at timestamptz', table_name);
    execute format('update public.%I set updated_at = coalesce(updated_at, %s, now()) where updated_at is null', table_name, business_column);
    execute format('alter table public.%I alter column updated_at set default now()', table_name);
    execute format('create index if not exists %I on public.%I (updated_at)', 'idx_' || table_name || '_updated_at', table_name);

    if not exists (
      select 1 from pg_trigger
      where tgrelid = format('public.%I', table_name)::regclass
        and tgname = table_name || '_set_updated_at'
    ) then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_operational_updated_at()', table_name || '_set_updated_at', table_name);
    end if;
  end loop;
end $$;
