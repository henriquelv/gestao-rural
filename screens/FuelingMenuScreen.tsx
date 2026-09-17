import React from 'react';
import { ArrowUpRight, ClipboardPlus, FileSpreadsheet, Fuel, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';

const options = [
  {
    route: '/fuelings/new',
    title: 'Novo abastecimento',
    description: 'Registrar veículo, hodômetro, combustível, valores e posto',
    Icon: ClipboardPlus,
    DetailIcon: Fuel,
    className: 'border-[#315b49] bg-[#173f32] text-white',
    iconClassName: 'border-white/20 bg-white/10',
    descriptionClassName: 'text-white/70'
  },
  {
    route: '/fuelings/history',
    title: 'Histórico de abastecimentos',
    description: 'Consultar, filtrar, editar e exportar os lançamentos',
    Icon: History,
    DetailIcon: FileSpreadsheet,
    className: 'border-[#d6c079] bg-[#f0dfad] text-[#443713]',
    iconClassName: 'border-[#c5ac62] bg-white/45',
    descriptionClassName: 'text-[#6c5b29]'
  }
];

export const FuelingMenuScreen: React.FC = () => {
  const navigate = useNavigate();
  return <Layout className="bg-[#f4f0e7]">
    <Header title="Abastecimentos" targetRoute="/" />
    <main className="campo-field-lines min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-8 pt-5 [-webkit-overflow-scrolling:touch]">
      <div className="space-y-4">
        {options.map(({ route, title, description, Icon, DetailIcon, className, iconClassName, descriptionClassName }) => <button
          key={route}
          type="button"
          onClick={() => navigate(route)}
          className={`group min-h-[148px] w-full rounded-2xl border p-5 text-left shadow-sm transition active:scale-[0.99] ${className}`}
        >
          <div className="flex min-h-[106px] items-center gap-4">
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${iconClassName}`}><Icon size={25}/></span>
            <div className="min-w-0 flex-1">
              <h2 className="campo-display text-[25px] leading-tight">{title}</h2>
              <p className={`mt-2 flex items-start gap-2 text-xs font-bold leading-5 ${descriptionClassName}`}><DetailIcon className="mt-0.5 shrink-0" size={15}/>{description}</p>
            </div>
            <ArrowUpRight size={19} className="shrink-0 opacity-60" />
          </div>
        </button>)}
      </div>
    </main>
  </Layout>;
};

export default FuelingMenuScreen;
