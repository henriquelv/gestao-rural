
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, List } from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { BigButton } from '../../components/BigButton';
import { SECTORS_LIST, SectorType } from '../../constants/sectors';

// Mapear URL slug para nome do setor
const slugToSector = (slug: string): SectorType | null => {
  const decoded = decodeURIComponent(slug.replace(/-/g, ' '));
  const sector = SECTORS_LIST.find(s => s.toLowerCase() === decoded.toLowerCase());
  return sector ? (sector as SectorType) : null;
};

export const InstructionsSectorMenuScreen: React.FC = () => {
  const navigate = useNavigate();
  const { sector: sectorSlug } = useParams<{ sector: string }>();
  
  const sector = sectorSlug ? slugToSector(sectorSlug) : null;
  
  if (!sector) {
    return (
      <Layout>
        <Header title="Setor não encontrado" targetRoute="/instructions" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">Setor inválido</p>
        </div>
      </Layout>
    );
  }

  const handleAdd = () => {
    const now = new Date().toISOString();
    navigate('/instructions/add', { 
      state: { 
        fixedTimestamp: now,
        selectedSector: sector
      } 
    });
  };

  const handleList = () => {
    navigate('/instructions/list', { 
      state: { 
        selectedSector: sector
      } 
    });
  };

  return (
    <Layout>
      <Header title={sector} targetRoute="/instructions" />
      <div className="flex-1 p-6 flex flex-col gap-6 bg-gray-50 pt-8">
        <BigButton 
          icon={Plus} 
          label="Adicionar Instrução" 
          onClick={handleAdd}
          color="green"
        />
        <BigButton 
          icon={List} 
          label="Lista de Instruções" 
          onClick={handleList}
          color="blue"
        />
      </div>
    </Layout>
  );
};
