-- Aplicar somente no Supabase TESTE qkwgeahpctkjuqpamupi.
-- Cadastros particulares; acesso exclusivamente pela API autenticada do app.
create table if not exists public.fuel_vehicles (
  id text primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  employee_id text not null,
  employee_name text,
  device_id text,
  name text not null check (length(name) between 1 and 100),
  plate text not null default '',
  "createdAt" timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.fuel_stations (
  id text primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  employee_id text not null,
  employee_name text,
  device_id text,
  name text not null check (length(name) between 1 and 100),
  address text,
  "createdAt" timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fuel_vehicles_owner on public.fuel_vehicles(farm_id, employee_id);
create index if not exists idx_fuel_stations_owner on public.fuel_stations(farm_id, employee_id);
create unique index if not exists idx_fuel_vehicles_owner_plate on public.fuel_vehicles(farm_id, employee_id, plate) where plate <> '';
create unique index if not exists idx_fuel_stations_owner_name on public.fuel_stations(farm_id, employee_id, lower(name));
alter table public.fuel_vehicles enable row level security;
alter table public.fuel_stations enable row level security;
revoke all on public.fuel_vehicles, public.fuel_stations from anon, authenticated;
grant select, insert, update, delete on public.fuel_vehicles, public.fuel_stations to service_role;
alter table public.fuelings add column if not exists "vehicleId" text;
alter table public.fuelings add column if not exists "vehiclePlate" text;
alter table public.fuelings add column if not exists "stationId" text;
