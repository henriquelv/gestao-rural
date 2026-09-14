-- Novo cadastro solicitado para o ambiente TESTE da Campo Legado.
insert into public.clients (farm_id, name, status)
values (
  'ca4f1e9a-2026-4e57-8000-000000000001',
  'Luiz Eugenio da Fonseca - Manejo de Animais',
  'active'
)
on conflict (farm_id, name) do update set
  status = 'active',
  updated_at = now();

