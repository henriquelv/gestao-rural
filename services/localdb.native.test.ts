import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredRecord = { data: string; synced: number };
type OutboxRecord = { id: number; table_name: string; status: string; payload: string };

const mockState = vi.hoisted(() => ({
  connectionChecks: 0,
  createCalls: 0,
  retrieveCalls: 0,
  openCalls: 0,
  schemaCalls: 0,
  rollbackCalls: 0,
  hasConnection: false,
  open: false,
  transactionActive: false,
  transactionOps: [] as Array<() => void>,
  records: new Map<string, StoredRecord>(),
  outbox: [] as OutboxRecord[],
  nextOutboxId: 1,
  failNextOutbox: false
}));

const resetMockState = () => {
  mockState.connectionChecks = 0;
  mockState.createCalls = 0;
  mockState.retrieveCalls = 0;
  mockState.openCalls = 0;
  mockState.schemaCalls = 0;
  mockState.rollbackCalls = 0;
  mockState.hasConnection = false;
  mockState.open = false;
  mockState.transactionActive = false;
  mockState.transactionOps = [];
  mockState.records.clear();
  mockState.outbox = [];
  mockState.nextOutboxId = 1;
  mockState.failNextOutbox = false;
};

const connection = {
  isDBOpen: vi.fn(async () => ({ result: mockState.open })),
  open: vi.fn(async () => {
    mockState.openCalls += 1;
    mockState.open = true;
  }),
  execute: vi.fn(async () => {
    mockState.schemaCalls += 1;
  }),
  isTransactionActive: vi.fn(async () => ({ result: mockState.transactionActive })),
  beginTransaction: vi.fn(async () => {
    mockState.transactionActive = true;
    mockState.transactionOps = [];
  }),
  commitTransaction: vi.fn(async () => {
    const operations = [...mockState.transactionOps];
    mockState.transactionOps = [];
    for (const operation of operations) operation();
    mockState.transactionActive = false;
  }),
  rollbackTransaction: vi.fn(async () => {
    mockState.rollbackCalls += 1;
    mockState.transactionOps = [];
    mockState.transactionActive = false;
  }),
  run: vi.fn(async (query: string, values: any[], transaction = true) => {
    if (query.startsWith('INSERT INTO outbox') && mockState.failNextOutbox) {
      mockState.failNextOutbox = false;
      throw new Error('falha simulada no outbox');
    }

    const operation = () => {
      if (query.startsWith('INSERT OR REPLACE INTO kv_store')) {
        mockState.records.set(`${values[0]}|${values[1]}`, { data: values[2], synced: values[4] });
      } else if (query.startsWith('INSERT INTO outbox')) {
        mockState.outbox.push({
          id: mockState.nextOutboxId++,
          table_name: values[0],
          status: values[4],
          payload: values[2]
        });
      }
    };

    if (mockState.transactionActive && transaction === false) mockState.transactionOps.push(operation);
    else operation();
    return { changes: { changes: 1 } };
  }),
  executeSet: vi.fn(async (set: Array<{ values: any[] }>) => {
    for (const item of set) {
      const values = item.values;
      mockState.records.set(`${values[0]}|${values[1]}`, { data: values[2], synced: values[4] });
    }
  }),
  query: vi.fn(async (query: string, values: any[] = []) => {
    if (query.startsWith('SELECT data FROM kv_store')) {
      const record = mockState.records.get(`${values[0]}|${values[1]}`);
      return { values: record ? [{ data: record.data }] : [] };
    }
    if (query.startsWith('SELECT count(*) as c FROM kv_store')) {
      const prefix = `${values[0]}|`;
      const count = [...mockState.records.keys()].filter((key) => key.startsWith(prefix)).length;
      return { values: [{ c: count }] };
    }
    if (query.startsWith('SELECT status, count(*) as c FROM outbox')) {
      const counts = new Map<string, number>();
      for (const row of mockState.outbox) counts.set(row.status, (counts.get(row.status) || 0) + 1);
      return { values: [...counts].map(([status, c]) => ({ status, c })) };
    }
    if (query.startsWith('SELECT count(*) as c FROM outbox')) {
      return { values: [{ c: mockState.outbox.length }] };
    }
    if (query.startsWith("SELECT * FROM outbox WHERE status = 'error'")) return { values: [] };
    return { values: [] };
  })
};

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true }
}));

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class SQLiteConnection {
    async checkConnectionsConsistency() {
      mockState.connectionChecks += 1;
      return { result: true };
    }

    async isConnection() {
      return { result: mockState.hasConnection };
    }

    async createConnection() {
      mockState.createCalls += 1;
      mockState.hasConnection = true;
      return connection;
    }

    async retrieveConnection() {
      mockState.retrieveCalls += 1;
      return connection;
    }
  }
}));

import { NativeFarmDatabase } from './localdb.native';

describe('SQLite nativo sob concorrencia e interrupcao', () => {
  beforeEach(() => {
    resetMockState();
    vi.clearAllMocks();
  });

  it('inicializa uma vez e preserva registro + outbox em 250 gravacoes concorrentes', async () => {
    const database = new NativeFarmDatabase();
    const writes = Array.from({ length: 250 }, (_, index) => database.putWithOutbox(
      'anomalies',
      {
        id: `anomaly-${index}`,
        data: { id: `anomaly-${index}`, description: `Registro ${index}` },
        updated_at: '2026-08-30T00:00:00.000Z',
        synced: false
      },
      {
        tableName: 'anomalies',
        op: 'upsert',
        payload: { id: `anomaly-${index}`, description: `Registro ${index}` },
        created_at: '2026-08-30T00:00:00.000Z'
      }
    ));

    await Promise.all(writes);

    expect(await database.count('anomalies')).toBe(250);
    expect((await database.getOutboxSummary()).pending).toBe(250);
    expect(mockState.createCalls).toBe(1);
    expect(mockState.openCalls).toBe(1);
    expect(mockState.schemaCalls).toBe(1);
    expect(mockState.transactionActive).toBe(false);
  });

  it('reverte a gravacao inteira quando o outbox falha antes do commit', async () => {
    const database = new NativeFarmDatabase();
    mockState.failNextOutbox = true;

    await expect(database.putWithOutbox(
      'milk_daily',
      {
        id: 'farm-1_2026-08-30',
        data: { farm_id: 'farm-1', date: '2026-08-30', liters: 100 },
        updated_at: '2026-08-30T00:00:00.000Z',
        synced: false
      },
      {
        tableName: 'milk_daily',
        op: 'upsert',
        payload: { farm_id: 'farm-1', date: '2026-08-30', liters: 100 },
        created_at: '2026-08-30T00:00:00.000Z'
      }
    )).rejects.toThrow('falha simulada no outbox');

    expect(await database.get('milk_daily', 'farm-1_2026-08-30')).toBeNull();
    expect((await database.getOutboxSummary()).total).toBe(0);
    expect(mockState.rollbackCalls).toBe(1);
  });

  it('reverte uma transacao interrompida antes de publicar a conexao', async () => {
    const database = new NativeFarmDatabase();
    mockState.transactionActive = true;

    await database.init();

    expect(mockState.rollbackCalls).toBe(1);
    expect(mockState.transactionActive).toBe(false);
    expect(await database.getStatus()).toEqual({ available: true, error: null });
  });
});
