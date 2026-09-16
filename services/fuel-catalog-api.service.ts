import { farmContextService } from './farm-context.service';
export const fuelCatalogTables = new Set(['fuel_vehicles', 'fuel_stations']);

export async function requestFuelCatalog(tableName: string, write?: { op: string; payload: unknown }) {
  const ctx = farmContextService.getContext();
  if (!ctx || !fuelCatalogTables.has(tableName)) throw new Error('Entre novamente para acessar seus cadastros.');
  let response: Response;
  try { response = await fetch(`/api/fueling/catalog?kind=${tableName === 'fuel_vehicles' ? 'vehicle' : 'station'}`, {
    method: write ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json', 'x-campo-farm-id': ctx.farm_id,
      'x-campo-employee-id': ctx.employee_id, 'x-campo-device-id': ctx.device_id,
      'x-campo-admin-pin': ctx.admin_pin || '' },
    ...(write ? { body: JSON.stringify(write) } : {})
  }); } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new TypeError('Connection timeout: o cadastro permanece pendente.');
    throw error;
  }
  if (response.status >= 500) throw new TypeError('Connection unavailable: o cadastro permanece pendente.');
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Não foi possível sincronizar os cadastros.');
  return body;
}
