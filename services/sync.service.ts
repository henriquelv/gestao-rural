import { localdb } from './localdb';
import { supabase } from './supabase';
import { notify } from './notification.service';
import { mediaService } from './media.service';
import { db } from './db.service';
import { MediaItem } from '../types';
import { activationService } from './activation.service';
import { farmContextService } from './farm-context.service';
import { getLocalRecordId } from '../utils/local-record-id';
import { isRecoverableSyncError } from '../utils/sync-errors';

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

const publishAccessStatus = (message: string | null) => {
  try {
    if (message) localStorage.setItem('last_access_error_v1', message);
    else localStorage.removeItem('last_access_error_v1');
  } catch {
    // O evento ainda informa a tela quando o localStorage está indisponível.
  }
  window.dispatchEvent(new CustomEvent('app-access-status', { detail: { message } }));
};

export const syncService = {
  _isSyncing: false,
  _syncPromise: null as Promise<{ ok: boolean; count: number }> | null,

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
    const farmScoped = ['ui_config', 'employees', 'anomalies', 'instructions', 'notices', 'improvements', 'farm_docs', 'milk_daily', 'daily_metrics', 'farm_monthly_stats', 'sectors', 'settings', 'farm_settings'];
    const metadataTables = ['anomalies', 'instructions', 'notices', 'improvements', 'farm_docs', 'milk_daily', 'daily_metrics', 'farm_monthly_stats'];
    if (!farmScoped.includes(tableName)) return payload;

    const ctx = farmContextService.getContext();
    if (!ctx?.farm_id) return payload;

    const next = { ...payload };
    let changed = false;
    if (!next.farm_id) { next.farm_id = ctx.farm_id; changed = true; }
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
      // Alguns aparelhos ficaram vários dias acumulando erros. Examinar todos os
      // itens preservados evita que os mais antigos fiquem fora do retry automático.
      const errors = await localdb.getOutboxErrors(10000);
      const retryable = errors.filter(isRecoverableSyncError);

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
    if (this._syncPromise) {
      this.log('SYNC_JOIN_EXISTING');
      return this._syncPromise;
    }

    this._syncPromise = this.syncAllImpl();
    try {
      return await this._syncPromise;
    } finally {
      this._syncPromise = null;
      this._isSyncing = false;
    }
  },

  async syncAllImpl(): Promise<{ ok: boolean; count: number }> {
    this._isSyncing = true;
    this.log('SYNC_START');

    try {
      localStorage.setItem('last_sync_attempt_at', new Date().toISOString());
    } catch {
      // Diagnostic timestamp is optional.
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
      const message = 'Não foi possível validar o acesso para sincronizar.';
      publishAccessStatus(message);
      notify(message, 'error');
      return { ok: false, count: 0 };
    }
    if (!access.ok) {
      this.log('Sincronizacao bloqueada na validacao de acesso', access);
      const message = access.message || 'Acesso temporariamente bloqueado. Entre em contato com o administrador.';
      publishAccessStatus(message);
      notify(message, 'error');
      return { ok: false, count: 0 };
    }
    publishAccessStatus(null);

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

    let successCount = 0;
    let failCount = 0;

    for (const item of pendingItems) {
        try {
          if (item.payloadParseError || !item.payload) {
            throw new Error(item.payloadParseError || 'Payload local vazio; item preservado para diagnostico.');
          }
          const repairedPayload = item.op === 'delete'
            ? item.payload
            : this.repairPayloadContext(item.payload, item.tableName);
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
          } else if (item.op === 'delete') {
            if (item.id) await localdb.deleteOutboxItem(item.id);
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
            try {
              await localdb.markOutboxError(item.id, error.message || 'Erro desconhecido');
            } catch (markError) {
              console.error(`Nao foi possivel marcar erro no item ${item.id}:`, markError);
            }
          }
        }
    }

    if (successCount > 0) notify(`${successCount} itens sincronizados.`, 'success');
    if (failCount > 0) notify(`${failCount} falharam na sincronização.`, 'error');
    this.log('Sync finalizado', { successCount, failCount });
    if (failCount === 0) {
      try {
        localStorage.setItem('last_sync_at', new Date().toISOString());
      } catch {
        // ignore
      }
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
      try {
        if (!m.remotePath) {
          const blob = await mediaService.readMediaData(m);
          if (blob) {
            const ext = guessExt(m);
            const farmId = payload.farm_id || farmContextService.getFarmId();
            const recordId = payload.id || payload.date || payload.monthKey || 'record';
            const path = farmId
              ? `farms/${farmId}/${tableName}/${recordId}/${m.id}.${ext}`
              : `${tableName}/${recordId}/${m.id}.${ext}`;

            const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true });

            if (error) {
              console.error('Upload falhou', error);
              this.log('Upload de midia falhou; registro textual continua', {
                tableName,
                recordId,
                mediaId: m.id,
                message: error.message
              });
              updatedMedia.push({ ...m, pendingUpload: true });
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
            updatedMedia.push({ ...m, pendingUpload: true });
          }
        } else {
          // remoteUrl pode apontar para o Supabase antigo. remotePath e o projeto
          // configurado nesta build são a fonte de verdade para a URL pública.
          const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(m.remotePath);
          updatedMedia.push({ ...m, remoteUrl: publicUrlData.publicUrl || m.remoteUrl });
        }
      } catch (error: any) {
        this.log('Erro isolado de midia; registro textual continua', {
          tableName,
          recordId: payload?.id || payload?.date || payload?.name || null,
          mediaId: m?.id,
          message: error?.message || String(error)
        });
        updatedMedia.push({ ...m, pendingUpload: true });
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

    if (!item.payload || typeof item.payload !== 'object') {
      throw new Error('Payload local invalido; item preservado no outbox.');
    }
    const cleanPayload = { ...item.payload };
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
      {
        const deletePayload = item.payload && typeof item.payload === 'object' ? item.payload : null;
        if (item.tableName === 'sectors') {
          if (!deletePayload?.farm_id) throw new Error('DELETE de setor sem farm_id imutável');
          result = await table.delete().eq('name', deletePayload.name || deletePayload.id).eq('farm_id', deletePayload.farm_id);
        } else if (item.tableName === 'milk_daily') {
          if (!deletePayload?.farm_id || !deletePayload.date) throw new Error('DELETE de leite sem identidade imutável');
          result = await table.delete().eq('date', deletePayload.date).eq('farm_id', deletePayload.farm_id);
        } else if (item.tableName === 'daily_metrics') {
          if (!deletePayload?.farm_id || !deletePayload.date || !deletePayload.type) throw new Error('DELETE de métrica sem identidade imutável');
          result = await table.delete().eq('date', deletePayload.date).eq('type', deletePayload.type).eq('farm_id', deletePayload.farm_id);
        } else {
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
          if (farmScopedDeleteTables.includes(item.tableName)) {
            if (!deletePayload?.farm_id || !deletePayload.id) throw new Error(`DELETE de ${item.tableName} sem identidade imutável`);
            result = await table.delete().eq('id', deletePayload.id).eq('farm_id', deletePayload.farm_id);
          } else {
            result = await table.delete().eq('id', deletePayload?.id || item.payload);
          }
        }
        break;
      }
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
