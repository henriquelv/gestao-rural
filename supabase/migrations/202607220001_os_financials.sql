-- Evolução financeira das Ordens de Serviço.
-- Aplicar exclusivamente no projeto gratuito TESTE da Campo Legado.

alter table public.anomalies
  add column if not exists "projectValue" numeric(14,2) not null default 0,
  add column if not exists "kmQuantity" numeric(12,2) not null default 0,
  add column if not exists "paymentStatus" text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'anomalies_payment_status_check'
  ) then
    alter table public.anomalies
      add constraint anomalies_payment_status_check
      check ("paymentStatus" is null or "paymentStatus" in ('a_receber', 'recebido'));
  end if;
end $$;

update public.anomalies
set "projectValue" = coalesce("visitValue", 0) + coalesce("kmValue", 0)
where "serviceOrderType" = 'receita'
  and coalesce("projectValue", 0) = 0;

update public.anomalies
set "paymentStatus" = 'a_receber'
where "serviceOrderType" = 'receita'
  and "paymentStatus" is null;

create index if not exists idx_anomalies_farm_creator
  on public.anomalies(farm_id, employee_id);

create index if not exists idx_anomalies_farm_payment_status
  on public.anomalies(farm_id, "paymentStatus")
  where "serviceOrderType" = 'receita';
