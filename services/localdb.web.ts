import Dexie, { Table } from 'dexie';

export interface LocalRecord {
  id: string;
  data: any;
  updated_at: string;
  synced: boolean;
  mediaTotalBytes?: number;
}

export interface MediaBlobRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: string;
}

export interface OutboxItem {
  id?: number;
  tableName: string;
  op: 'insert' | 'update' | 'delete' | 'upsert';
  payload: any;
  created_at: string;
  status: 'pending' | 'done' | 'error';
  errorMessage?: string;
}

export class WebFarmDatabase extends Dexie {
  settings!: Table<LocalRecord>;
  ui_config!: Table<LocalRecord>;
  employees!: Table<LocalRecord>;
  sectors!: Table<LocalRecord>;
  anomalies!: Table<LocalRecord>;
  instructions!: Table<LocalRecord>;
  notices!: Table<LocalRecord>;
  improvements!: Table<LocalRecord>;
  farm_docs!: Table<LocalRecord>;
  daily_metrics!: Table<LocalRecord>;
  milk_daily!: Table<LocalRecord>;
  outbox!: Table<OutboxItem>;
  media_blobs!: Table<MediaBlobRecord>;

  constructor() {
    super('FarmDB_Web_v3');
    (this as any).version(1).stores({
      settings: 'id, synced, updated_at',
      ui_config: 'id, synced, updated_at',
      employees: 'id, synced, updated_at',
      sectors: 'id, synced, updated_at',
      anomalies: 'id, synced, updated_at',
      instructions: 'id, synced, updated_at',
      notices: 'id, synced, updated_at',
      improvements: 'id, synced, updated_at',
      farm_docs: 'id, synced, updated_at',
      daily_metrics: 'id, synced, updated_at',
      milk_daily: 'id, synced, updated_at',
      outbox: '++id, status, created_at',
      media_blobs: 'id'
    });
  }
}

export const webDB = new WebFarmDatabase();
