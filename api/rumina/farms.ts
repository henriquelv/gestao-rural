import type { ApiRequest, ApiResponse } from '../_lib/http.js';
import { sendJson } from '../_lib/http.js';
import { requireAppUser } from '../_lib/admin-auth.js';
import { listRuminaFarms } from '../_lib/rumina.js';

export const config = { maxDuration: 30 };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método não permitido.' });
  try {
    const user = await requireAppUser(req);
    const farms = await listRuminaFarms();
    const processed=farms.map(farm=>farm.lastProcessedAt).filter((value):value is string=>Boolean(value)).sort();
    const aggregate={id:'__all__',name:'Gestão Campo Legado',lastProcessedAt:processed[0]||null,isAggregate:true,farmCount:farms.length};
    return sendJson(res, 200, {
      farms: user.isAdmin ? [aggregate,...farms] : farms,
      source: { provider: 'Rúmina Insights (Ideagri)', readOnly: true, fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') return sendJson(res, 403, { error: 'Não foi possível validar seu acesso.' });
    if (code === 'AUTH_NOT_CONFIGURED' || code === 'AUTH_UNAVAILABLE') return sendJson(res, 503, { error: 'Não foi possível validar o perfil agora.' });
    if (code === 'RUMINA_NOT_CONFIGURED') return sendJson(res, 503, { error: 'Integração ainda não configurada.' });
    return sendJson(res, 502, { error: 'Não foi possível consultar as fazendas agora.' });
  }
}
