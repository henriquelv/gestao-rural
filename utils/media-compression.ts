
/**
 * Utilitário para compressão de imagens no cliente.
 * Reduz a resolução máxima e a qualidade JPEG antes de converter para Base64.
 */

export const compressImage = (file: File, maxWidth = 1024, quality = 0.6): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Mantém a proporção, mas força um máximo menor para DBs JSONB
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Erro ao criar contexto do canvas'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Converte para JPEG com qualidade reduzida (0.6 é um bom equilíbrio)
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };

      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export const validateFileSize = (file: File, maxSizeMB = 5): boolean => {
    return file.size <= maxSizeMB * 1024 * 1024;
};
