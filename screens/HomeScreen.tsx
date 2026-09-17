import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  ClipboardList,
  ArrowUpRight,
  Cloud,
  CloudOff,
  ChevronRight,
  Megaphone,
  RefreshCw,
  Settings,
  ShieldCheck,
  Fuel,
  ChartNoAxesCombined,
  UserRound
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Layout } from '../components/Layout';
import { APP_BRAND, APP_ENVIRONMENT, VISIBLE_HOME_ROUTES } from '../constants/app';
import { db } from '../services/db.service';
import { isSupabaseConfigured } from '../services/supabase';
import { farmContextService } from '../services/farm-context.service';
import { permissionsService } from '../services/permissions.service';
import { authService } from '../services/auth.service';
import { UIBlock, UIConfig } from '../types';

const HOME_BUTTON_FALLBACK: UIBlock[] = [
  { id: 'home-anomalies', screen: 'home', type: 'button', label: 'ORDEM DE SERVIÇO (OS)', color: 'green', iconType: 'lucide', iconValue: 'clipboard', route: '/anomalies', order: 1, visible: true },
  { id: 'home-agenda', screen: 'home', type: 'button', label: 'AGENDA', color: 'green', iconType: 'lucide', iconValue: 'calendar', route: '/agenda', order: 2, visible: true },
  { id: 'home-fuelings', screen: 'home', type: 'button', label: 'ABASTECIMENTOS', color: 'yellow', iconType: 'lucide', iconValue: 'fuel', route: '/fuelings', order: 3, visible: true },
  { id: 'home-farm-indicators', screen: 'home', type: 'button', label: 'INDICADORES DA FAZENDA', color: 'green', iconType: 'lucide', iconValue: 'chart', route: '/farm-indicators', order: 4, visible: true },
  { id: 'home-notices', screen: 'home', type: 'button', label: 'COMUNICADOS', color: 'green', iconType: 'lucide', iconValue: 'megaphone', route: '/notices', order: 5, visible: true },
  { id: 'home-settings', screen: 'home', type: 'button', label: 'CONFIGURAÇÕES', color: 'gray', iconType: 'lucide', iconValue: 'settings', route: '/settings', order: 6, visible: true }
];

const MODULE_DETAILS: Record<string, {
  description: string;
  title: string;
  icon: React.ElementType;
  cardClass: string;
  iconClass: string;
  number: string;
}> = {
  '/anomalies': {
    title: 'Ordem de Serviço (OS)',
    description: 'Registre visitas, valores, localização e anexos de cada atendimento.',
    icon: ClipboardList,
    cardClass: 'bg-[#f1d8c8] text-[#51261c] border-[#d6b6a2]',
    iconClass: 'bg-[#9f3f2d] text-white',
    number: '01'
  },
  '/notices': {
    title: 'Comunicados',
    description: 'Publique orientações e mantenha todos alinhados no dia a dia.',
    icon: Megaphone,
    cardClass: 'bg-[#dbe7cf] text-[#173d31] border-[#b9cbaa]',
    iconClass: 'bg-[#315f45] text-white',
    number: '05'
  },
  '/fuelings': {
    title: 'Abastecimentos',
    description: 'Registre combustível, hodômetro, litros e valores, mesmo sem internet.',
    icon: Fuel,
    cardClass: 'bg-[#f0dfad] text-[#443713] border-[#d6c079]',
    iconClass: 'bg-[#8b6500] text-white',
    number: '03'
  },
  '/farm-indicators': {
    title: 'Indicadores da Fazenda',
    description: 'Consulte os dados de rebanho, leite, reprodução, saúde e financeiro por fazenda.',
    icon: ChartNoAxesCombined,
    cardClass: 'bg-[#dbe7cf] text-[#173d31] border-[#b9cbaa]',
    iconClass: 'bg-[#315f45] text-white',
    number: '04'
  },
  '/agenda': {
    title: 'Agenda de visitas',
    description: 'Organize clientes e responsáveis por manhã e tarde, mesmo sem internet.',
    icon: CalendarDays,
    cardClass: 'bg-[#f3e5b9] text-[#49370d] border-[#d9c484]',
    iconClass: 'bg-[#9a6800] text-white',
    number: '02'
  },
  '/settings': {
    title: 'Configurações',
    description: 'Indicadores de OS, filtros, cadastros e controles administrativos.',
    icon: Settings,
    cardClass: 'bg-[#e7dfd1] text-[#2f4038] border-[#c8bdab]',
    iconClass: 'bg-[#624d3f] text-white',
    number: '06'
  }
};

