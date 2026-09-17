
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ChartNoAxesCombined, ClipboardPlus, FileSpreadsheet, ListFilter, UsersRound } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { db } from '../services/db.service';
import { UIBlock, UIConfig } from '../types';

const ANOMALY_BUTTON_FALLBACK: UIBlock[] = [
  { id: 'anomaly-add', screen: 'anomalies_menu', type: 'button', label: 'NOVA ORDEM DE SERVIÇO', color: 'green', iconType: 'lucide', iconValue: 'plus', route: '/anomalies/add', order: 1, visible: true },
  { id: 'anomaly-list', screen: 'anomalies_menu', type: 'button', label: 'VISITAS E EXPORTAÇÕES', color: 'blue', iconType: 'lucide', iconValue: 'list', route: '/anomalies/list', order: 2, visible: true },
  { id: 'anomaly-clients', screen: 'anomalies_menu', type: 'button', label: 'PAINEL DE CLIENTES', color: 'gray', iconType: 'lucide', iconValue: 'chart', route: '/anomalies/clients', order: 3, visible: true }
];

const MENU_LABELS: Record<string, string> = {
  '/anomalies/add': 'NOVA ORDEM DE SERVIÇO',
  '/anomalies/list': 'VISITAS E EXPORTAÇÕES',
  '/anomalies/clients': 'PAINEL DE CLIENTES'
};

export const AnomaliesMenuScreen: React.FC = () => {
  const navigate = useNavigate();
  const [ui, setUi] = useState<UIConfig>({ buttons: ANOMALY_BUTTON_FALLBACK, customPages: [] });

  useEffect(() => {
    void db.getUIConfig().then(setUi).catch((error) => console.warn('Configuração local do menu indisponível:', error));
  }, []);
  
  const configuredButtons = (ui.buttons ?? [])
    .filter(b => b.screen === 'anomalies_menu' && b.visible && Boolean(MENU_LABELS[b.route]))
    .map((button) => ({ ...button, label: MENU_LABELS[button.route] }));
  const buttons = ANOMALY_BUTTON_FALLBACK
    .map((fallback) => configuredButtons.find((button) => button.route === fallback.route) || fallback)
    .sort((a, b) => a.order - b.order);

  const handleNavigate = (route: string) => navigate(route.split('?')[0]);

  return (
    <Layout className="bg-[#f4f0e7]">
      <Header title="Ordem de Serviço (OS)" targetRoute="/" />

      <div className="campo-field-lines min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-5 md:px-6 md:pt-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {buttons.map((button) => {
            const isCreate = button.route.startsWith('/anomalies/add');
            const isDashboard = button.route === '/anomalies/clients';
            const Icon = isCreate ? ClipboardPlus : isDashboard ? UsersRound : ListFilter;
            return (
              <button
                key={button.id}
                type="button"
                onClick={() => handleNavigate(button.route)}
                className={`group min-h-[132px] w-full rounded-2xl border p-5 text-left shadow-sm transition active:scale-[0.99] ${isCreate ? 'border-[#315b49] bg-[#173f32] text-white' : isDashboard ? 'border-[#d7b9a6] bg-[#f1d8c8] text-[#51261c]' : 'border-[#b6c8a7] bg-[#e5ecdf] text-[#173f32]'}`}
              >
                <div className="flex min-h-[96px] items-center gap-4">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${isCreate ? 'border-white/20 bg-white/10' : isDashboard ? 'border-[#c7967d] bg-white/45' : 'border-[#9db28e] bg-white/60'}`}>
                      <Icon size={24} />
                    </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="campo-display text-[25px] leading-tight">
                      {isCreate ? 'Nova Ordem de Serviço' : isDashboard ? 'Painel de clientes' : 'Visitas e Ordens de Serviço'}
                    </h2>
                    <p className={`mt-2 flex items-center gap-2 text-xs font-bold ${isCreate ? 'text-white/70' : 'text-[#557065]'}`}>
                      {isCreate ? <ClipboardPlus size={15} /> : isDashboard ? <ChartNoAxesCombined size={15} /> : <FileSpreadsheet size={15} />}
                      {isCreate ? 'Cadastrar uma nova visita' : isDashboard ? 'Frequência, valores, KM e recebíveis' : 'Filtrar registros e exportar Excel, Word ou PDF'}
                    </p>
                  </div>
                  <ArrowUpRight size={19} className="shrink-0 opacity-60" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Layout>
  );
};
