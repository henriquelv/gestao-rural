import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { notify } from './notification.service';

export const downloadService = {
  sanitizeFileName(name: string): string {
    const base = (name || 'arquivo')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return base.length > 0 ? base : 'arquivo';
  },

  /**
   * Converte um Blob para Base64 (necessário para o Filesystem do Capacitor)
   */
  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Part = base64String.split(',')[1];
        if (!base64Part) {
          reject(new Error('Falha ao converter blob para base64'));
          return;
        }
        resolve(base64Part);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  /**
   * Método principal: Realiza o download e abre o arquivo diretamente no app (Mobile)
   * ou faz o download via navegador (Web).
   */
  async downloadFile(url: string, fileName: string, mimeType?: string, localPath?: string): Promise<void> {
    try {
      if (!url || typeof url !== 'string') {
        notify('URL de download inválida', 'error');
        return;
      }

      console.log('downloadService.downloadFile url:', url);

      // Verificar se é URL válida
      try {
        new URL(url);
      } catch {
        console.error('URL inválida:', url);
        notify('URL de download inválida', 'error');
        return;
      }

      const isNative = Capacitor.isNativePlatform();
      const sanitizedName = this.sanitizeFileName(fileName || 'arquivo.pdf');

      if (isNative) {
        // === MOBILE NATIVO (Android/iOS) ===
        notify('Abrindo arquivo...', 'info');
        
        try {
          // Estratégia 1: Tenta abrir a URL remota diretamente no navegador nativo
          // Isso é mais rápido e confiável que tentar salvar localmente
          console.log('Tentando abrir URL remota diretamente (estratégia 1):', url);
          
          await Browser.open({ 
            url: url,
            toolbarColor: '#1f2937',
            presentationStyle: 'fullscreen'
          });
          
          notify('Arquivo aberto com sucesso', 'success');
          return;
        } catch (directError) {
          console.error('Estratégia 1 falhou - Erro ao abrir URL remota:', directError);
          
          // Estratégia 2: Baixa arquivo localmente e tenta abrir
          try {
            console.log('Tentando estratégia 2: salvar localmente e abrir...');
            
            const response = await fetch(url, {
              method: 'GET',
              headers: {
                'Accept': mimeType || 'application/pdf',
              },
              credentials: 'omit' // Evita problemas com CORS
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const blob = await response.blob();
            console.log('Blob recebido, tamanho:', blob.size, 'bytes');
            
            if (blob.size === 0) {
              throw new Error('Arquivo vazio recebido do servidor');
            }
            
            // Converter para Base64
            const base64Data = await this.blobToBase64(blob);
            console.log('Base64 convertido, tamanho:', base64Data.length, 'chars');
            
            // Salvar em Documents (mais acessível que Cache no Android)
            const savedFile = await Filesystem.writeFile({
              path: `downloads/${sanitizedName}`,
              data: base64Data,
              directory: Directory.Documents,
              recursive: true
            });
            
            console.log('Arquivo salvo em:', savedFile.uri);
            
            // Converter URI do arquivo para formato que o Browser pode abrir
            const fileUri = Capacitor.convertFileSrc(savedFile.uri);
            console.log('URI convertida para Browser:', fileUri);
            
            // Tentar abrir o arquivo local
            await Browser.open({ 
              url: fileUri,
              toolbarColor: '#1f2937',
              presentationStyle: 'fullscreen'
            });
            
            notify('Arquivo aberto com sucesso', 'success');
            return;
          } catch (localError: any) {
            console.error('Estratégia 2 falhou:', localError);
            
            // Estratégia 3: Último fallback - abre URL remota diretamente (sem Browser plugin)
            try {
              console.log('Tentando estratégia 3: abrindo URL remota sem Browser plugin');
              window.open(url, '_blank', 'noopener,noreferrer');
              notify('Abrindo arquivo no navegador do sistema', 'info');
              return;
            } catch (fallbackError) {
              console.error('Estratégia 3 falhou:', fallbackError);
              notify(`Erro ao abrir arquivo: ${localError.message || 'Desconhecido'}`, 'error');
            }
          }
        }
      } else {
        // === WEB (Browser Desktop) ===
        console.log('Iniciando download na Web:', url);
        notify('Iniciando download...', 'info');
        
        try {
          const response = await fetch(url, {
            method: 'GET',
            credentials: 'omit'
          });
          
          if (!response.ok) {
            throw new Error(`Falha: ${response.status}`);
          }
          
          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = sanitizedName;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
          notify('Download concluído', 'success');
        } catch (fetchError: any) {
          console.error('Erro no fetch:', fetchError);
          // Fallback: abrir diretamente em nova aba
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          notify('Abrindo arquivo...', 'info');
        }
      }
    } catch (error: any) {
      console.error('Erro ao baixar arquivo:', error);
      notify(`Erro ao baixar: ${error.message || 'Desconhecido'}`, 'error');
    }
  }
};
