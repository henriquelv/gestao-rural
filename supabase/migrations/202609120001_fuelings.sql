-- Controle de abastecimentos da Campo Legado.
-- Aplicar somente no projeto gratuito TESTE autorizado (qkwgeahpctkjuqpamupi).

create table if not exists public.fuelings (
  id text primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  employee_id text not null,
  employee_name text not null,
  device_id text,
  vehicle text not null,
  date date not null,
  time text not null,
  odometer numeric(14,1) not null check (odometer >= 0),
  "fuelType" text not null check ("fuelType" in ('gasolina_comum','gasolina_aditivada','etanol','diesel_s10','diesel_s500','outro')),
  "pricePerLiter" numeric(12,3) not null check ("pricePerLiter" >= 0),
  "totalValue" numeric(14,2) not null check ("totalValue" >= 0),
  liters numeric(12,3) not null check (liters >= 0),
  "fullTank" boolean not null default false,
  station text,
  "driverId" text,
  "driverName" text not null,
  notes text,
  "createdAt" timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fuelings_farm_date on public.fuelings(farm_id, date desc);
create index if not exists idx_fuelings_farm_employee on public.fuelings(farm_id, employee_id, date desc);
create index if not exists idx_fuelings_farm_vehicle on public.fuelings(farm_id, vehicle, date desc);
create index if not exists idx_fuelings_updated_at on public.fuelings(updated_at);

alter table public.fuelings enable row level security;

drop policy if exists teste_select on public.fuelings;
drop policy if exists teste_insert on public.fuelings;
drop policy if exists teste_update on public.fuelings;
drop policy if exists teste_delete on public.fuelings;

create policy teste_select on public.fuelings for select to anon, authenticated using (true);
create policy teste_insert on public.fuelings for insert to anon, authenticated with check (true);
create policy teste_update on public.fuelings for update to anon, authenticated using (true) with check (true);
create policy teste_delete on public.fuelings for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.fuelings to anon, authenticated;
