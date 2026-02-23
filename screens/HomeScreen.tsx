
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { BigButton } from '../components/BigButton';
import { db } from '../services/db.service';
import { FarmSettings, UIConfig } from '../types';


// Logo Vetorial MDA Fidedigna
// 'sistema' em cinza (topo), 'M' e 'A' em cinza escuro, 'D' em azul ciano.
const MDA_LOGO_SVG = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNjAgNjAiPgogIDx0ZXh0IHg9IjIiIHk9IjE4IiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM4ODg4ODgiPnNpc3RlbWE8L3RleHQ+CiAgPHRleHQgeD0iMCIgeT0iNTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI0OCIgZm9udC13ZWlnaHQ9IjkwMCIgZmlsbD0iIzMzMzMzMyI+TTwvdGV4dD4KICA8dGV4dCB4PSI0NCIgeT0iNTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI0OCIgZm9udC13ZWlnaHQ9IjkwMCIgZmlsbD0iIzAwOWFkZSI+RDwvdGV4dD4KICA8dGV4dCB4PSI4NCIgeT0iNTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI0OCIgZm9udC13ZWlnaHQ9IjkwMCIgZmlsbD0iIzMzMzMzMyI+QTwvdGV4dD4KPC9zdmc+`;

export const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<FarmSettings | null>(null);
  const [ui, setUi] = useState<UIConfig | null>(null);

  useEffect(() => {
    // Carrega dados
    db.getSettings().then(setSettings);
    db.getUIConfig().then(setUi);
  }, []);
  
  if (!ui) return null;

  // Filter and Sort Buttons for Home Screen
  const homeButtons = ui.buttons
    .filter(b => b.screen === 'home' && b.visible)
    .sort((a, b) => a.order - b.order);

  const handleNavigate = (route: string) => {
    if (route.startsWith('/')) {
        navigate(route);
    } else {
        console.warn("Rota inválida:", route);
    }
  };

  return (
    <Layout>
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-blue-50 z-0 pointer-events-none" />

      {/* Header Area Limpo: Apenas Logo MDA e Logo Fazenda (Opcional) */}
      <div className="pt-4 px-6 pb-2 flex items-center justify-between z-10 relative">
          {/* Logo Sistema MDA */}
          <img 
            src={MDA_LOGO_SVG}
            className="h-12 w-auto object-contain drop-shadow-sm"
            alt="Sistema MDA"
          />
          
          {/* Logo da Fazenda (Canto Direito - Opcional) */}
          {settings?.farmLogoUri && (
             <div className="h-14 w-14 rounded-full border-4 border-white shadow-md overflow-hidden bg-white">
                 <img
                   src={settings.farmLogoUri}
                   className="h-full w-full object-cover"
                   alt="Logo Fazenda"
                   onError={(e) => {
                     (e.currentTarget as HTMLImageElement).style.display = 'none';
                   }}
                 />
             </div>
          )}
      </div>

      {/* Grid Content */}
      <div className="flex-1 px-4 py-2 overflow-y-auto no-scrollbar pb-40 z-10">

        {/* Grid de Botões */}
        <div className="grid grid-cols-2 gap-3 content-start">
          {homeButtons.map(btn => (
              <div key={btn.id} className={btn.id === 'h7' || btn.route === '/settings' ? 'col-span-2' : ''}>
                  <BigButton 
                      icon={btn.iconValue}
                      iconType={btn.iconType} 
                      label={btn.label} 
                      color={btn.color}
                      onClick={() => handleNavigate(btn.route)}
                      fullWidth={btn.id === 'h7' || btn.route === '/settings'} 
                  />
              </div>
          ))}
        </div>
      </div>
    </Layout>
  );
};
