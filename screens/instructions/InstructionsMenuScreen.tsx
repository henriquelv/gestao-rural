import React, { useEffect, useState } from 'react';
import { Filter, X, Calendar, LayoutGrid, List as ListIcon, Table as TableIcon, FileText, Video, Download, Presentation, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { BigButton } from '../../components/BigButton';
import { db } from '../../services/db.service';
import { UIConfig } from '../../types';

export const InstructionsMenuScreen: React.FC = () => {
  const navigate = useNavigate();
  const [ui, setUi] = useState<UIConfig | null>(null);

  useEffect(() => {
    db.getUIConfig().then(setUi).catch((error) => console.error('[InstructionsMenu] Falha ao carregar menu:', error));
  }, []);

  if (!ui) return (
    <Layout>
      <Header title="Instruções de Trabalho" targetRoute="/" />
      <div className="flex flex-1 items-center justify-center gap-2 text-gray-600 font-bold">
        <Loader2 size={20} className="animate-spin" /> Preparando menu...
      </div>
    </Layout>
  );

  const buttons = ui.buttons
    .filter(b => b.screen === 'instructions_menu' && b.visible)
    .sort((a, b) => a.order - b.order);

  const handleNavigate = (route: string) => {
    navigate(route);
  };

  return (
    <Layout>
      <Header title="Instruções de Trabalho" targetRoute="/" />

      <div className="flex-1 px-4 py-8 overflow-y-auto pb-32 bg-gradient-to-br from-gray-50 to-gray-200">
        <div className="grid grid-cols-2 gap-3 content-start">
          {buttons.map(btn => (
            <div key={btn.id}>
              <BigButton
                icon={btn.iconValue}
                iconType={btn.iconType}
                label={btn.label}
                color={btn.color}
                onClick={() => handleNavigate(btn.route)}
              />
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
};
