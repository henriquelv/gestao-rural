
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, DollarSign, Users, CheckCircle, Calendar } from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { BigButton } from '../../components/BigButton';

export const FarmNormsMenuScreen: React.FC = () => {
  const navigate = useNavigate();

  // Navega para o submenu de opções da categoria
  const goToCategory = (categoryId: string, label: string) => {
    navigate(`/norms/${categoryId}/options`, { state: { label } });
  };

  return (
    <Layout>
      <Header title="Normas & Organização" targetRoute="/" />
      
      <div className="flex-1 p-4 bg-gray-50 pt-6 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
            
            {/* 1. Normas da Fazenda */}
            <div className="col-span-2">
                <BigButton 
                  icon={FileText} 
                  label="Normas da Fazenda" 
                  onClick={() => goToCategory('normas_fazenda', 'Normas da Fazenda')} 
                  color="blue"
                  fullWidth={true}
                />
            </div>

            {/* 2. Plano de Cargos e Salários */}
            <BigButton 
              icon={DollarSign} 
              label="Cargos e Salários" 
              onClick={() => goToCategory('cargos_salarios', 'Cargos e Salários')}
              color="green"
              fullWidth={false}
            />

            {/* 3. Organograma */}
            <BigButton 
              icon={Users} 
              label="Organograma" 
              onClick={() => goToCategory('organograma', 'Organograma')}
              color="purple"
              fullWidth={false}
            />

            {/* 4. Responsabilidades de Cada Função */}
            <BigButton 
              icon={CheckCircle} 
              label="Resp. por Função" 
              onClick={() => goToCategory('resp_funcao', 'Resp. por Função')}
              color="orange"
              fullWidth={false}
            />

            {/* 5. Plano de Folgas */}
            <BigButton 
              icon={Calendar} 
              label="Plano de Folgas" 
              onClick={() => goToCategory('plano_folgas', 'Plano de Folgas')}
              color="red"
              fullWidth={false}
            />

        </div>
        
        <p className="text-center text-gray-400 mt-8 text-xs">Selecione uma categoria.</p>
      </div>
    </Layout>
  );
};
