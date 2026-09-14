import { Capacitor } from '@capacitor/core';
import { webDB, LocalRecord } from './localdb.web';

type ChangeCallback = (tableName: string) => void;
const _listeners: Record<string, Set<ChangeCallback>> = {};

const notifyChange = (tableName: string) => {
  const s = _listeners[tableName];
  if (!s) return;
  for (const cb of Array.from(s)) {
    try { cb(tableName); } catch (e) { console.error('listener error', e); }
  }
};

const isNative = Capacitor.isNativePlatform();
type NativeDB = typeof import('./localdb.native')['nativeDB'];
let nativeDBPromise: Promise<NativeDB> | null = null;

const getNativeDB = async (): Promise<NativeDB> => {
  if (!isNative) throw new Error('SQLite nativo solicitado fora do aplicativo Android.');
  if (!nativeDBPromise) {
    nativeDBPromise = import('./localdb.native').then(async ({ nativeDB }) => {
      await nativeDB.init();
      return nativeDB;
    });
  }
  return nativeDBPromise;
};

if (isNative) {
  void getNativeDB();
}

export const localdb = {
  async getAll<T>(tableName: string, orderBy?: string): Promise<T[]> {
    if (isNative) {
      return await (await getNativeDB()).getAll(tableName, orderBy);
    }

    // @ts-ignore
    const table = webDB[tableName];
    if (!table) return [];
    const records = await table.toArray();
    let data = records.map((r: LocalRecord) => r.data);
    if (orderBy) {
      data.sort((a: any, b: any) => (a[orderBy] > b[orderBy] ? -1 : 1));
    }
    return data;
  },

  async getById<T>(tableName: string, id: string): Promise<T | null> {
    if (isNative) {
      return await (await getNativeDB()).get(tableName, id);
    }
    // @ts-ignore
    const record = await webDB[tableName]?.get(id);
    return record ? record.data : null;
  },

  async getRawById(tableName: string, id: string): Promise<{ id: string; synced: boolean; data: any } | null> {
    if (isNative) {
      return await (await getNativeDB()).getRawById(tableName, id);
    }
    // @ts-ignore
    const record = await webDB[tableName]?.get(id);
    if (!record) return null;
    return { id: record.id, synced: !!record.synced, data: record.data };
  },

  async count(tableName: string): Promise<number> {
    if (isNative) {
      return await (await getNativeDB()).count(tableName);
    }
    // @ts-ignore
    return await webDB[tableName].count();
  },

  async put(tableName: string, record: LocalRecord): Promise<void> {
    if (isNative) {
      await (await getNativeDB()).put(tableName, record);
      notifyChange(tableName);
      return;
    }
    // @ts-ignore
    await webDB[tableName].put(record);
    notifyChange(tableName);
  },

  async bulkPut(tableName: string, records: LocalRecord[]): Promise<void> {
    if (isNative) {
      const nativeDB = await getNativeDB();
      for (const r of records) await nativeDB.put(tableName, r);
      notifyChange(tableName);
      return;
    }
    // @ts-ignore
    await webDB[tableName].bulkPut(records);
    notifyChange(tableName);
  },

  async delete(tableName: string, id: string): Promise<void> {
    if (isNative) {
      await (await getNativeDB()).delete(tableName, id);
      notifyChange(tableName);
      return;
    }
    // @ts-ignore
    await webDB[tableName].delete(id);
    notifyChange(tableName);
  },

  async clearTable(tableName: string): Promise<void> {
    if (isNative) {
      await (await getNativeDB()).clearTable(tableName);
      notifyChange(tableName);
      return;
    }
    // @ts-ignore
    const table = webDB[tableName];
    if (!table) return;
    await table.clear();
    notifyChange(tableName);
  },

  // Retorna registros com synced=false — usado para recuperar órfãos ao iniciar
  async getUnsyncedRawRecords(tableName: string): Promise<{ id: string; data: any }[]> {
    if (isNative) {
      return await (await getNativeDB()).getUnsyncedRawRecords(tableName);
    }
    // @ts-ignore
    const table = webDB[tableName];
    if (!table) return [];
    const records = await table
      .filter((record: LocalRecord) => record.synced === false || (record.synced as any) === 0)
      .toArray();
    return records.map((r: any) => ({ id: r.id, data: r.data }));
  },

  subscribe(tableName: string, cb: ChangeCallback) {
    if (!_listeners[tableName]) _listeners[tableName] = new Set();
    _listeners[tableName].add(cb);
    return () => {
      _listeners[tableName].delete(cb);
      if (_listeners[tableName].size === 0) delete _listeners[tableName];
    };
  },

  // For debugging / tests
  _getListenersCount(tableName: string) {
    return _listeners[tableName] ? _listeners[tableName].size : 0;
  },

  async addToOutbox(item: any): Promise<void> {
    if (isNative) {
      await (await getNativeDB()).addToOutbox(item);
      return;
    }
    await webDB.outbox.add(item);
  },

  async getPendingOutbox(): Promise<any[]> {
    if (isNative) {
      return await (await getNativeDB()).getPendingOutbox();
    }
    return await webDB.outbox.where('status').equals('pending').sortBy('created_at');
  },

  async getOutboxErrors(limit: number = 50): Promise<any[]> {
    if (isNative) {
      // @ts-ignore
      return await (await getNativeDB()).getOutboxErrors(limit);
    }
    return await webDB.outbox.where('status').equals('error').reverse().limit(limit).toArray();
  },

  async deleteOutboxItem(id: number): Promise<void> {
    if (isNative) {
      await (await getNativeDB()).markOutboxDone(id);
      return;
    }
    await webDB.outbox.delete(id);
  },

  async markOutboxError(id: number, msg: string): Promise<void> {
    if (isNative) {
      await (await getNativeDB()).markOutboxError(id, msg);
      return;
    }
    await webDB.outbox.update(id, { status: 'error', errorMessage: msg });
  },

  async updateOutboxPayload(id: number, payload: any): Promise<void> {
    if (isNative) {
      // @ts-ignore
      await (await getNativeDB()).updateOutboxPayload(id, payload);
      return;
    }
    await webDB.outbox.update(id, { payload });
  },

  async retryOutboxItem(id: number): Promise<void> {
    if (isNative) {
      // @ts-ignore
      await (await getNativeDB()).retryOutboxItem(id);
      return;
    }
    await webDB.outbox.update(id, { status: 'pending', errorMessage: undefined });
  },

  async retryAllOutboxErrors(): Promise<void> {
    if (isNative) {
      // @ts-ignore
      await (await getNativeDB()).retryAllOutboxErrors();
      return;
    }
    const errs = await webDB.outbox.where('status').equals('error').toArray();
    await Promise.all(errs.map((e) => webDB.outbox.update(e.id as number, { status: 'pending', errorMessage: undefined })));
  },

  async clearOutbox(): Promise<void> {
    if (isNative) {
      await (await getNativeDB()).clearOutbox();
      return;
    }
    await webDB.outbox.clear();
  },

  async clearOutboxForTables(tableNames: string[]): Promise<void> {
    if (tableNames.length === 0) return;
    if (isNative) {
      await (await getNativeDB()).clearOutboxForTables(tableNames);
      return;
    }
    await webDB.outbox.filter((item) => tableNames.includes(item.tableName)).delete();
  },

  async getOutboxSummary(): Promise<{ total: number; pending: number; errors: number; lastError: any | null }> {
    if (isNative) {
      // @ts-ignore
      return await (await getNativeDB()).getOutboxSummary();
    }
    const [pending, errors, all] = await Promise.all([
      webDB.outbox.where('status').equals('pending').count(),
      webDB.outbox.where('status').equals('error').count(),
      webDB.outbox.count()
    ]);
    const lastError = await webDB.outbox.where('status').equals('error').reverse().first();
    return { total: all, pending, errors, lastError: lastError || null };
  }
};
