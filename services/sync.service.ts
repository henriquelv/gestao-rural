import { localdb } from './localdb';
import { supabase } from './supabase';
import { notify } from './notification.service';
import { mediaService } from './media.service';
import { db } from './db.service';
import { MediaItem } from '../types';
import { activationService } from './activation.service';
import { farmContextService } from './farm-context.service';

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

const isMissingConflictConstraint = (error: any): boolean => {
  const msg = String(error?.message || '').toLowerCase();
  return error?.code === '42P10' || msg.includes('no unique or exclusion constraint');
};

const upsertWithConflictFallback = async (
  table: any,
  payload: any,
  conflicts: string[] = []
) => {
  for (const onConflict of conflicts) {
    const result = await table.upsert(payload, { onConflict });
    if (!result.error || !isMissingConflictConstraint(result.error)) {
      return result;
    }
  }
  return table.upsert(payload);
};

const getConflictTargets = (tableName: string): string[] => {
  switch (tableName) {
    case 'sectors':
      return ['farm_id,name', 'name'];
    case 'milk_daily':
      return ['farm_id,date', 'date'];
    case 'daily_metrics':
      return ['farm_id,date,type', 'date,type'];
    case 'farm_monthly_stats':
      return ['farm_id,"monthKey"', '"monthKey"'];
    case 'settings':
    case 'farm_settings':
    case 'ui_config':
      return ['farm_id,id', 'id'];
    default:
      return ['id'];
  }
};

const getLocalRecordId = (tableName: string, payload: any): string | null => {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return null;

  if (tableName === 'ui_config' || tableName === 'settings' || tableName === 'farm_settings') {
    const id = payload.id ?? '1';
    return payload.farm_id ? `${payload.farm_id}_${id}` : String(id);
  }
  if (tableName === 'sectors') {
    const name = payload.name ?? payload.id;
    if (!name) return null;
    return payload.farm_id ? `${payload.farm_id}_${name}` : String(name);
  }
  if (tableName === 'milk_daily' && payload.date) {
    return payload.farm_id ? `${payload.farm_id}_${payload.date}` : payload.date;
  }
  if (tableName === 'daily_metrics' && payload.date && payload.type) {
    return payload.farm_id ? `${payload.farm_id}_${payload.date}_${payload.type}` : `${payload.date}_${payload.type}`;
  }
  if (tableName === 'farm_monthly_stats' && payload.monthKey) {
    return payload.farm_id ? `${payload.farm_id}_${payload.monthKey}` : payload.monthKey;
  }
  if (payload.id) return String(payload.id);
  if (payload.date) return String(payload.date);
  if (payload.name) return String(payload.name);
  return null;
};

