import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { MediaItem } from '../types';
import { webDB } from './localdb.web';
import { supabase } from './supabase';

// ── Cache offline de mídia remota ──
const CACHE_INDEX_KEY = 'media_offline_cache_v1';

const _getOfflineCacheIndex = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(CACHE_INDEX_KEY) || '{}'); }
  catch { return {}; }
};

const _saveOfflineCacheIndex = (index: Record<string, string>) => {
  try { localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index)); }
  catch { /* localStorage cheio */ }
};

const _guessExtFromMime = (mime: string): string => {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('webp')) return 'webp';
  return 'bin';
};

const resolveDataPath = (rawPath: string): { path: string; directory?: Directory } => {
  let p = rawPath || '';
  try {
    p = decodeURIComponent(p);
  } catch {
  }

  if (p.startsWith('file://')) {
    p = p.replace(/^file:\/\//, '');
  }

  const marker = '/files/';
  const idx = p.indexOf(marker);
  if (idx >= 0) {
    return { path: p.slice(idx + marker.length), directory: Directory.Data };
  }

  return { path: p };
};

export const mediaService = {
  isNative: Capacitor.isNativePlatform(),

  // Cache persistente para URLs remotas (localStorage)
  _getRemoteUrlCache(): Record<string, { url: string; timestamp: number }> {
    try {
      const cached = localStorage.getItem('mediaService_remoteUrlCache');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  },

  _saveRemoteUrlCache(cache: Record<string, { url: string; timestamp: number }>): void {
    try {
      // Limpar cache antigo (mais de 7 dias)
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const cleaned = Object.entries(cache).reduce((acc, [key, val]) => {
        if (now - val.timestamp < sevenDaysMs) {
          acc[key] = val;
        }
        return acc;
      }, {} as Record<string, { url: string; timestamp: number }>);

      localStorage.setItem('mediaService_remoteUrlCache', JSON.stringify(cleaned));
    } catch {
      // localStorage cheio ou indisponível
    }
  },

  // Helper para obter URL remota (calcula de remotePath se remoteUrl não existe)
  getRemoteUrl(item: MediaItem): string {
    if (item.remoteUrl) {
      // Salvar URL remota em cache persistente
      const cache = this._getRemoteUrlCache();
      cache[item.remoteUrl] = { url: item.remoteUrl, timestamp: Date.now() };
      this._saveRemoteUrlCache(cache);
      return item.remoteUrl;
    }
    if (item.remotePath) {
      try {
        const { data } = supabase.storage.from('media').getPublicUrl(item.remotePath);
        const publicUrl = data?.publicUrl || '';
        if (publicUrl) {
          // Salvar URL pública em cache persistente
          const cache = this._getRemoteUrlCache();
          cache[publicUrl] = { url: publicUrl, timestamp: Date.now() };
          this._saveRemoteUrlCache(cache);
        }
        return publicUrl;
      } catch {
        return '';
      }
    }
    // Para URIs de assets locais do app (ex: /images/instructions/...), 
    // precisamos resolver o path corretamente
    const uri = item.uri || '';
    if (uri && uri.startsWith('/') && !uri.startsWith('//')) {
      // No Capacitor, servir do diretório de assets web
      if (this.isNative) {
        // window.location.origin geralmente é https://localhost ou capacitor://localhost
        // Remover barra dupla se houver
        const origin = window.location.origin.replace(/\/$/, '');
        return `${origin}${uri}`;
      }
      return uri;
    }
    return uri;
  },

  async maybeCompress(file: File, type: MediaItem['type']): Promise<File> {
    try {
      if (type !== 'photo') return file;
      const maxBytes = 800 * 1024;
      if (file.size <= maxBytes && (file.type === 'image/jpeg' || file.type === 'image/jpg')) return file;

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = URL.createObjectURL(file);
      });

      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, w, h);

      const blob: Blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b || file), 'image/jpeg', 0.75)
      );

      URL.revokeObjectURL(img.src);

      if (!(blob instanceof Blob)) return file;
      const out = new File([blob], (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      return out.size < file.size ? out : file;
    } catch {
      return file;
    }
  },

  async saveMediaFile(file: File, type: MediaItem['type']): Promise<MediaItem> {
    if (type === 'video' && file.size > 40 * 1024 * 1024) {
      throw new Error('Vídeo muito grande. Reduza a qualidade/duração antes de enviar.');
    }

    const inputFile = await this.maybeCompress(file, type);
    const id = crypto.randomUUID();
    const fileName = `${id}_${inputFile.name}`;

    if (this.isNative) {
      const base64Data = await this.fileToBase64(inputFile);
      const saved = await Filesystem.writeFile({
        path: `media/${fileName}`,
        data: base64Data,
        directory: Directory.Data,
        recursive: true
      });

      return {
        id,
        type,
        localPath: saved.uri,
        mimeType: inputFile.type || this.fallbackMimeType(inputFile.name),
        name: inputFile.name,
        size: inputFile.size
      };
    }

    await webDB.media_blobs.put({
      id,
      blob: inputFile,
      mimeType: inputFile.type || this.fallbackMimeType(inputFile.name),
      createdAt: new Date().toISOString()
    });

    return {
      id,
      type,
      localPath: id,
      mimeType: inputFile.type || this.fallbackMimeType(inputFile.name),
      name: inputFile.name,
      size: inputFile.size
    };
  },

  async loadMediaUrl(item: MediaItem): Promise<string> {
    if (!item) return '';

    // ── Tentar cache offline antes de qualquer requisição remota ──
    // Se o item tem remotePath/remoteUrl e está cacheado, servir direto do cache.
    // Isso garante que imagens de outros dispositivos funcionem sem internet.
    if ((item.remotePath || item.remoteUrl) && !item.localPath) {
      const offlineUrl = await this.loadFromOfflineCache(item);
      if (offlineUrl) return offlineUrl;
    }

    // Se não tem localPath, tenta remoteUrl ou uri
    if (!item.localPath) {
      const remoteUrl = this.getRemoteUrl(item);
      // Para URLs remotas, verificar cache persistente
      if (remoteUrl && (remoteUrl.startsWith('http://') || remoteUrl.startsWith('https://'))) {
        // Cache on view: quando carrega do remoto, salvar offline para próxima vez
        if (navigator.onLine) {
          this.cacheRemoteItem(item).catch(() => {}); // fire and forget
        }
        const cache = this._getRemoteUrlCache();
        const cacheKey = remoteUrl;
        if (cache[cacheKey]) {
          return cache[cacheKey].url;
        }
      }
      return remoteUrl;
    }

    if (this.isNative) {
      try {
        const lp = String(item.localPath || '');

        // Já é uma URL pronta (http/https/capacitor)
        if (lp.startsWith('http://') || lp.startsWith('https://') || lp.startsWith('capacitor://')) {
          return lp;
        }

        // Para file:// ou content://, primeiro verificar se o arquivo existe
        if (lp.startsWith('file:') || lp.startsWith('content:')) {
          // Tentar ler o arquivo para verificar se existe
          try {
            if (lp.startsWith('content:')) return lp;
            const resolved = resolveDataPath(lp);
            await Filesystem.stat({ path: resolved.path, directory: resolved.directory });
            // Arquivo existe, retornar URL convertida
            return Capacitor.convertFileSrc(lp);
          } catch {
            // Arquivo NÃO existe - tentar cache offline
            const offlineUrl = await this.loadFromOfflineCache(item);
            if (offlineUrl) return offlineUrl;
            // Fallback: URL remota + cachear para próxima vez
            const remoteUrl = this.getRemoteUrl(item);
            if (navigator.onLine) this.cacheRemoteItem(item).catch(() => {});
            return remoteUrl;
          }
        }

        // Para paths relativos, verificar se existe em Directory.Data
        try {
          const resolved = resolveDataPath(lp);
          const statResult = await Filesystem.stat({
            path: resolved.path,
            directory: resolved.directory ?? Directory.Data
          });

          if (statResult) {
            const r = await Filesystem.getUri({
              path: lp,
              directory: Directory.Data
            });
            if (r?.uri) return Capacitor.convertFileSrc(r.uri);
          }
        } catch {
          // Arquivo NÃO existe - tentar cache offline
          const offlineUrl = await this.loadFromOfflineCache(item);
          if (offlineUrl) return offlineUrl;
          // Fallback: URL remota + cachear para próxima vez
          const remoteUrl = this.getRemoteUrl(item);
          if (navigator.onLine) this.cacheRemoteItem(item).catch(() => {});
          return remoteUrl;
        }

        return Capacitor.convertFileSrc(lp);
      } catch {
        const offlineUrl = await this.loadFromOfflineCache(item);
        if (offlineUrl) return offlineUrl;
        const remoteUrl = this.getRemoteUrl(item);
        if (navigator.onLine) this.cacheRemoteItem(item).catch(() => {});
        return remoteUrl;
      }
    }

    // Web: buscar blob no IndexedDB
    const record = await webDB.media_blobs.get(item.localPath);
    if (record?.blob) {
      // Cache object URLs to avoid creating new blobs every render and
      // to allow reuse across components. Also track createdAt to
      // invalidate when underlying blob changes.
      try {
        if (!(mediaService as any)._webUrlCache) (mediaService as any)._webUrlCache = {} as Record<string, { url: string; createdAt?: string }>;
        const cache = (mediaService as any)._webUrlCache as Record<string, { url: string; createdAt?: string }>;
        const key = String(item.localPath);
        if (cache[key] && cache[key].createdAt === record.createdAt) {
          return cache[key].url;
        }
        // If there is an old URL, revoke it
        if (cache[key] && cache[key].url) {
          try { URL.revokeObjectURL(cache[key].url); } catch { }
        }
        const url = URL.createObjectURL(record.blob);
        cache[key] = { url, createdAt: record.createdAt };
        return url;
      } catch {
        return URL.createObjectURL(record.blob);
      }
    }

    // Fallback: tentar cache offline, senão URL remota + cachear
    const offlineUrl = await this.loadFromOfflineCache(item);
    if (offlineUrl) return offlineUrl;
    const remoteUrl = this.getRemoteUrl(item);
    if (navigator.onLine) this.cacheRemoteItem(item).catch(() => {});
    return remoteUrl;
  },

  async readMediaData(item: MediaItem): Promise<Blob | null> {
    if (!item) return null;

    if (!item.localPath && (item.remoteUrl || item.uri)) {
      try {
        const resp = await fetch(item.remoteUrl || item.uri || '');
        return await resp.blob();
      } catch {
        return null;
      }
    }

    if (!item.localPath) return null;

    if (this.isNative) {
      try {
        const lp = String(item.localPath || '');

        // Se for URI (file://, content://), ler via fetch no WebView.
        // Isso evita falhas do Filesystem.readFile quando recebe URI absoluta.
        if (lp.startsWith('file:') || lp.startsWith('content:') || lp.startsWith('capacitor://')) {
          try {
            const src = lp.startsWith('content:') ? lp : Capacitor.convertFileSrc(lp);
            const resp = await fetch(src);
            if (!resp.ok) return null;
            return await resp.blob();
          } catch {
            return null;
          }
        }

        // Caso seja path relativo (ex.: media/arquivo.pdf), ler via URI do sistema
        const resolved = resolveDataPath(lp);
        const r = await Filesystem.getUri({
          path: resolved.path,
          directory: resolved.directory ?? Directory.Data
        });

        const resp = await fetch(Capacitor.convertFileSrc(r.uri));
        if (!resp.ok) return null;
        return await resp.blob();
      } catch (e) {
        console.error('Erro ao ler mídia nativa:', e);
        return null;
      }
    }

    const record = await webDB.media_blobs.get(item.localPath);
    return record ? record.blob : null;
  },

  async deleteMedia(item: MediaItem): Promise<void> {
    try {
      if (!item?.localPath) return;

      if (this.isNative) {
        await Filesystem.deleteFile({
          path: item.localPath
        });
      } else {
        // Revoke any cached object URL
        try {
          const cache = (mediaService as any)._webUrlCache as Record<string, { url: string; createdAt?: string }> | undefined;
          const key = String(item.localPath);
          if (cache && cache[key] && cache[key].url) {
            try { URL.revokeObjectURL(cache[key].url); } catch { }
            delete cache[key];
          }
        } catch { }
        await webDB.media_blobs.delete(item.localPath);
      }
    } catch {
      return;
    }
  },

  // ── Cache offline: verificar, salvar e carregar ──

  /** Verifica se um item de mídia remoto já está cacheado localmente */
  isOfflineCached(item: MediaItem): boolean {
    const key = item.remotePath || item.remoteUrl || '';
    if (!key) return false;
    return !!_getOfflineCacheIndex()[key];
  },

  /** Baixa e salva localmente um item de mídia remoto para uso offline */
  async cacheRemoteItem(item: MediaItem): Promise<boolean> {
    const remoteUrl = this.getRemoteUrl(item);
    if (!remoteUrl || !navigator.onLine) return false;

    const cacheKey = item.remotePath || remoteUrl;
    const index = _getOfflineCacheIndex();
    if (index[cacheKey]) return true; // já cacheado

    try {
      const resp = await fetch(remoteUrl);
      if (!resp.ok) return false;
      const blob = await resp.blob();

      const cacheId = `cache_${item.id || crypto.randomUUID()}`;

      if (this.isNative) {
        const base64 = await this.fileToBase64(new File([blob], cacheId));
        const ext = _guessExtFromMime(blob.type || item.mimeType || '');
        const saved = await Filesystem.writeFile({
          path: `media_cache/${cacheId}.${ext}`,
          data: base64,
          directory: Directory.Data,
          recursive: true
        });
        index[cacheKey] = saved.uri;
      } else {
        await webDB.media_blobs.put({
          id: cacheId,
          blob: blob instanceof File ? blob : new File([blob], cacheId),
          mimeType: blob.type || item.mimeType || '',
          createdAt: new Date().toISOString()
        });
        index[cacheKey] = cacheId;
      }

      _saveOfflineCacheIndex(index);
      return true;
    } catch (e) {
      console.error('Erro ao cachear mídia offline:', e);
      return false;
    }
  },

  /** Carrega mídia do cache offline — retorna URL local ou '' se não cacheado */
  async loadFromOfflineCache(item: MediaItem): Promise<string> {
    const cacheKey = item.remotePath || item.remoteUrl || '';
    if (!cacheKey) return '';

    const index = _getOfflineCacheIndex();
    const cachedPath = index[cacheKey];
    if (!cachedPath) return '';

    if (this.isNative) {
      try {
        const resolved = resolveDataPath(cachedPath);
        const dir = resolved.directory ?? Directory.Data;
        await Filesystem.stat({ path: resolved.path, directory: dir });
        const r = await Filesystem.getUri({ path: resolved.path, directory: dir });
        return Capacitor.convertFileSrc(r.uri);
      } catch {
        // Arquivo sumiu — limpar entrada do índice
        delete index[cacheKey];
        _saveOfflineCacheIndex(index);
        return '';
      }
    }

    // Web: buscar blob no IndexedDB
    const record = await webDB.media_blobs.get(cachedPath);
    if (record?.blob) {
      return URL.createObjectURL(record.blob);
    }
    delete index[cacheKey];
    _saveOfflineCacheIndex(index);
    return '';
  },

  /** Retorna quantos itens estão no cache offline */
  getOfflineCacheCount(): number {
    return Object.keys(_getOfflineCacheIndex()).length;
  },

  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const res = reader.result as string;
        if (res.includes(',')) {
          resolve(res.split(',')[1]);
        } else {
          resolve(res);
        }
      };
      reader.onerror = (error) => reject(error);
    });
  },

  fallbackMimeType(fileName: string): string {
    const n = fileName.toLowerCase();
    if (n.endsWith('.pdf')) return 'application/pdf';
    if (n.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
    if (n.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (n.endsWith('.doc')) return 'application/msword';
    if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (n.endsWith('.png')) return 'image/png';
    return 'application/octet-stream';
  }
};
