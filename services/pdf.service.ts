import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Browser } from '@capacitor/browser';
import { notify } from './notification.service';

/**
 * Serviço para gerenciar downloads de PDFs
 * Funciona em web e Android com fallbacks apropriados
 */
export const pdfService = {
  /**
   * Download de arquivo PDF
   * Em web: abre em nova aba ou faz download direto
   * Em Android: salva e abre com app padrão
   */
  async downloadPDF(pdfPath: string, fileName: string): Promise<void> {
    try {
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        await this.downloadPDFNative(pdfPath, fileName);
      } else {
        await this.downloadPDFWeb(pdfPath, fileName);
      }
    } catch (error) {
      console.error('Erro ao baixar PDF:', error);
      notify('Erro ao baixar PDF. Tente novamente.', 'error');
      throw error;
    }
  },

  /**
   * Download para plataforma web
   */
  async downloadPDFWeb(pdfPath: string, fileName: string): Promise<void> {
    // Normalizar o caminho
    const normalizedPath = pdfPath.startsWith('/') ? pdfPath : `/${pdfPath}`;

    try {
      // Tentar como blob primeiro (para suportar URLs cross-origin)
      const response = await fetch(normalizedPath);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'documento.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      notify('PDF baixado com sucesso!', 'success');
    } catch (error) {
      console.error('Erro no download web:', error);
      // Fallback: tentar abrir em nova aba
      window.open(normalizedPath, '_blank');
      notify('Abrindo PDF...', 'info');
    }
  },

  /**
   * Download para plataforma nativa (Android/iOS)
   */
  async downloadPDFNative(pdfPath: string, fileName: string): Promise<void> {
    try {
      // Normalizar caminho removendo barras iniciais e espacos
      let cleanPath = pdfPath.replace(/^\/?PDFs\//, '');
      cleanPath = cleanPath.replace(/\s+/g, '%20');

      // Copiar arquivo do public para o cache do app
      const fileName_clean = fileName.replace(/\s+/g, '_');
      
      try {
        // Tenta ler o arquivo do web assets (public/)
        const fullPath = `/PDFs/${cleanPath}`;
        const response = await fetch(fullPath);
        
        if (!response.ok) {
          throw new Error(`Arquivo não encontrado: ${fullPath}`);
        }

        const blob = await response.blob();
        
        // Salvar no cache do Capacitor
        const cacheDir = Directory.Cache;
        await Filesystem.writeFile({
          directory: cacheDir,
          path: fileName_clean,
          data: blob,
        });

        // Obter o URI do arquivo salvo
        const file = await Filesystem.getUri({
          directory: cacheDir,
          path: fileName_clean,
        });

        // Abrir com app padrão
        await Browser.open({ url: file.uri });
        notify('PDF aberto!', 'success');
      } catch (fsError) {
        console.error('Erro ao acessar arquivo:', fsError);
        notify('Arquivo PDF não encontrado.', 'error');
        throw fsError;
      }
    } catch (error) {
      console.error('Erro no download nativo:', error);
      notify('Erro ao processar PDF.', 'error');
      throw error;
    }
  },
};
