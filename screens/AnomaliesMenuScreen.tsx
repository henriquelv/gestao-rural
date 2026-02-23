
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { BigButton } from '../components/BigButton';
import { db } from '../services/db.service';
import { UIConfig } from '../types';

export const AnomaliesMenuScreen: React.FC = () => {
  const navigate = useNavigate();
  const [ui, setUi] = useState<UIConfig | null>(null);

  useEffect(() => {
    db.getUIConfig().then(setUi);
  }, []);
  
  if (!ui) return null;

  const buttons = ui.buttons
    .filter(b => b.screen === 'anomalies_menu' && b.visible)
    .sort((a, b) => a.order - b.order);

  const handleNavigate = (route: string) => {
      if (route.includes('fixedTimestamp')) {
        // Handle dynamic route param for adding anomaly
        const now = new Date().toISOString();
        navigate(route.split('?')[0], { state: { fixedTimestamp: now } });
      } else {
        navigate(route);
      }
  };

  return (
    <Layout>
      <Header title="Anomalias" targetRoute="/" />
      
      <div className="flex-1 p-6 flex flex-col gap-4 bg-gradient-to-br from-gray-50 to-gray-200 pt-8">
        {buttons.map(btn => (
             <BigButton 
                key={btn.id}
                icon={btn.iconValue}
                iconType={btn.iconType}
                label={btn.label}
                color={btn.color}
                onClick={() => handleNavigate(btn.route)}
            />
        ))}
      </div>
    </Layout>
  );
};
