import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=');
      return [
        line.slice(0, separator),
        line.slice(separator + 1).replace(/^["']|["']$/g, '')
      ];
    })
);

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_URL/ANON_KEY ausentes em .env.local');
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const { data: farms, error: farmsError } = await supabase
  .from('farms')
  .select('id,name,status')
  .order('created_at', { ascending: true });

if (farmsError) throw farmsError;
const farm = farms?.[0];
if (!farm) throw new Error('Nenhuma fazenda encontrada');

const referencedMedia = [];
const mediaMetadata = {
  total: 0,
  pendingWithoutRemotePath: 0,
  remoteUrlWithoutPath: 0,
  oldProjectUrl: 0,
  withoutRemoteSource: 0
};
for (const table of ['anomalies', 'notices', 'improvements', 'instructions', 'farm_docs']) {
  for (let page = 0; ; page += 1) {
    const pageSize = 500;
    const { data, error } = await supabase
      .from(table)
      .select('id,media')
      .eq('farm_id', farm.id)
      .order('id', { ascending: true })
      .range(page * pageSize, ((page + 1) * pageSize) - 1);

    if (error) throw error;
    for (const row of data || []) {
      const media = Array.isArray(row.media) ? row.media : [row.media];
      for (const item of media) {
        if (!item || typeof item !== 'object') continue;
        mediaMetadata.total += 1;
        if (item.pendingUpload === true && !item.remotePath) mediaMetadata.pendingWithoutRemotePath += 1;
        if (item.remoteUrl && !item.remotePath) mediaMetadata.remoteUrlWithoutPath += 1;
        if (String(item.remoteUrl || item.uri || '').includes('lviwvkvkeyzqdcbevaih')) mediaMetadata.oldProjectUrl += 1;
        if (!item.remotePath && !item.remoteUrl && !String(item.uri || '').startsWith('http')) {
          mediaMetadata.withoutRemoteSource += 1;
        }
        if (item?.remotePath) {
          referencedMedia.push({ table, id: String(row.id), path: item.remotePath });
        }
      }
    }
    if ((data || []).length < pageSize) break;
  }
}

const uniqueMedia = [...new Map(referencedMedia.map((item) => [item.path, item])).values()];
const legacy = uniqueMedia.filter((item) => !item.path.startsWith('farms/'));
const farmScoped = uniqueMedia.filter((item) => item.path.startsWith('farms/'));

const checks = [];
const batchSize = 8;
for (let offset = 0; offset < uniqueMedia.length; offset += batchSize) {
  const batch = uniqueMedia.slice(offset, offset + batchSize);
  const results = await Promise.all(batch.map(async (sample) => {
    try {
      const { data } = supabase.storage.from('media').getPublicUrl(sample.path);
      const response = await fetch(data.publicUrl, { headers: { Range: 'bytes=0-0' } });
      const detail = response.ok ? '' : (await response.text()).slice(0, 200);
      return {
        ...sample,
        kind: sample.path.startsWith('farms/') ? 'farm_scoped' : 'legacy',
        http: response.status,
        contentType: response.headers.get('content-type'),
        detail
      };
    } catch (error) {
      return {
        ...sample,
        kind: sample.path.startsWith('farms/') ? 'farm_scoped' : 'legacy',
        http: 0,
        contentType: null,
        detail: error instanceof Error ? error.message : String(error)
      };
    }
  }));
  checks.push(...results);
}

const available = checks.filter((item) => item.http >= 200 && item.http < 300);
const unavailable = checks.filter((item) => item.http < 200 || item.http >= 300);
for (const sample of unavailable.slice(0, 20)) console.log(JSON.stringify({ unavailable: sample }));
for (const sample of [...checks.filter((item) => item.kind === 'legacy').slice(0, 2), ...checks.filter((item) => item.kind === 'farm_scoped').slice(0, 2)]) {
  console.log(JSON.stringify({ sample: {
    kind: sample.kind,
    table: sample.table,
    path: sample.path,
    http: sample.http,
    contentType: sample.contentType
  }}));
}

console.log(JSON.stringify({
  mode: 'READ_ONLY',
  projectRef: new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0],
  farm: { name: farm.name, status: farm.status },
  mediaReferenced: uniqueMedia.length,
  legacyReferenced: legacy.length,
  farmScopedReferenced: farmScoped.length,
  available: available.length,
  unavailable: unavailable.length,
  mediaMetadata
}));
