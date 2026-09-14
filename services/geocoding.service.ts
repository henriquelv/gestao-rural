interface NominatimAddress {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
}

interface NominatimResult {
  display_name?: string;
  address?: NominatimAddress;
}

const CACHE_KEY = 'campo_legado_teste_geocoding_v1';
let lastRequestAt = 0;

const cacheKey = (latitude: number, longitude: number) => `${latitude.toFixed(5)},${longitude.toFixed(5)}`;

const readCache = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
};

const writeCache = (cache: Record<string, string>) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A localização continua válida mesmo quando o navegador não permite gravar o cache.
  }
};

const formatAddress = (result: NominatimResult): string => {
  const address = result.address;
  if (!address) return result.display_name || '';

  const street = address.road || address.pedestrian;
  const streetLine = [street, address.house_number].filter(Boolean).join(', ');
  const city = address.city || address.town || address.village || address.municipality;
  const parts = [streetLine, address.neighbourhood || address.suburb, city, address.state].filter(Boolean);
  return parts.join(' — ') || result.display_name || '';
};

export const geocodingService = {
  async reverseLookup(latitude: number, longitude: number): Promise<string | null> {
    const key = cacheKey(latitude, longitude);
    const cache = readCache();
    if (cache[key]) return cache[key];
    if (!navigator.onLine) return null;

    const delay = Math.max(0, 1_050 - (Date.now() - lastRequestAt));
    if (delay > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
    lastRequestAt = Date.now();

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        lat: String(latitude),
        lon: String(longitude),
        zoom: '18',
        addressdetails: '1',
        'accept-language': 'pt-BR'
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Geocodificação indisponível (${response.status})`);
      const address = formatAddress(await response.json() as NominatimResult);
      if (!address) return null;
      cache[key] = address;
      writeCache(cache);
      return address;
    } finally {
      window.clearTimeout(timeout);
    }
  }
};
