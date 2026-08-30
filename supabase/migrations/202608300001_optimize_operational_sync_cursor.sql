-- Indices compostos para o cursor incremental por fazenda.
-- Esta migration depende de 202608200001_add_operational_updated_at.sql.
-- Nao altera dados, constraints ou policies e pode ser executada novamente.

do $$
declare
  target_table text;
begin
  foreach target_table in array['anomalies', 'instructions', 'notices', 'improvements', 'farm_docs']
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target_table
        and column_name = 'farm_id'
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target_table
        and column_name = 'updated_at'
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target_table
        and column_name = 'id'
    ) then
      execute format(
        'create index if not exists %I on public.%I (farm_id, updated_at, id)',
        'idx_' || target_table || '_farm_updated_at_id',
        target_table
      );
    end if;
  end loop;
end $$;
