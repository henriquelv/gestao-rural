
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, List } from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { BigButton } from '../../components/BigButton';

export const ImprovementsMenuScreen: React.FC = () => {
  const navigate = useNavigate();

  const handleAdd = () => {
    const now = new Date().toISOString();
    navigate('/improvements/add', { state: { fixedTimestamp: now } });
  };

  return (
    <Layout>
      <Header title="Melhorias" targetRoute="/" />
      <div className="flex-1 p-6 flex flex-col gap-6 bg-gray-50 pt-8">
        <BigButton 
          icon={Plus} 
          label="Adicionar Melhoria" 
          onClick={handleAdd}
          color="green"
        />
        <BigButton 
          icon={List} 
          label="Lista de Melhorias" 
          onClick={() => navigate('/improvements/list')}
          color="blue"
        />
      </div>
    </Layout>
  );
};
