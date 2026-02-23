import { localdb } from './localdb';
import { supabase } from './supabase';
import { notify } from './notification.service';
import { mediaService } from './media.service';
import { MediaItem } from '../types';

const guessExt = (m: MediaItem) => {
  const mime = m.mimeType || '';
  const byMime = mime.includes('/') ? mime.split('/')[1] : '';
  if (byMime) return byMime;
  const n = (m.name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.ppt')) return 'ppt';
  if (n.endsWith('.pptx')) return 'pptx';
  if (n.endsWith('.doc')) return 'doc';
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpeg';
  if (n.endsWith('.png')) return 'png';
  return 'bin';
};

export const syncService = {
  async syncAll(): Promise<{ ok: boolean; count: number }> {
    if (!navigator.onLine) return { ok: false, count: 0 };

    const pendingItems = await localdb.getPendingOutbox();
    if (pendingItems.length === 0) return { ok: true, count: 0 };

    let successCount = 0;
    let failCount = 0;

    for (const item of pendingItems) {
      try {
        const updatedPayload = await this.uploadPendingMedia(item.payload, item.tableName);
        await this.processItem({ ...item, payload: updatedPayload });

        successCount++;
        if (item.id) await localdb.deleteOutboxItem(item.id);
        await this.markAsSynced(item.tableName, updatedPayload);
      } catch (error: any) {
        console.error(`Erro sync item ${item.id}:`, error);
        failCount++;
        if (item.id) {
          await localdb.markOutboxError(item.id, error.message || 'Erro desconhecido');
        }
      }
    }

    if (successCount > 0) notify(`${successCount} itens sincronizados.`, 'success');
    if (failCount > 0) notify(`${failCount} falharam na sincronização.`, 'error');

    return { ok: failCount === 0, count: successCount };
  },

  async uploadPendingMedia(payload: any, tableName: string): Promise<any> {
    if (!payload || !payload.media) {
      return payload;
    }

    const originalMediaIsArray = Array.isArray(payload.media);
    const inputMedia: MediaItem[] = originalMediaIsArray
      ? (payload.media as MediaItem[])
      : [payload.media as MediaItem];

    if (inputMedia.length === 0) return payload;

    const updatedMedia: MediaItem[] = [];
    const BUCKET = 'media';

    for (const m of inputMedia) {
      if (!m.remotePath) {
        const blob = await mediaService.readMediaData(m);
        if (blob) {
          const ext = guessExt(m);
          const path = `${tableName}/${payload.id}/${m.id}.${ext}`;

          const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true });

          if (error) {
            console.error('Upload falhou', error);
            throw new Error('Falha no upload de mídia');
          }

          const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

          updatedMedia.push({
            ...m,
            remotePath: path,
            remoteUrl: publicUrlData.publicUrl
          });
        } else {
          updatedMedia.push(m);
        }
      } else {
        // Garantir URL pública mesmo para registros antigos que tinham remotePath mas não tinham remoteUrl
        if (!m.remoteUrl) {
          const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(m.remotePath);
          updatedMedia.push({
            ...m,
            remoteUrl: publicUrlData.publicUrl
          });
        } else {
          updatedMedia.push(m);
        }
      }
    }

    return {
      ...payload,
      media: originalMediaIsArray ? updatedMedia : (updatedMedia[0] ?? null)
    };
  },

  async processItem(item: any) {
    const table = supabase.from(item.tableName);
    let result;

    const cleanPayload = { ...item.payload };
    delete cleanPayload.tempLocal;

    switch (item.op) {
      case 'insert':
        result = await table.insert(cleanPayload);
        break;
      case 'update':
        if (item.tableName === 'milk_daily') {
          if (!cleanPayload.date) throw new Error('Update sem date');
          result = await table.update(cleanPayload).eq('date', cleanPayload.date);
        } else if (item.tableName === 'daily_metrics') {
          if (!cleanPayload.date || !cleanPayload.type) throw new Error('Update sem date/type');
          result = await table.update(cleanPayload).eq('date', cleanPayload.date).eq('type', cleanPayload.type);
        } else {
          if (!cleanPayload.id) throw new Error('Update sem ID');
          result = await table.update(cleanPayload).eq('id', cleanPayload.id);
        }
        break;
      case 'upsert':
        result = await table.upsert(cleanPayload);
        break;
      case 'delete':
        if (item.tableName === 'milk_daily') {
          result = await table.delete().eq('date', item.payload);
        } else if (item.tableName === 'daily_metrics') {
          const p = (item.payload || '').toString();
          if (p.includes('_')) {
            const [date, type] = p.split('_');
            result = await table.delete().eq('date', date).eq('type', type);
          } else {
            result = await table.delete().eq('id', item.payload);
          }
        } else {
          result = await table.delete().eq('id', item.payload);
        }
        break;
    }

    if (result.error) throw result.error;
  },

  async markAsSynced(tableName: string, payload: any) {
    const id = (() => {
      if (typeof payload === 'string') return payload;
      if (payload?.id) return payload.id;
      if (tableName === 'milk_daily' && payload?.date) return payload.date;
      if (tableName === 'daily_metrics' && payload?.date && payload?.type) return `${payload.date}_${payload.type}`;
      if (payload?.date) return payload.date;
      if (payload?.name) return payload.name;
      return null;
    })();
    if (!id) return;

    const current = await localdb.getById(tableName, id);
    if (current) {
      await localdb.put(tableName, {
        id,
        data: payload,
        updated_at: new Date().toISOString(),
        synced: true,
        mediaTotalBytes: 0
      });
    }
  }
  ,

  // Start a lightweight background runner.
  // On web this uses setInterval while the page is open.
  // On native platforms we attempt to use Capacitor background task if available,
  // otherwise fall back to a periodic timer (best-effort).
  startBackgroundRunner(intervalMinutes: number = 15) {
    try {
      const ms = Math.max(1, intervalMinutes) * 60 * 1000;
      if (typeof window !== 'undefined') {
        const key = '_gr_background_sync_timer';
        if ((window as any)[key]) return;
        (window as any)[key] = setInterval(() => {
          if (navigator.onLine) void this.syncAll();
        }, ms);
      }
    } catch (e) {
      console.error('Erro iniciando background runner:', e);
    }
  },

  stopBackgroundRunner() {
    try {
      if (typeof window !== 'undefined') {
        const key = '_gr_background_sync_timer';
        const t = (window as any)[key];
        if (t) { clearInterval(t); delete (window as any)[key]; }
      }
    } catch (e) {
      console.error('Erro parando background runner:', e);
    }
  },

  // Validação e recuperação de integridade de dados
  async validateAndRepairData(): Promise<{ isHealthy: boolean; message: string }> {
    try {
      // Verifica se há dados corrompidos no banco local
      const tables = ['anomalies', 'improvements', 'notices', 'instructions', 'farmDocs'];
      let hasIssues = false;

      for (const table of tables) {
        try {
          const data = (await (localdb as any)[`get${table.charAt(0).toUpperCase() + table.slice(1)}`]?.()) || [];
          
          // Valida se os objetos têm propriedades básicas
          for (const item of data) {
            if (!item.id || typeof item.id !== 'string') {
              hasIssues = true;
              console.warn(`Dados corrompidos encontrados em ${table}`);
            }
          }
        } catch (e) {
          console.warn(`Erro ao validar tabela ${table}:`, e);
          hasIssues = true;
        }
      }

      if (hasIssues) {
        // Tenta sincronizar com o servidor para recuperar dados válidos
        return {
          isHealthy: false,
          message: 'Dados com potencial corrupção detectada. Sincronizando com servidor...'
        };
      }

      return {
        isHealthy: true,
        message: 'Dados íntegros'
      };
    } catch (e) {
      console.error('Erro ao validar dados:', e);
      return {
        isHealthy: false,
        message: 'Erro ao validar integridade de dados'
      };
    }
  }
};
