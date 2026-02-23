
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Plus, List } from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { BigButton } from '../../components/BigButton';

export const NormCategoryMenuScreen: React.FC = () => {
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();
  const location = useLocation();
  const label = (location.state as any)?.label || 'Documentos';

  const handleAdd = () => {
    const now = new Date().toISOString();
    navigate(`/norms/${categoryId}/add`, { state: { fixedTimestamp: now, label } });
  };

  const handleList = () => {
    navigate(`/norms/${categoryId}/list`, { state: { label } });
  };

  return (
    <Layout>
      <Header title={label} targetRoute="/norms" />
      <div className="flex-1 p-6 flex flex-col gap-6 bg-gray-50 pt-8">
        
        <BigButton 
          icon={Plus} 
          label={`Adicionar em ${label}`} 
          onClick={handleAdd}
          color="green" 
        />
        
        <BigButton 
          icon={List} 
          label={`Lista de ${label}`} 
          onClick={handleList}
          color="blue"
        />

      </div>
    </Layout>
  );
};
