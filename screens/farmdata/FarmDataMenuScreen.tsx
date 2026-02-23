
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Droplets, Activity, Ban, Baby } from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { BigButton } from '../../components/BigButton';

export const FarmDataMenuScreen: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <Header title="Dados da Fazenda" targetRoute="/" />
      <div className="flex-1 bg-gray-100 p-6 pt-8">
          <div className="grid grid-cols-2 gap-4">
              <BigButton 
                icon={Droplets} 
                label="Leite (Diário)" 
                onClick={() => navigate('/data/milk')} 
                color="blue"
                fullWidth={false}
              />
              <BigButton 
                icon={Activity} 
                label="Vacas em Lactação" 
                onClick={() => navigate('/data/lactation')} 
                color="green"
                fullWidth={false}
              />
              <BigButton 
                icon={Ban} 
                label="Vacas de Descarte" 
                onClick={() => navigate('/data/discard')} 
                color="red"
                fullWidth={false}
              />
              <BigButton 
                icon={Baby} 
                label="Nascimentos" 
                onClick={() => navigate('/data/births')} 
                color="purple"
                fullWidth={false}
              />
          </div>
          <p className="text-center text-gray-400 mt-8 text-xs font-medium">Selecione uma métrica para ver o gráfico e registrar dados diários.</p>
      </div>
    </Layout>
  );
};
