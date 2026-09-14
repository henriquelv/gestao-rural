-- Valor unitário por KM e total calculado automaticamente.
-- Aplicar exclusivamente no projeto gratuito TESTE da Campo Legado.

alter table public.anomalies
  add column if not exists "kmUnitValue" numeric(14,2) not null default 0;

update public.anomalies
set "kmUnitValue" = round("kmValue" / "kmQuantity", 2)
where "serviceOrderType" = 'despesa'
  and coalesce("kmQuantity", 0) > 0
  and coalesce("kmValue", 0) > 0
  and coalesce("kmUnitValue", 0) = 0;
