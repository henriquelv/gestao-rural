import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(async () => ({ error: null })),
  getBlob: vi.fn(async () => ({
    blob: new Blob(['imagem-cacheada'], { type: 'image/jpeg' })
  }))
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    convertFileSrc: (value: string) => value
  }
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: {}
}));
vi.mock('./localdb.web', () => ({
  webDB: { media_blobs: { get: mocks.getBlob } }
}));
vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.invalid/${path}` } }),
        upload: mocks.upload
      })
    }
  }
}));

import { mediaService } from './media.service';

describe('autorrecuperacao de midia a partir do cache offline', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    values = new Map();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
  });

  it('nao envia novamente quando o objeto remoto existe', async () => {
    const remotePath = 'anomalies/existing/photo.jpeg';
    values.set('media_offline_cache_v1', JSON.stringify({ [remotePath]: 'cache-existing' }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 206 })));

    const repaired = await mediaService.repairMissingRemoteFromCache({
      id: 'existing',
      type: 'photo',
      remotePath
    });

    expect(repaired).toBe(false);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('restaura somente o path ausente sem sobrescrever', async () => {
    const remotePath = 'anomalies/missing/photo.jpeg';
    values.set('media_offline_cache_v1', JSON.stringify({ [remotePath]: 'cache-missing' }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ statusCode: '404', message: 'Object not found', code: 'NoSuchKey' }),
      { status: 400 }
    )));

    const repaired = await mediaService.repairMissingRemoteFromCache({
      id: 'missing',
      type: 'photo',
      remotePath,
      mimeType: 'image/jpeg'
    });

    expect(repaired).toBe(true);
    expect(mocks.upload).toHaveBeenCalledWith(
      remotePath,
      expect.any(Blob),
      { upsert: false, contentType: 'image/jpeg' }
    );
  });
});
