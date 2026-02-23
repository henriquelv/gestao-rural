
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Beef, Apple, Sofa, Truck, Baby, Wrench } from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { BigButton } from '../../components/BigButton';
import { SECTORS_LIST, SectorType, getSectorColors } from '../../constants/sectors';

// Mapa de ícones para cada setor
const sectorIcons: Record<SectorType, any> = {
  'Ordenha': BookOpen,
  'Manejo': Wrench,
  'Alimentação': Apple,
  'Conforto': Sofa,
  'Serviços Externos': Truck,
  'Maternidade': Baby,
  'Criação': Beef,
  'Administração': BookOpen,
};

// Mapa de cores do setor para cores do BigButton
const sectorColorMap: Record<SectorType, string> = {
  'Ordenha': 'blue',
  'Manejo': 'orange',
  'Alimentação': 'green',
  'Conforto': 'purple',
  'Serviços Externos': 'yellow',
  'Maternidade': 'pink',
  'Criação': 'red',
  'Administração': 'slate',
};

export const InstructionsMenuScreen: React.FC = () => {
  const navigate = useNavigate();

  const handleSectorSelect = (sector: SectorType) => {
    navigate(`/instructions/${sector.replace(/\s+/g, '-').toLowerCase()}`);
  };

  return (
    <Layout>
      <Header title="Instruções" targetRoute="/" />
      
      <div className="flex-1 p-6 bg-gray-100 pt-8 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          {SECTORS_LIST.map(sector => {
            const IconComponent = sectorIcons[sector] || BookOpen;
            const buttonColor = sectorColorMap[sector] || 'blue';
            
            return (
              <BigButton
                key={sector}
                icon={IconComponent}
                label={sector}
                color={buttonColor}
                onClick={() => handleSectorSelect(sector)}
                fullWidth={false}
              />
            );
          })}
        </div>
        <p className="text-center text-gray-400 mt-8 text-xs">Selecione um setor.</p>
      </div>
    </Layout>
  );
};
