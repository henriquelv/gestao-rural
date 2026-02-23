import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

const DB_NAME = 'FarmDB_Native_v1';

class NativeFarmDatabase {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  async init() {
    if (!Capacitor.isNativePlatform()) return;

    try {
      this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
      await this.db.open();

      const schema = `
            CREATE TABLE IF NOT EXISTS kv_store (
                table_name TEXT,
                id TEXT,
                data TEXT,
                updated_at TEXT,
                synced INTEGER,
                PRIMARY KEY (table_name, id)
            );

            CREATE TABLE IF NOT EXISTS outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT,
                op TEXT,
                payload TEXT,
                created_at TEXT,
                status TEXT,
                error_message TEXT
            );
        `;
      await this.db.execute(schema);
      console.log('SQLite Native Initialized');
    } catch (e) {
      console.error('Erro init SQLite', e);
    }
  }

  async get(tableName: string, id: string) {
    if (!this.db) await this.init();
    const res = await this.db?.query(`SELECT data FROM kv_store WHERE table_name = ? AND id = ?`, [tableName, id]);
    if (res?.values && res.values.length > 0) {
      return JSON.parse(res.values[0].data);
    }
    return null;
  }

  async getAll(tableName: string, orderByField?: string) {
    if (!this.db) await this.init();
    const res = await this.db?.query(`SELECT data FROM kv_store WHERE table_name = ?`, [tableName]);
    const items = res?.values?.map((v) => JSON.parse(v.data)) || [];

    if (orderByField) {
      items.sort((a: any, b: any) => (a[orderByField] > b[orderByField] ? -1 : 1));
    }
    return items;
  }

  async count(tableName: string) {
    if (!this.db) await this.init();
    const res = await this.db?.query(`SELECT count(*) as c FROM kv_store WHERE table_name = ?`, [tableName]);
    return res?.values?.[0].c || 0;
  }

  async put(tableName: string, record: any) {
    if (!this.db) await this.init();
    const q = `INSERT OR REPLACE INTO kv_store (table_name, id, data, updated_at, synced) VALUES (?, ?, ?, ?, ?)`;
    await this.db?.run(q, [tableName, record.id, JSON.stringify(record.data), record.updated_at, record.synced ? 1 : 0]);
  }

  async delete(tableName: string, id: string) {
    if (!this.db) await this.init();
    await this.db?.run(`DELETE FROM kv_store WHERE table_name = ? AND id = ?`, [tableName, id]);
  }

  async addToOutbox(item: any) {
    if (!this.db) await this.init();
    await this.db?.run(`INSERT INTO outbox (table_name, op, payload, created_at, status) VALUES (?, ?, ?, ?, ?)`, [
      item.tableName,
      item.op,
      JSON.stringify(item.payload),
      item.created_at,
      'pending'
    ]);
  }

  async getPendingOutbox() {
    if (!this.db) await this.init();
    const res = await this.db?.query(`SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at ASC`);
    return (
      res?.values?.map((v) => ({
        ...v,
        payload: JSON.parse(v.payload),
        tableName: v.table_name
      })) || []
    );
  }

  async getOutboxErrors(limit: number = 50) {
    if (!this.db) await this.init();
    const res = await this.db?.query(
      `SELECT * FROM outbox WHERE status = 'error' ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
    return (
      res?.values?.map((v) => ({
        ...v,
        payload: JSON.parse(v.payload),
        tableName: v.table_name,
        errorMessage: v.error_message
      })) || []
    );
  }

  async markOutboxDone(id: number) {
    if (!this.db) await this.init();
    await this.db?.run(`DELETE FROM outbox WHERE id = ?`, [id]);
  }

  async markOutboxError(id: number, error: string) {
    if (!this.db) await this.init();
    await this.db?.run(`UPDATE outbox SET status = 'error', error_message = ? WHERE id = ?`, [error, id]);
  }

  async retryOutboxItem(id: number) {
    if (!this.db) await this.init();
    await this.db?.run(`UPDATE outbox SET status = 'pending', error_message = NULL WHERE id = ?`, [id]);
  }

  async retryAllOutboxErrors() {
    if (!this.db) await this.init();
    await this.db?.run(`UPDATE outbox SET status = 'pending', error_message = NULL WHERE status = 'error'`);
  }
}

export const nativeDB = new NativeFarmDatabase();