export const syncService = {
  _isSyncing: false,

  log(message: string, detail?: any): void {
    try {
      const key = 'sync_diagnostic_logs_v1';
      const current = JSON.parse(localStorage.getItem(key) || '[]');
      current.push({
        at: new Date().toISOString(),
        message,
        detail: detail ? JSON.stringify(detail).slice(0, 1200) : undefined
      });
      localStorage.setItem(key, JSON.stringify(current.slice(-80)));
    } catch {
      // ignore diagnostic log failures
    }
  },

  repairPayloadContext(payload: any, tableName: string): any {
    if (!payload || typeof payload !== 'object') return payload;
    const farmScoped = ['employees', 'anomalies', 'instructions', 'notices', 'improvements', 'farm_docs', 'milk_daily', 'daily_metrics', 'farm_monthly_stats', 'sectors', 'settings', 'farm_settings'];
    const metadataTables = ['anomalies', 'instructions', 'notices', 'improvements', 'farm_docs', 'milk_daily', 'daily_metrics', 'farm_monthly_stats'];
    if (!farmScoped.includes(tableName)) return payload;

    const ctx = farmContextService.getContext();
    if (!ctx?.farm_id) return payload;

    const next = { ...payload };
    let changed = false;
    if (!next.farm_id) { next.farm_id = ctx.farm_id; changed = true; }
    if (tableName === 'employees') {
      if (!next.status) { next.status = 'active'; changed = true; }
      if (!next.role) { next.role = 'Colaborador'; changed = true; }
      if (typeof next.name === 'string') {
        const trimmedName = next.name.trim();
        if (trimmedName !== next.name) {
          next.name = trimmedName;
          changed = true;
        }
      }
    }
    if (metadataTables.includes(tableName)) {
      if (next.employee_id && typeof next.employee_id !== 'string') { next.employee_id = String(next.employee_id); changed = true; }
      if (!next.employee_id && ctx.employee_id) { next.employee_id = String(ctx.employee_id); changed = true; }
      if (!next.employee_name && ctx.employee_name) { next.employee_name = ctx.employee_name; changed = true; }
      if (!next.device_id && ctx.device_id) { next.device_id = ctx.device_id; changed = true; }
    }
    if (changed) this.log('Payload antigo recebeu contexto antes do sync', { tableName, id: next.id || next.date || next.name });
    return changed ? next : payload;
  },

  async retryRecoverableErrors(): Promise<void> {
    try {
      const errors = await localdb.getOutboxErrors(100);
      const retryable = errors.filter((item: any) => {
        const msg = String(item?.errorMessage || '').toLowerCase();
        return msg.includes('[media_pending]')
          || msg.includes('employee_id')
          || msg.includes('employee_name')
          || msg.includes('device_id')
          || msg.includes('schema cache')
          || msg.includes('column')
          || msg.includes('invalid input syntax')
          || msg.includes('bigint')
          || msg.includes('settings')
          || msg.includes('sectors');
      });

      for (const item of retryable) {
        if (item.id) await localdb.retryOutboxItem(item.id);
      }
    } catch (e) {
      console.warn('Nao foi possivel reprocessar erros recuperaveis do outbox:', e);
    }
  },

  hasPendingMedia(payload: any): boolean {
    if (!payload?.media) return false;
    const media = Array.isArray(payload.media) ? payload.media : [payload.media];
    return media.some((m: MediaItem) => !!m?.pendingUpload && !m?.remotePath);
  },

  async syncAll(): Promise<{ ok: boolean; count: number }> {
    if (this._isSyncing) {
      console.log('Sincronização já em andamento, pulando...');
      return { ok: true, count: 0 };
    }

    if (!navigator.onLine) return { ok: false, count: 0 };

    const ctx = farmContextService.getContext();
    this.log('Sync iniciado', {
      farm_id: ctx?.farm_id || null,
      employee_id: ctx?.employee_id || null,
      device_id_present: !!ctx?.device_id,
      online: navigator.onLine
    });

    let access;
    try {
      access = await activationService.validateCurrentAccess();
    } catch (error: any) {
      this.log('Erro na validacao de acesso antes do sync', {
        message: error?.message || String(error),
        code: error?.code,
        details: error?.details
      });
      notify('Nao foi possivel validar o acesso para sincronizar.', 'error');
      return { ok: false, count: 0 };
    }
    if (!access.ok) {
      this.log('Sincronizacao bloqueada na validacao de acesso', access);
      notify(access.message || 'Acesso temporariamente bloqueado. Entre em contato com o administrador.', 'error');
      return { ok: false, count: 0 };
    }

    await this.retryRecoverableErrors();

    const pendingItems = await localdb.getPendingOutbox();
    this.log('Outbox carregado para sync', { pendingCount: pendingItems.length });
    if (pendingItems.length === 0) {
      try {
        localStorage.setItem('last_sync_at', new Date().toISOString());
      } catch {
        // ignore
      }
      return { ok: true, count: 0 };
    }

    this._isSyncing = true;
    let successCount = 0;
    let failCount = 0;

    try {
      for (const item of pendingItems) {
        try {
          const repairedPayload = this.repairPayloadContext(item.payload, item.tableName);
          if (item.id && repairedPayload !== item.payload) {
            await localdb.updateOutboxPayload(item.id, repairedPayload);
          }
          this.log('Sincronizando item do outbox', {
            id: item.id,
            tableName: item.tableName,
            op: item.op,
            recordId: repairedPayload?.id || repairedPayload?.date || repairedPayload?.name || null,
            hasFarmId: !!repairedPayload?.farm_id,
            hasEmployeeId: !!repairedPayload?.employee_id,
            hasDeviceId: !!repairedPayload?.device_id,
            hasMedia: !!repairedPayload?.media
          });
          const updatedPayload = await this.uploadPendingMedia(repairedPayload, item.tableName);
          if (item.id && updatedPayload !== repairedPayload) {
            await localdb.updateOutboxPayload(item.id, updatedPayload);
          }
          await this.processItem({ ...item, payload: updatedPayload });

          successCount++;
          if (this.hasPendingMedia(updatedPayload)) {
            if (item.id) {
              await localdb.markOutboxError(
                item.id,
                '[MEDIA_PENDING] Registro enviado, mas a midia ainda precisa subir.'
              );
            }
            await this.markAsPendingMedia(item.tableName, updatedPayload);
          } else {
            if (item.id) await localdb.deleteOutboxItem(item.id);
            await this.markAsSynced(item.tableName, updatedPayload);
          }
        } catch (error: any) {
          console.error(`Erro sync item ${item.id}:`, error);
          this.log('Erro ao sincronizar item', {
            id: item.id,
            tableName: item.tableName,
            message: error?.message || String(error),
            code: error?.code,
            details: error?.details,
            hint: error?.hint
          });
          failCount++;
          if (item.id) {
            await localdb.markOutboxError(item.id, error.message || 'Erro desconhecido');
          }
        }
      }
    } finally {
      this._isSyncing = false;
    }

    if (successCount > 0) notify(`${successCount} itens sincronizados.`, 'success');
    if (failCount > 0) notify(`${failCount} falharam na sincronização.`, 'error');
    this.log('Sync finalizado', { successCount, failCount });
    try {
      localStorage.setItem('last_sync_at', new Date().toISOString());
    } catch {
      // ignore
    }

    return { ok: failCount === 0, count: successCount };
  },

  async forceReprocessOutbox(): Promise<void> {
    await localdb.retryAllOutboxErrors();
    await this.retryRecoverableErrors();
    this.log('Reprocessamento manual do outbox solicitado');
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
          const farmId = payload.farm_id || farmContextService.getFarmId();
          const path = farmId
            ? `farms/${farmId}/${tableName}/${payload.id}/${m.id}.${ext}`
            : `${tableName}/${payload.id}/${m.id}.${ext}`;

          const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true });

          if (error) {
            console.error('Upload falhou', error);
            this.log('Upload de midia falhou; registro textual continua', {
              tableName,
              recordId: payload?.id || payload?.date || payload?.name || null,
              mediaId: m.id,
              message: error.message
            });
            updatedMedia.push({
              ...m,
              pendingUpload: true
            });
            continue;
          }

          const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

          updatedMedia.push({
            ...m,
            remotePath: path,
            remoteUrl: publicUrlData.publicUrl,
            pendingUpload: false
          });
        } else {
          updatedMedia.push({
            ...m,
            pendingUpload: true
          });
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
    const remoteTableName = item.tableName === 'settings' ? 'farm_settings' : item.tableName;
    const table = supabase.from(remoteTableName);
    let result;

    const cleanPayload = item.payload && typeof item.payload === 'object' ? { ...item.payload } : {};
    delete cleanPayload.tempLocal;

    if (item.tableName === 'settings') {
      const { id, farm_id, farmName, ownerName, headerTextColor, farmLogoUri } = cleanPayload;
      Object.keys(cleanPayload).forEach((key) => delete cleanPayload[key]);
      cleanPayload.id = Number(id) || 1;
      cleanPayload.data = { farmName, ownerName, headerTextColor, farmLogoUri };
      if (farm_id) cleanPayload.farm_id = farm_id;
    }

    if (item.tableName === 'sectors') {
      const sectorName = cleanPayload.name || cleanPayload.id;
      Object.keys(cleanPayload).forEach((key) => delete cleanPayload[key]);
      cleanPayload.name = sectorName;
      const farmId = farmContextService.getFarmId();
      if (farmId) cleanPayload.farm_id = farmId;
    }

    switch (item.op) {
      case 'insert':
        // Inserts vindos de versões antigas precisam ser idempotentes: se o texto
        // subiu e a mídia ficou pendente, o retry não pode morrer por duplicidade.
        result = await upsertWithConflictFallback(table, cleanPayload, getConflictTargets(item.tableName));
        break;
      case 'update':
        if (item.tableName === 'milk_daily') {
          if (!cleanPayload.date) throw new Error('Update sem date');
          result = await upsertWithConflictFallback(table, cleanPayload, getConflictTargets(item.tableName));
        } else if (item.tableName === 'daily_metrics') {
          if (!cleanPayload.date || !cleanPayload.type) throw new Error('Update sem date/type');
          result = await upsertWithConflictFallback(table, cleanPayload, getConflictTargets(item.tableName));
        } else {
          if (!cleanPayload.id) throw new Error('Update sem ID');
          result = await upsertWithConflictFallback(table, cleanPayload, getConflictTargets(item.tableName));
        }
        break;
      case 'upsert':
        result = await upsertWithConflictFallback(table, cleanPayload, getConflictTargets(item.tableName));
        break;
      case 'delete':
        if (item.tableName === 'sectors') {
          const delSectorFarmId = farmContextService.getFarmId();
          result = delSectorFarmId
            ? await table.delete().eq('name', item.payload).eq('farm_id', delSectorFarmId)
            : await table.delete().eq('name', item.payload);
        } else if (item.tableName === 'milk_daily') {
          const delMilkFarmId = farmContextService.getFarmId();
          result = delMilkFarmId
            ? await table.delete().eq('date', item.payload).eq('farm_id', delMilkFarmId)
            : await table.delete().eq('date', item.payload);
        } else if (item.tableName === 'daily_metrics') {
          const p = (item.payload || '').toString();
          if (p.includes('_')) {
            const sepIdx = p.lastIndexOf('_');
            const date = p.slice(0, sepIdx);
            const type = p.slice(sepIdx + 1);
            const delMetricFarmId = farmContextService.getFarmId();
            result = delMetricFarmId
              ? await table.delete().eq('date', date).eq('type', type).eq('farm_id', delMetricFarmId)
              : await table.delete().eq('date', date).eq('type', type);
          } else {
            result = await table.delete().eq('id', item.payload);
          }
        } else {
          const deleteFarmId = farmContextService.getFarmId();
          const farmScopedDeleteTables = [
            'employees',
            'anomalies',
            'instructions',
            'notices',
            'improvements',
            'farm_docs',
            'farm_monthly_stats',
            'ui_config',
            'settings',
            'farm_settings'
          ];
          const query = table.delete().eq('id', item.payload);
          result = deleteFarmId && farmScopedDeleteTables.includes(item.tableName)
            ? await query.eq('farm_id', deleteFarmId)
            : await query;
        }
        break;
    }

    if (result.error) throw result.error;
  },

  async markAsPendingMedia(tableName: string, payload: any) {
    const id = getLocalRecordId(tableName, payload);
    if (!id) return;

    await localdb.put(tableName, {
      id,
      data: payload,
      updated_at: new Date().toISOString(),
      synced: false,
      mediaTotalBytes: 0
    });
  },

  async markAsSynced(tableName: string, payload: any) {
    const id = getLocalRecordId(tableName, payload);
    if (!id) return;

    await localdb.put(tableName, {
      id,
      data: payload,
      updated_at: new Date().toISOString(),
      synced: true,
      mediaTotalBytes: 0
    });
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
          const capitalized = table.charAt(0).toUpperCase() + table.slice(1);
          const data = (await (db as any)[`get${capitalized}`]?.()) || [];

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
        try {
          await db.forceFullRefreshFromServer();
        } catch (e) {
          console.error('[validateAndRepairData] Erro ao recarregar do servidor:', e);
        }
        return {
          isHealthy: false,
          message: 'Dados com inconsistências detectadas. Sincronização com servidor executada.'
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
