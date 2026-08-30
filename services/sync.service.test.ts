import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const table = {
    upsert: vi.fn(async (_payload: unknown, _options?: unknown) => ({ error: null })),
    delete: vi.fn()
  };
  return {
    table,
    localdb: {
      getOutboxErrors: vi.fn(async () => []),
      getPendingOutbox: vi.fn(async () => []),
      retryOutboxItem: vi.fn(),
      updateOutboxPayload: vi.fn(),
      markOutboxError: vi.fn(),
      deleteOutboxItem: vi.fn(),
      put: vi.fn()
    },
    upload: vi.fn(async () => ({ error: { message: 'upload interrompido' } })),
    readMediaData: vi.fn(async () => new Blob(['imagem'], { type: 'image/jpeg' })),
    notify: vi.fn()
  };
});

vi.mock('./localdb', () => ({ localdb: mocks.localdb }));
vi.mock('./notification.service', () => ({ notify: mocks.notify }));
vi.mock('./media.service', () => ({ mediaService: { readMediaData: mocks.readMediaData } }));
vi.mock('./db.service', () => ({ db: {} }));
vi.mock('./activation.service', () => ({
  activationService: { validateCurrentAccess: vi.fn(async () => ({ ok: true })) }
}));
vi.mock('./farm-context.service', () => ({
  farmContextService: {
    getFarmId: vi.fn(() => 'farm-1'),
    getContext: vi.fn(() => ({
      farm_id: 'farm-1',
      employee_id: 'employee-1',
      employee_name: 'FUNCIONARIO TESTE',
      device_id: 'device-1'
    }))
  }
}));
vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => mocks.table),
    storage: {
      from: vi.fn(() => ({
        upload: mocks.upload,
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.invalid/media' } }))
      }))
    }
  }
}));

import { syncService } from './sync.service';

describe('sincronizacao independente de midia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const values = new Map<string, string>();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  });

  it('envia o texto e preserva a midia interrompida para retry', async () => {
    mocks.localdb.getPendingOutbox.mockResolvedValueOnce([{
      id: 7,
      tableName: 'anomalies',
      op: 'insert',
      payload: {
        id: 'anomaly-1',
        farm_id: 'farm-1',
        employee_id: 'employee-1',
        employee_name: 'FUNCIONARIO TESTE',
        device_id: 'device-1',
        description: 'Texto deve subir',
        media: [{ id: 'media-1', localUri: 'file:///foto.jpg', pendingUpload: true }]
      }
    }]);

    const result = await syncService.syncAll();

    expect(result).toEqual({ ok: true, count: 1 });
    expect(mocks.table.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.table.upsert.mock.calls[0][0]).toEqual(expect.objectContaining({
      id: 'anomaly-1',
      description: 'Texto deve subir',
      media: [expect.objectContaining({ id: 'media-1', pendingUpload: true })]
    }));
    expect(mocks.localdb.markOutboxError).toHaveBeenCalledWith(
      7,
      expect.stringContaining('[MEDIA_PENDING]')
    );
    expect(mocks.localdb.deleteOutboxItem).not.toHaveBeenCalled();
    expect(mocks.localdb.put).toHaveBeenCalledWith('anomalies', expect.objectContaining({
      id: 'anomaly-1',
      synced: false
    }));
  });
});
