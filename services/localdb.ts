import { Capacitor } from '@capacitor/core';
import { webDB, LocalRecord } from './localdb.web';
import { nativeDB } from './localdb.native';

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

if (isNative) {
  nativeDB.init();
}

export const localdb = {
  async getAll<T>(tableName: string, orderBy?: string): Promise<T[]> {
    if (isNative) {
      return await nativeDB.getAll(tableName, orderBy);
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
      return await nativeDB.get(tableName, id);
    }
    // @ts-ignore
    const record = await webDB[tableName].get(id);
    return record ? record.data : null;
  },

  async count(tableName: string): Promise<number> {
    if (isNative) {
      return await nativeDB.count(tableName);
    }
    // @ts-ignore
    return await webDB[tableName].count();
  },

  async put(tableName: string, record: LocalRecord): Promise<void> {
    if (isNative) {
      await nativeDB.put(tableName, record);
      notifyChange(tableName);
      return;
    }
    // @ts-ignore
    await webDB[tableName].put(record);
    notifyChange(tableName);
  },

  async bulkPut(tableName: string, records: LocalRecord[]): Promise<void> {
    if (isNative) {
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
      await nativeDB.delete(tableName, id);
      notifyChange(tableName);
      return;
    }
    // @ts-ignore
    await webDB[tableName].delete(id);
    notifyChange(tableName);
  },

  // Retorna registros com synced=false — usado para recuperar órfãos ao iniciar
  async getUnsyncedRawRecords(tableName: string): Promise<{ id: string; data: any }[]> {
    if (isNative) {
      return await nativeDB.getUnsyncedRawRecords(tableName);
    }
    // @ts-ignore
    const table = webDB[tableName];
    if (!table) return [];
    const records = await table.where('synced').equals(0).toArray();
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
      await nativeDB.addToOutbox(item);
      return;
    }
    await webDB.outbox.add(item);
  },

  async getPendingOutbox(): Promise<any[]> {
    if (isNative) {
      return await nativeDB.getPendingOutbox();
    }
    return await webDB.outbox.where('status').equals('pending').sortBy('created_at');
  },

  async getOutboxErrors(limit: number = 50): Promise<any[]> {
    if (isNative) {
      // @ts-ignore
      return await nativeDB.getOutboxErrors(limit);
    }
    return await webDB.outbox.where('status').equals('error').reverse().limit(limit).toArray();
  },

  async deleteOutboxItem(id: number): Promise<void> {
    if (isNative) {
      await nativeDB.markOutboxDone(id);
      return;
    }
    await webDB.outbox.delete(id);
  },

  async markOutboxError(id: number, msg: string): Promise<void> {
    if (isNative) {
      await nativeDB.markOutboxError(id, msg);
      return;
    }
    await webDB.outbox.update(id, { status: 'error', errorMessage: msg });
  },

  async retryOutboxItem(id: number): Promise<void> {
    if (isNative) {
      // @ts-ignore
      await nativeDB.retryOutboxItem(id);
      return;
    }
    await webDB.outbox.update(id, { status: 'pending', errorMessage: undefined });
  },

  async retryAllOutboxErrors(): Promise<void> {
    if (isNative) {
      // @ts-ignore
      await nativeDB.retryAllOutboxErrors();
      return;
    }
    const errs = await webDB.outbox.where('status').equals('error').toArray();
    await Promise.all(errs.map((e) => webDB.outbox.update(e.id as number, { status: 'pending', errorMessage: undefined })));
  }
};
