type CacheRow<T> = {
  payload: T;
  expires_at: string;
  updated_at: string;
};

export type RuminaCacheEntry<T> = {
  data: T;
  fresh: boolean;
  updatedAt: string;
};

const configuration = () => {
  const url = (process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return url && serviceKey ? { url, serviceKey } : null;
};

const headers = (serviceKey: string) => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json'
});

export async function readRuminaCache<T>(cacheKey: string): Promise<RuminaCacheEntry<T> | null> {
  const config = configuration();
  if (!config) return null;
  try {
    const params = new URLSearchParams({
      cache_key: `eq.${cacheKey}`,
      select: 'payload,expires_at,updated_at',
      limit: '1'
    });
    const response = await fetch(`${config.url}/rest/v1/rumina_dashboard_cache?${params}`, {
      headers: headers(config.serviceKey),
      signal: AbortSignal.timeout(4_000)
    });
    if (!response.ok) return null;
    const row = ((await response.json()) as CacheRow<T>[])[0];
    if (!row?.payload) return null;
    return {
      data: row.payload,
      fresh: new Date(row.expires_at).getTime() > Date.now(),
      updatedAt: row.updated_at
    };
  } catch {
    // Cache e uma aceleracao opcional: uma indisponibilidade nunca derruba o BI.
    return null;
  }
}

export async function writeRuminaCache<T>(cacheKey: string, data: T, ttlMs: number): Promise<void> {
  const config = configuration();
  if (!config) return;
  try {
    await fetch(`${config.url}/rest/v1/rumina_dashboard_cache?on_conflict=cache_key`, {
      method: 'POST',
      headers: {
        ...headers(config.serviceKey),
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        payload: data,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
        updated_at: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(8_000)
    });
  } catch {
    // A resposta ao usuario nao depende da persistencia do cache.
  }
}
