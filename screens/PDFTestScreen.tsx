import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { FileText, Download, Folder } from 'lucide-react';
import { pdfService } from '../services/pdf.service';
import { notify } from '../services/notification.service';

interface PDFFile {
  name: string;
  path: string;
  category: string;
}

export const PDFTestScreen: React.FC = () => {
  const [pdfs, setPdfs] = useState<PDFFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Mapa manual dos PDFs disponíveis
  const PDFList: PDFFile[] = [
    // Instruções - Alimentação
    { name: 'Monitoria Alimentação - Parte 1', path: 'INTRUÇÕES DE TRABALHO/ALIMENTAÇÃO/Monitoria Alimentação - Parte 1.pdf', category: 'Alimentação' },
    { name: 'Monitoria Alimentação - Parte 2', path: 'INTRUÇÕES DE TRABALHO/ALIMENTAÇÃO/Monitoria Alimentação - Parte 2.pdf', category: 'Alimentação' },
    { name: 'Padrão do Escore', path: 'INTRUÇÕES DE TRABALHO/ALIMENTAÇÃO/Padrão do escore.pdf', category: 'Alimentação' },
    { name: 'PO de abrir silo', path: 'INTRUÇÕES DE TRABALHO/ALIMENTAÇÃO/PO de abrir silo.pdf', category: 'Alimentação' },
    { name: 'PO de alimentação bovinos', path: 'INTRUÇÕES DE TRABALHO/ALIMENTAÇÃO/PO de alimentação bovinos.pdf', category: 'Alimentação' },

    // Instruções - Conforto
    { name: 'PO como arrumar cama', path: 'INTRUÇÕES DE TRABALHO/CONFORTO/PO de como arrumar cama.pdf', category: 'Conforto' },
    { name: 'Principais ocorrências - Conforto', path: 'INTRUÇÕES DE TRABALHO/CONFORTO/Principais ocorrências - Conforto.pdf', category: 'Conforto' },

    // Instruções - Ordenha
    { name: 'Instrução trabalho ordenha', path: 'INTRUÇÕES DE TRABALHO/ORDENHA/Instrução trabalho ordenha.pdf', category: 'Ordenha' },
    { name: 'Monitoria ordenha', path: 'INTRUÇÕES DE TRABALHO/ORDENHA/Monitoria ordenha.pdf', category: 'Ordenha' },
    { name: 'Padrão dos tetos', path: 'INTRUÇÕES DE TRABALHO/ORDENHA/Padrão dos tetos.pdf', category: 'Ordenha' },

    // Instruções - Serviços Externos
    { name: 'PO de inseminação', path: 'INTRUÇÕES DE TRABALHO/SERVIÇOS EXTERNOS/PO de inseminação.pdf', category: 'Serviços Externos' },
    { name: 'Tabela de óleo no vagão novo', path: 'INTRUÇÕES DE TRABALHO/SERVIÇOS EXTERNOS/Tabela de óleo no vagão novo.pdf', category: 'Serviços Externos' },

    // Melhorias
    { name: 'Melhorias na ordenha', path: 'MELHORIAS/Melhorias na ordenha.pdf', category: 'Melhorias' },

    // Normas
    { name: 'Organograma', path: 'NORMAS E ORGANIZAÇÃO/ORGONOGRAMA/Organograma.pdf', category: 'Normas' },
  ];

  useEffect(() => {
    setPdfs(PDFList);
  }, []);

  const handleDownload = async (pdfFile: PDFFile) => {
    try {
      setDownloading(pdfFile.path);
      await pdfService.downloadPDF(pdfFile.path, pdfFile.name);
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setDownloading(null);
    }
  };

  // Agrupar por categoria
  const grouped = pdfs.reduce((acc, pdf) => {
    if (!acc[pdf.category]) acc[pdf.category] = [];
    acc[pdf.category].push(pdf);
    return acc;
  }, {} as Record<string, PDFFile[]>);

  return (
    <Layout>
      <Header title="Testes de PDF" targetRoute="/" />
      
      <div className="flex-1 bg-gray-50 overflow-y-auto p-4 space-y-6 pb-10">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-3">
              <Folder size={20} className="text-blue-600" />
              <h2 className="text-lg font-bold text-gray-800">{category}</h2>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-bold">{items.length}</span>
            </div>
            
            <div className="space-y-2">
              {items.map((pdf) => (
                <button
                  key={pdf.path}
                  onClick={() => handleDownload(pdf)}
                  disabled={downloading === pdf.path}
                  className="w-full bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all flex items-center gap-3 text-left active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText size={20} className="text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-800 truncate text-sm">{pdf.name}</h3>
                    <p className="text-xs text-gray-400 truncate">{pdf.path}</p>
                  </div>
                  <Download 
                    size={18} 
                    className={`text-gray-400 shrink-0 transition-all ${downloading === pdf.path ? 'animate-spin' : ''}`}
                  />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
};
