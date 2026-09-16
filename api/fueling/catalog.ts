import type { ApiRequest, ApiResponse } from '../_lib/http.js';
import { queryValue, sendJson } from '../_lib/http.js';
import { requireAppUser } from '../_lib/admin-auth.js';
import { normalizeCatalogName, normalizePlate, validateFuelCatalog } from '../../utils/fuel-catalog.js';

export const config = { maxDuration: 30 };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido.' });
  try {
    const user = await requireAppUser(req);
    const kind = queryValue(req.query.kind);
    if (kind !== 'vehicle' && kind !== 'station') return sendJson(res, 400, { error: 'Cadastro inválido.' });
    const table = kind === 'vehicle' ? 'fuel_vehicles' : 'fuel_stations';
    const url = (process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) throw new Error('NOT_CONFIGURED');
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    const scope = new URLSearchParams({ farm_id: `eq.${user.farmId}`, employee_id: `eq.${user.employeeId}` });
    if (req.method === 'GET') {
      scope.set('select', '*'); scope.set('order', 'name.asc');
      const result = await fetch(`${url}/rest/v1/${table}?${scope}`, { headers, signal: AbortSignal.timeout(10_000) });
      if (!result.ok) throw new Error('DATABASE_UNAVAILABLE');
      return sendJson(res, 200, { items: await result.json() });
    }
    let body: any;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return sendJson(res, 400, { error: 'Dados inválidos.' }); }
    const input = body?.payload;
    if (!input || typeof input !== 'object' || !['insert','upsert','update'].includes(body?.op)) return sendJson(res, 400, { error: 'Operação inválida.' });
    if (input.farm_id !== user.farmId || String(input.employee_id) !== user.employeeId) return sendJson(res, 403, { error: 'Você só pode salvar os seus cadastros.' });
    const id = typeof input.id === 'string' ? input.id : '';
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id) || typeof input.name !== 'string') return sendJson(res, 400, { error: 'Cadastro inválido.' });
    const name = normalizeCatalogName(input.name);
    const detail = kind === 'vehicle' ? normalizePlate(String(input.plate || '')) : normalizeCatalogName(String(input.address || ''));
    const validation = validateFuelCatalog(kind, name, detail);
    if (validation) return sendJson(res, 400, { error: validation });
    // Um ID repetido nunca permite transferir um cadastro de outro funcionário.
    const lookup = new URLSearchParams({ id: `eq.${id}`, select: 'id,farm_id,employee_id,createdAt', limit: '1' });
    const existingResponse = await fetch(`${url}/rest/v1/${table}?${lookup}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!existingResponse.ok) throw new Error('DATABASE_UNAVAILABLE');
    const existing = ((await existingResponse.json()) as any[])[0];
    if (existing && (existing.farm_id !== user.farmId || String(existing.employee_id) !== user.employeeId)) return sendJson(res, 403, { error: 'Você só pode alterar os seus cadastros.' });
    const now = new Date().toISOString();
    const created = typeof input.createdAt === 'string' && Number.isFinite(Date.parse(input.createdAt)) ? input.createdAt : now;
    const payload = { id, farm_id: user.farmId, employee_id: user.employeeId, employee_name: user.employeeName,
      device_id: typeof input.device_id === 'string' ? input.device_id.slice(0,100) : null, name,
      ...(kind === 'vehicle' ? { plate: detail } : { address: detail }), createdAt: existing?.createdAt || created, updated_at: now };
    scope.set('id', `eq.${id}`);
    const result = await fetch(`${url}/rest/v1/${table}${existing ? `?${scope}` : ''}`, {
      method: existing ? 'PATCH' : 'POST', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000)
    });
    if (result.status === 409) return sendJson(res, 409, { error: 'Este veículo ou posto já está cadastrado. Atualize a lista.' });
    if (!result.ok) throw new Error('DATABASE_UNAVAILABLE');
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') return sendJson(res, 403, { error: 'Não foi possível validar seu acesso.' });
    return sendJson(res, 503, { error: 'Não foi possível sincronizar o cadastro agora. Ele será mantido neste aparelho.' });
  }
}
