const RUMINA_BASE_URL = 'https://ruminainsights.rumina.com.br/api';
const PAGE_SIZE = 1000;
const MAX_PAGES = 60;
const HEAVY_AGGREGATE_ENDPOINTS = new Set(['animaistotais', 'controleleiteiro']);
const aggregateBatchSize = (endpoint: string) => endpoint === 'controleleiteiro' ? 2 : 8;

type RuminaEnvelope<T> = {
  mensagem?: string;
  resultado?: T[];
  offset?: number | string | null;
};

export type RuminaFarm = {
  id: string;
  name: string;
  lastProcessedAt: string | null;
};

const credentials = () => {
  const apiKey = (process.env.RUMINA_API_KEY || '').trim();
  const iduc = (process.env.RUMINA_IDUC || '').trim();
  if (!apiKey || !iduc) throw new Error('RUMINA_NOT_CONFIGURED');
  return { apiKey, iduc };
};

const post = async <T extends Record<string, unknown>>(
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs = 25_000
): Promise<RuminaEnvelope<T>> => {
  const { apiKey } = credentials();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${RUMINA_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.ok) return response.json() as Promise<RuminaEnvelope<T>>;
      const transient = response.status === 429 || response.status >= 500;
      if (!transient || attempt === 1) throw new Error(`RUMINA_${endpoint.toUpperCase()}_${response.status}`);
      lastError = new Error(`RUMINA_${endpoint.toUpperCase()}_${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(`RUMINA_${endpoint.toUpperCase()}_UNAVAILABLE`);
};

export const listRuminaFarms = async (): Promise<RuminaFarm[]> => {
  const { iduc } = credentials();
  const response = await post<Record<string, unknown>>('fazendasprocessadas', { iduc, offset: 0, filtros: {} });
  const seen = new Set<string>();
  return (response.resultado || []).map((row) => ({
    id: String(row.cdfazenda ?? ''),
    name: String(row.nome ?? row.nomefazenda ?? 'Fazenda sem nome'),
    lastProcessedAt: row.ultimo_processamento || row.data_processamento ? String(row.ultimo_processamento || row.data_processamento) : null
  })).filter((farm) => Boolean(farm.id) && !seen.has(farm.id) && Boolean(seen.add(farm.id)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};

export const fetchRuminaDataset = async (
  endpoint: string,
  farmIds: string | string[],
  period: { monthFrom: number; yearFrom: number; monthTo: number; yearTo: number }
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> => {
  const { iduc } = credentials();
  const farmCodes = (Array.isArray(farmIds)?farmIds:[farmIds]).map(Number).filter(code=>Number.isInteger(code)&&code>0);
  if (!farmCodes.length) throw new Error('RUMINA_INVALID_FARM');
  // Essas duas fontes podem ultrapassar 30 mil registros no consolidado. A API
  // aceita várias fazendas, então dividimos apenas as consultas pesadas em lotes
  // paralelos menores para concluir a paginação dentro do limite da função.
  const batchSize = aggregateBatchSize(endpoint);
  if (HEAVY_AGGREGATE_ENDPOINTS.has(endpoint) && farmCodes.length > batchSize) {
    const batches: number[][] = [];
    for (let index = 0; index < farmCodes.length; index += batchSize) {
      batches.push(farmCodes.slice(index, index + batchSize));
    }
    const results = await Promise.allSettled(batches.map((batch) => fetchRuminaDataset(endpoint, batch.map(String), period)));
    const available = results.filter((result): result is PromiseFulfilledResult<{ rows: Record<string, unknown>[]; truncated: boolean }> => result.status === 'fulfilled');
    if (!available.length) throw new Error(`RUMINA_${endpoint.toUpperCase()}_UNAVAILABLE`);
    return {
      rows: available.flatMap((result) => result.value.rows),
      // Uma falha isolada nao apaga os demais lotes: o painel mostra a fonte
      // como parcial e a proxima atualizacao tenta completar o resultado.
      truncated: available.some((result) => result.value.truncated) || available.length !== results.length
    };
  }
  const allowedFarms=new Set(farmCodes);
  const rows: Record<string, unknown>[] = [];
  // A função da Vercel permite 60 s. Reservamos margem para a montagem e o envio
  // da resposta, mas deixamos as páginas pesadas concluírem antes de truncar.
  const deadline = Date.now() + 52_000;
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) return { rows, truncated: true };
    const response = await post<Record<string, unknown>>(endpoint, {
      iduc,
      offset,
      filtros: {
        // A API documenta cdfazenda como inteiro; enviar texto faz o provedor
        // ignorar silenciosamente o filtro e devolver dados de outras fazendas.
        fazendas: farmCodes,
        periodo: {
          mesDe: period.monthFrom,
          anoDe: period.yearFrom,
          mesAte: period.monthTo,
          anoAte: period.yearTo
        }
      }
    }, Math.min(25_000, remaining));
    const pageRows = Array.isArray(response.resultado) ? response.resultado : [];
    // Defesa adicional: nenhum registro de outra fazenda chega ao agregador,
    // mesmo se o provedor voltar a aceitar um filtro inválido no futuro.
    rows.push(...pageRows.filter((row) => allowedFarms.has(Number(row.cdfazenda))));
    if (pageRows.length < PAGE_SIZE) return { rows, truncated: false };
    const nextOffset = Number(response.offset);
    offset = Number.isFinite(nextOffset) && nextOffset > offset ? nextOffset : offset + pageRows.length;
  }
  return { rows, truncated: true };
};
