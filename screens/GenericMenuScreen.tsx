
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { BigButton } from '../components/BigButton';
import { db } from '../services/db.service';
import { UIConfig, CustomPage, UIBlock } from '../types';

export const GenericMenuScreen: React.FC = () => {
  const navigate = useNavigate();
  const { pageId } = useParams<{ pageId: string }>();
  const [ui, setUi] = useState<UIConfig | null>(null);
  const [currentPage, setCurrentPage] = useState<CustomPage | null>(null);

  useEffect(() => {
    db.getUIConfig().then(config => {
        setUi(config);
        const page = config.customPages?.find(p => p.id === pageId);
        if (page) setCurrentPage(page);
    });
  }, [pageId]);
  
  if (!ui) return null;

  // Filter buttons belonging to this custom page
  const blocks = ui.buttons
    .filter(b => b.screen === pageId && b.visible)
    .sort((a, b) => a.order - b.order);

  const handleNavigate = (route: string) => {
      if (!route) return;
      if (route.includes('fixedTimestamp')) {
        const now = new Date().toISOString();
        navigate(route.split('?')[0], { state: { fixedTimestamp: now } });
      } else {
        navigate(route);
      }
  };

  const renderBlock = (block: UIBlock) => {
    switch (block.type) {
        case 'header':
            return (
                <div key={block.id} className="w-full mt-4 mb-2 first:mt-0">
                    <h2 className="text-xl font-black text-gray-800 uppercase border-l-4 border-blue-600 pl-3">
                        {block.label}
                    </h2>
                </div>
            );
        case 'text':
            return (
                <div key={block.id} className="w-full bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{block.label}</p>
                </div>
            );
        case 'card':
            return (
                <div key={block.id} className="w-full bg-yellow-50 p-4 rounded-xl border border-yellow-200 flex gap-3 items-start shadow-sm">
                    <div className="bg-yellow-200 p-2 rounded-full shrink-0 text-yellow-800 font-bold">!</div>
                    <div>
                        <h4 className="font-bold text-yellow-900">{block.label}</h4>
                        <p className="text-yellow-800 text-sm">{block.content}</p>
                    </div>
                </div>
            );
        case 'button':
        default:
            return (
                <BigButton 
                    key={block.id}
                    icon={block.iconValue}
                    iconType={block.iconType}
                    label={block.label}
                    color={block.color}
                    onClick={() => handleNavigate(block.route)}
                    fullWidth={true}
                />
            );
    }
  };

  return (
    <Layout>
      <Header title={currentPage?.title || 'Menu Personalizado'} targetRoute="/" />
      
      <div className="flex-1 p-6 flex flex-col items-center gap-4 bg-gray-100 overflow-y-auto">
        {blocks.length === 0 && (
            <div className="text-center text-gray-400 mt-10">
                <p>Esta tela está vazia.</p>
                <p className="text-xs mt-2">Vá em Configurações {'>'} Visual {'>'} Editor de Layout para adicionar conteúdo.</p>

            </div>
        )}
        
        {blocks.map(renderBlock)}
      </div>
    </Layout>
  );
};
