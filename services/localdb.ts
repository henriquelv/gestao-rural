import { Capacitor } from '@capacitor/core';
import { webDB, LocalRecord } from './localdb.web';
import { nativeDB } from './localdb.native';

type ChangeCallback = (tableName: string) => void | Promise<void>;
const _listeners: Record<string, Set<ChangeCallback>> = {};
const _pendingNotifications = new Set<string>();
const _scheduledNotifications = new Set<string>();

const notifyChange = (tableName: string) => {
  _pendingNotifications.add(tableName);
  if (_scheduledNotifications.has(tableName)) return;
  _scheduledNotifications.add(tableName);
  const schedule = typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (callback: () => void) => { void Promise.resolve().then(callback); };
  schedule(() => {
    _scheduledNotifications.delete(tableName);
    if (!_pendingNotifications.delete(tableName)) return;
    const listeners = _listeners[tableName];
    if (!listeners) return;
    for (const cb of Array.from(listeners)) {
      try {
        Promise.resolve(cb(tableName)).catch((error) => {
          console.error(`listener error in ${tableName}`, error);
        });
      } catch (error) {
        console.error(`listener error in ${tableName}`, error);
      }
    }
  });
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
    let data = records
      .map((r: LocalRecord) => r?.data)
      .filter((value: unknown) => !!value && typeof value === 'object');
    if (orderBy) {
      data.sort((a: any, b: any) => {
        const left = String(a?.[orderBy] ?? '');
        const right = String(b?.[orderBy] ?? '');
        return right.localeCompare(left);
      });
    }
    return data;
  },

  async getById<T>(tableName: string, id: string): Promise<T | null> {
    if (isNative) {
      return await nativeDB.get(tableName, id);
    }
    // @ts-ignore
    const record = await webDB[tableName]?.get(id);
    return record ? record.data : null;
  },

  async getRawById(tableName: string, id: string): Promise<{ id: string; synced: boolean; data: any } | null> {
    if (isNative) {
      return await nativeDB.getRawById(tableName, id);
    }
    // @ts-ignore
    const record = await webDB[tableName]?.get(id);
    if (!record) return null;
    return { id: record.id, synced: !!record.synced, data: record.data };
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

  async putWithOutbox(tableName: string, record: LocalRecord, item: any): Promise<void> {
    if (isNative) {
      await nativeDB.putWithOutbox(tableName, record, item);
      notifyChange(tableName);
      return;
    }
    // @ts-ignore
    await webDB.transaction('rw', webDB[tableName], webDB.outbox, async () => {
      // @ts-ignore
      await webDB[tableName].put(record);
      await webDB.outbox.add(item);
    });
    notifyChange(tableName);
  },

  async deleteWithOutbox(tableName: string, id: string, item: any): Promise<void> {
    if (isNative) {
      await nativeDB.deleteWithOutbox(tableName, id, item);
      notifyChange(tableName);
      return;
    }
    // @ts-ignore
    await webDB.transaction('rw', webDB[tableName], webDB.outbox, async () => {
      // @ts-ignore
      await webDB[tableName].delete(id);
      await webDB.outbox.add(item);
    });
    notifyChange(tableName);
  },

  async bulkPut(tableName: string, records: LocalRecord[]): Promise<void> {
    if (isNative) {
      await nativeDB.bulkPut(tableName, records);
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

  async updateOutboxPayload(id: number, payload: any): Promise<void> {
    if (isNative) {
      // @ts-ignore
      await nativeDB.updateOutboxPayload(id, payload);
      return;
    }
    await webDB.outbox.update(id, { payload });
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
  },

  async getOutboxSummary(): Promise<{ total: number; pending: number; errors: number; lastError: any | null }> {
    if (isNative) {
      // @ts-ignore
      return await nativeDB.getOutboxSummary();
    }
    const [pending, errors, all] = await Promise.all([
      webDB.outbox.where('status').equals('pending').count(),
      webDB.outbox.where('status').equals('error').count(),
      webDB.outbox.count()
    ]);
    const lastError = await webDB.outbox.where('status').equals('error').reverse().first();
    return { total: all, pending, errors, lastError: lastError || null };
  },

  async getNativeStatus(): Promise<{ available: boolean; error: string | null } | null> {
    if (!isNative) return null;
    return nativeDB.getStatus();
  }
};