export const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const currentContext = farmContextService.getContext();
  const isAdmin = permissionsService.isAdmin(currentContext);
  const [ui, setUi] = useState<UIConfig | null>(null);
  const [syncStatus, setSyncStatus] = useState({ pending: 0, errors: 0, isRunning: false });

  useEffect(() => {
    db.getUIConfig().then(setUi);

    // Sem backend não há nada para sincronizar. Evita varrer uma fila local antiga.
    if (!isSupabaseConfigured) return;

    const updateStatus = async () => {
      const status = await db.getSyncStatus();
      setSyncStatus((current) => ({
        ...current,
        pending: status.pendingCount,
        errors: status.errorCount
      }));
    };

    void updateStatus();
    const interval = window.setInterval(updateStatus, 5000);
    const onStart = () => setSyncStatus((current) => ({ ...current, isRunning: true }));
    const onEnd = () => {
      setSyncStatus((current) => ({ ...current, isRunning: false }));
      void updateStatus();
    };

    window.addEventListener('app-sync-start', onStart);
    window.addEventListener('app-sync-end', onEnd);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('app-sync-start', onStart);
      window.removeEventListener('app-sync-end', onEnd);
    };
  }, []);

  const visibleRoutes = VISIBLE_HOME_ROUTES as readonly string[];
  const configuredHomeButtons = ui?.buttons?.filter((button) => button.screen === 'home') || [];
  const homeButtons = HOME_BUTTON_FALLBACK
    .map((fallback) => configuredHomeButtons.find((button) => button.route === fallback.route) || fallback)
    .filter((button) => button.screen === 'home' && visibleRoutes.includes(button.route) && (button.route !== '/settings' || isAdmin))
    .sort((a, b) => visibleRoutes.indexOf(a.route) - visibleRoutes.indexOf(b.route));

  const syncPresentation = !isSupabaseConfigured
    ? { icon: CloudOff, label: 'Banco desconectado', className: 'text-amber-100 border-amber-300/30 bg-amber-200/10', spin: false }
    : syncStatus.isRunning
      ? { icon: RefreshCw, label: 'Sincronizando', className: 'text-sky-100 border-sky-300/30 bg-sky-200/10', spin: true }
      : syncStatus.errors > 0
        ? { icon: AlertCircle, label: `${syncStatus.errors} não enviado${syncStatus.errors > 1 ? 's' : ''}`, className: 'text-amber-100 border-amber-300/30 bg-amber-200/10', spin: false }
        : syncStatus.pending > 0
          ? { icon: CloudOff, label: `${syncStatus.pending} pendente${syncStatus.pending > 1 ? 's' : ''}`, className: 'text-amber-100 border-amber-300/30 bg-amber-200/10', spin: false }
          : { icon: Cloud, label: 'Sincronizado', className: 'text-emerald-100 border-emerald-300/30 bg-emerald-200/10', spin: false };

  const SyncIcon = syncPresentation.icon;

  return (
    <Layout className="bg-[#0d2f25]">
      <div className="pointer-events-none absolute inset-0 bg-[#0d2f25]" />
      <div className="campo-field-lines pointer-events-none absolute inset-0 opacity-40" />

      <header className="relative z-10 flex items-start justify-between px-5 pb-2 pt-5 md:px-8 md:pt-7">
        <div className="rounded-xl bg-[#f7f2e8] px-3 py-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
          <BrandLogo compact />
        </div>

        <div className={`mt-1 flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${syncPresentation.className}`}>
          <SyncIcon size={12} className={syncPresentation.spin ? 'animate-spin' : ''} />
          {syncPresentation.label}
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto px-5 pb-7 pt-5 no-scrollbar md:px-8 md:pb-9">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-white">
          <button type="button" onClick={() => navigate('/profile')} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left" aria-label="Abrir suas informações">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#b8ca9d]/15 text-[#caddb3]">{isAdmin ? <ShieldCheck size={17} /> : <UserRound size={17} />}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{currentContext?.employee_name || 'Perfil local'}</p><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">Suas informações · {currentContext?.employee_role || (isAdmin ? 'Gestão' : 'Técnico')}</p></div>
            <ChevronRight size={16} className="shrink-0 text-white/45" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Deseja realmente sair deste perfil e escolher outro usuário?')) return;
              authService.logout();
              farmContextService.clearContext();
              window.location.reload();
            }}
            className="shrink-0 rounded-lg border border-white/10 px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-white/70"
          >
            Trocar perfil
          </button>
        </div>
        <section aria-label="Módulos disponíveis" className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {homeButtons.map((button, index) => {
            const details = MODULE_DETAILS[button.route];
            if (!details) return null;
            const Icon = details.icon;

            return (
              <button
                key={button.id}
                type="button"
                onClick={() => navigate(button.route)}
                className={`campo-module-card campo-reveal group relative w-full overflow-hidden rounded-[22px] border p-5 text-left shadow-[0_16px_40px_rgba(0,0,0,0.16)] transition duration-300 active:scale-[0.985] ${details.cardClass}`}
                style={{ animationDelay: `${120 + index * 90}ms` }}
              >
                <span className="absolute right-4 top-3 font-mono text-[11px] font-bold tracking-[0.18em] opacity-45">
                  {details.number}
                </span>
                <div className="flex items-start gap-4">
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-sm ${details.iconClass}`}>
                    <Icon size={27} strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1 pr-1">
                    <h2 className="campo-display text-[27px] leading-none tracking-[-0.02em]">
                      {details.title}
                    </h2>
                    <p className="mt-2 text-[13px] font-medium leading-5 opacity-80">
                      {details.description}
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-current/15 pt-3 text-[11px] font-black uppercase tracking-[0.18em]">
                  <span>Abrir módulo</span>
                  <ArrowUpRight className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" size={18} />
                </div>
              </button>
            );
          })}
        </section>

        <footer className="mt-7 flex items-center justify-between border-t border-white/10 pt-4 text-[10px] font-bold uppercase tracking-[0.15em] text-white/55">
          <span>{APP_BRAND.appName}</span>
          <span className="rounded-full border border-[#b8ca9d]/30 bg-[#b8ca9d]/10 px-2 py-1 text-[#caddb3]">
            Ambiente {APP_ENVIRONMENT.label}
          </span>
        </footer>
      </main>
    </Layout>
  );
};

export default HomeScreen;
