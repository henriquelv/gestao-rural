import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

const DB_NAME = 'FarmDB_Native_v1';

export class NativeFarmDatabase {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private initError: string | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  async init() {
    if (!Capacitor.isNativePlatform()) return;
    if (this.initialized && this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // Em uma recriação do WebView, a conexão nativa pode sobreviver enquanto o
        // mapa JS do plugin volta vazio. A checagem fecha apenas conexões órfãs e
        // mantém intacto o arquivo SQLite e todos os dados locais.
        await this.sqlite.checkConnectionsConsistency();
        const existing = await this.sqlite.isConnection(DB_NAME, false);
        const connection = existing?.result
          ? await this.sqlite.retrieveConnection(DB_NAME, false)
          : await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
        const open = await connection.isDBOpen();
        if (!open.result) await connection.open();
        await this.rollbackInterruptedTransaction(connection);

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
        await connection.execute(schema);
        // So exponha a conexao depois de open/schema terminarem. Assim, chamadas
        // concorrentes nunca recebem um banco parcialmente inicializado.
        this.db = connection;
        this.initialized = true;
        this.initError = null;
        console.log('SQLite Native Initialized');
      } catch (e) {
        this.db = null;
        this.initialized = false;
        this.initError = e instanceof Error ? e.message : String(e);
        console.error('Erro init SQLite', e);
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  private async ready(): Promise<SQLiteDBConnection> {
    if (!this.initialized || !this.db) await this.init();
    if (!this.initialized || !this.db) {
      throw new Error(`SQLite indisponível: ${this.initError || 'falha desconhecida'}`);
    }
    return this.db;
  }

  private serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async rollbackInterruptedTransaction(db: SQLiteDBConnection): Promise<void> {
    const active = await db.isTransactionActive();
    if (!active.result) return;
    console.warn('[SQLite] Revertendo transação interrompida por recriação do WebView.');
    await db.rollbackTransaction();
  }

  private async beginSafeTransaction(db: SQLiteDBConnection): Promise<void> {
    // Com a fila serializada, uma transação ativa aqui só pode ser sobra de uma
    // execução interrompida. Revertê-la não remove gravações já confirmadas.
    await this.rollbackInterruptedTransaction(db);
    await db.beginTransaction();
  }

  async getStatus(): Promise<{ available: boolean; error: string | null }> {
    try {
      await this.ready();
      return { available: true, error: null };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async get(tableName: string, id: string) {
    const db = await this.ready();
    const res = await db.query(`SELECT data FROM kv_store WHERE table_name = ? AND id = ?`, [tableName, id]);
    if (res?.values && res.values.length > 0) {
      try {
        return JSON.parse(res.values[0].data);
      } catch (e) {
        console.error(`Registro corrompido em ${tableName}/${id}, ignorando:`, e);
        return null;
      }
    }
    return null;
  }

  async getAll(tableName: string, orderByField?: string) {
    const db = await this.ready();
    const res = await db.query(`SELECT data FROM kv_store WHERE table_name = ?`, [tableName]);
    const items = (res?.values || []).reduce((acc: any[], v) => {
      try {
        const parsed = JSON.parse(v.data);
        if (parsed && typeof parsed === 'object') acc.push(parsed);
        else console.warn(`Registro inválido em ${tableName}, preservado no SQLite e ignorado na tela.`);
      } catch (e) {
        console.error(`Registro corrompido em ${tableName}, ignorando:`, e);
      }
      return acc;
    }, []);

    if (orderByField) {
      items.sort((a: any, b: any) => {
        const left = String(a?.[orderByField] ?? '');
        const right = String(b?.[orderByField] ?? '');
        return right.localeCompare(left);
      });
    }
    return items;
  }

  async count(tableName: string) {
    const db = await this.ready();
    const res = await db.query(`SELECT count(*) as c FROM kv_store WHERE table_name = ?`, [tableName]);
    return res.values?.[0].c || 0;
  }

  async put(tableName: string, record: any) {
    return this.serializeWrite(async () => {
      const db = await this.ready();
      const q = `INSERT OR REPLACE INTO kv_store (table_name, id, data, updated_at, synced) VALUES (?, ?, ?, ?, ?)`;
      await db.run(q, [tableName, record.id, JSON.stringify(record.data), record.updated_at, record.synced ? 1 : 0]);
    });
  }

  async bulkPut(tableName: string, records: any[]) {
    return this.serializeWrite(async () => {
      if (records.length === 0) return;
      const db = await this.ready();
      const q = `INSERT OR REPLACE INTO kv_store (table_name, id, data, updated_at, synced) VALUES (?, ?, ?, ?, ?)`;
      await this.rollbackInterruptedTransaction(db);

      // executeSet reduz centenas de travessias pela ponte WebView/Android para
      // poucos lotes atomicos. Lotes moderados evitam mensagens nativas enormes
      // quando registros possuem metadados de midia.
      const batchSize = 100;
      for (let offset = 0; offset < records.length; offset += batchSize) {
        const batch = records.slice(offset, offset + batchSize).map((record) => ({
          statement: q,
          values: [tableName, record.id, JSON.stringify(record.data), record.updated_at, record.synced ? 1 : 0]
        }));
        await db.executeSet(batch, true);
      }
    });
  }

  async delete(tableName: string, id: string) {
    return this.serializeWrite(async () => {
      const db = await this.ready();
      await db.run(`DELETE FROM kv_store WHERE table_name = ? AND id = ?`, [tableName, id]);
    });
  }

  async addToOutbox(item: any) {
    return this.serializeWrite(async () => {
      const db = await this.ready();
      await db.run(`INSERT INTO outbox (table_name, op, payload, created_at, status) VALUES (?, ?, ?, ?, ?)`, [
        item.tableName,
        item.op,
        JSON.stringify(item.payload),
        item.created_at,
        'pending'
      ]);
    });
  }

  async putWithOutbox(tableName: string, record: any, item: any) {
    return this.serializeWrite(async () => {
      const db = await this.ready();
      const recordQuery = `INSERT OR REPLACE INTO kv_store (table_name, id, data, updated_at, synced) VALUES (?, ?, ?, ?, ?)`;
      await this.beginSafeTransaction(db);
      try {
        await db.run(recordQuery, [tableName, record.id, JSON.stringify(record.data), record.updated_at, record.synced ? 1 : 0], false);
        await db.run(`INSERT INTO outbox (table_name, op, payload, created_at, status) VALUES (?, ?, ?, ?, ?)`, [
          item.tableName, item.op, JSON.stringify(item.payload), item.created_at, 'pending'
        ], false);
        await db.commitTransaction();
      } catch (error) {
        try { await db.rollbackTransaction(); } catch { /* preserve original failure */ }
        throw error;
      }
    });
  }

  async deleteWithOutbox(tableName: string, id: string, item: any) {
    return this.serializeWrite(async () => {
      const db = await this.ready();
      await this.beginSafeTransaction(db);
      try {
        await db.run(`DELETE FROM kv_store WHERE table_name = ? AND id = ?`, [tableName, id], false);
        await db.run(`INSERT INTO outbox (table_name, op, payload, created_at, status) VALUES (?, ?, ?, ?, ?)`, [
          item.tableName, item.op, JSON.stringify(item.payload), item.created_at, 'pending'
        ], false);
        await db.commitTransaction();
      } catch (error) {
        try { await db.rollbackTransaction(); } catch { /* preserve original failure */ }
        throw error;
      }
    });
  }

  async getPendingOutbox() {
    const db = await this.ready();
    const res = await db.query(`SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at ASC`);
    return (res?.values || []).map((v: any) => {
      try {
        return { ...v, payload: JSON.parse(v.payload), tableName: v.table_name };
      } catch (e) {
        console.error(`Outbox ${v.id} possui payload corrompido e foi preservado para diagnóstico.`);
        return {
          ...v,
          payload: null,
          tableName: v.table_name,
          payloadParseError: 'Payload local corrompido'
        };
      }
    });
  }

  async getOutboxErrors(limit: number = 50) {
    const db = await this.ready();
    const res = await db.query(
      `SELECT * FROM outbox WHERE status = 'error' ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
    return (res?.values || []).map((v: any) => {
      try {
        return { ...v, payload: JSON.parse(v.payload), tableName: v.table_name, errorMessage: v.error_message };
      } catch (e) {
        console.error(`Erro do outbox ${v.id} possui payload corrompido e foi preservado para diagnóstico.`);
        return {
          ...v,
          payload: null,
          tableName: v.table_name,
          errorMessage: v.error_message,
          payloadParseError: 'Payload local corrompido'
        };
      }
    });
  }

  async markOutboxDone(id: number) {
    return this.serializeWrite(async () => {
      const db = await this.ready();
      await db.run(`DELETE FROM outbox WHERE id = ?`, [id]);
    });
  }

  async markOutboxError(id: number, error: string) {
    return this.serializeWrite(async () => {
      const db = await this.ready();
      await db.run(`UPDATE outbox SET status = 'error', error_message = ? WHERE id = ?`, [error, id]);
    });
  }

  async updateOutboxPayload(id: number, payload: any) {
    return this.serializeWrite(async () => {
      const db = await this.ready();
      await db.run(`UPDATE outbox SET payload = ? WHERE id = ?`, [JSON.stringify(payload), id]);
    });
  }

  async retryOutboxItem(id: number) {
    return this.serializeWrite(async () => {
      const db = await this.ready();
      await db.run(`UPDATE outbox SET status = 'pending', error_message = NULL WHERE id = ?`, [id]);
    });
  }

  async retryAllOutboxErrors() {
    return this.serializeWrite(async () => {
      const db = await this.ready();
      await db.run(`UPDATE outbox SET status = 'pending', error_message = NULL WHERE status = 'error'`);
    });
  }

  async getRawById(tableName: string, id: string): Promise<{ id: string; synced: boolean; data: any } | null> {
    const db = await this.ready();
    const res = await db.query(
      `SELECT id, data, synced FROM kv_store WHERE table_name = ? AND id = ?`,
      [tableName, id]
    );
    if (res?.values && res.values.length > 0) {
      const row = res.values[0];
      try {
        return { id: row.id, synced: row.synced === 1, data: JSON.parse(row.data) };
      } catch {
        return null;
      }
    }
    return null;
  }

  async getUnsyncedRawRecords(tableName: string): Promise<{ id: string; data: any }[]> {
    const db = await this.ready();
    const res = await db.query(
      `SELECT id, data FROM kv_store WHERE table_name = ? AND synced = 0`,
      [tableName]
    );
    return (res?.values || []).reduce((acc: { id: string; data: any }[], v) => {
      try {
        acc.push({ id: v.id, data: JSON.parse(v.data) });
      } catch (e) {
        console.error(`Erro ao parsear registro órfão ${tableName}/${v.id}:`, e);
      }
      return acc;
    }, []);
  }

  async getOutboxSummary(): Promise<{ total: number; pending: number; errors: number; lastError: any | null }> {
    const db = await this.ready();
    const counts = await db.query(
      `SELECT status, count(*) as c FROM outbox GROUP BY status`
    );
    const totalRes = await db.query(`SELECT count(*) as c FROM outbox`);
    const lastErrorRes = await db.query(
      `SELECT * FROM outbox WHERE status = 'error' ORDER BY created_at DESC LIMIT 1`
    );

    let pending = 0;
    let errors = 0;
    for (const row of counts?.values || []) {
      if (row.status === 'pending') pending = Number(row.c || 0);
      if (row.status === 'error') errors = Number(row.c || 0);
    }

    const rawLast = lastErrorRes?.values?.[0] || null;
    let lastError = rawLast;
    if (rawLast?.payload) {
      try {
        lastError = { ...rawLast, payload: JSON.parse(rawLast.payload), tableName: rawLast.table_name, errorMessage: rawLast.error_message };
      } catch {
        lastError = { ...rawLast, tableName: rawLast.table_name, errorMessage: rawLast.error_message };
      }
    }

    return {
      total: Number(totalRes?.values?.[0]?.c || 0),
      pending,
      errors,
      lastError
    };
  }
}

export const nativeDB = new NativeFarmDatabase();
