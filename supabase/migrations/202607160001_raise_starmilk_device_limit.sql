-- Hotfix seguro: aumenta o limite de dispositivos da fazenda starmilk.
-- Motivo: a fazenda estava com 50 dispositivos ativos e max_devices = 50,
-- bloqueando novas ativações. Nao apaga dados, nao altera tabelas e e idempotente.

update public.farms
set
  max_devices = greatest(coalesce(max_devices, 0), 150),
  updated_at = now()
where activation_code = 'STARMILK'
  and coalesce(max_devices, 0) < 150;
