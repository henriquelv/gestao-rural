
import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { FieldLabel } from '../../components/FieldLabel';
import { Save, TrendingUp, Calculator, Calendar, Clock, BarChart2, Lock, Edit2, Trash2, X, Download, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../../services/db.service';
import { notify } from '../../services/notification.service';
import { DailyMilk, DailyMetric } from '../../types';
import { PinRequestModal } from '../../components/PinRequestModal';
import { authService } from '../../services/auth.service';
import { farmContextService } from '../../services/farm-context.service';
import { localdb } from '../../services/localdb';
import { normalizeDailyMetric, normalizeDailyMilk } from '../../utils/record-normalize';
import { getBusinessDateKey } from '../../utils/anomaly-months';
import { buildMilkSummary } from '../../utils/milk-stats';
import { exportCsv } from '../../services/export.service';

interface DataMetricScreenProps {
  type: 'milk' | 'lactation' | 'discard' | 'births';
}

export const DataMetricScreen: React.FC<DataMetricScreenProps> = ({ type }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [value, setValue] = useState('');
  const [entryDate, setEntryDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingProtectedAction, setPendingProtectedAction] = useState<(() => Promise<void>) | null>(null);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isReplacing, setIsReplacing] = useState(false);
  const [pendingReplaceAction, setPendingReplaceAction] = useState<(() => Promise<void>) | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  
  const MONTH_KEY = `selectedMonth_${farmContextService.getFarmId() || 'default'}`;
  const readSavedMonth = () => {
    try {
      const value = localStorage.getItem(MONTH_KEY) || '';
      return /^\d{4}-\d{2}$/.test(value) ? value : '';
    } catch {
      return '';
    }
  };

  // Inicializar monthPickerYear baseado no selectedMonth
  const [monthPickerYear, setMonthPickerYear] = useState(() => {
    const saved = readSavedMonth();
    if (saved) {
      const [y] = saved.split('-');
      return parseInt(y);
    }
    return new Date().getFullYear();
  });

  const config = {
    milk: { title: 'Volume de Leite', label: 'Litros', color: '#3b82f6', unit: 'L', accumulated: false },
    lactation: { title: 'Vacas em Lactação', label: 'Quantidade', color: '#22c55e', unit: 'cb', accumulated: false },
    discard: { title: 'Vacas de Descarte', label: 'Quantidade', color: '#ef4444', unit: 'cb', accumulated: true },
    births: { title: 'Nascimentos', label: 'Quantidade', color: '#a855f7', unit: 'bz', accumulated: true },
  };
  const conf = config[type];

  // Visualization mode: 'daily' or 'accumulated' (user toggle). Default from conf.accumulated
  const [vizMode, setVizMode] = useState<'daily' | 'accumulated'>(conf.accumulated ? 'accumulated' : 'daily');
  
  // Filter by month (YYYY-MM). Default to current month. Persists per farm.
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = readSavedMonth();
    if (saved) return saved;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [showMilkSummary, setShowMilkSummary] = useState(false);
  const [summaryYear, setSummaryYear] = useState(() => Number(readSavedMonth().slice(0, 4)) || new Date().getFullYear());

  // Persist selectedMonth to localStorage whenever it changes (keyed by farm)
  useEffect(() => {
    try { localStorage.setItem(MONTH_KEY, selectedMonth); } catch { /* armazenamento opcional */ }
    const [y] = selectedMonth.split('-');
    setMonthPickerYear(parseInt(y));
  }, [MONTH_KEY, selectedMonth]);

  // Check if entry date has existing value and auto-fill
  useEffect(() => {
    const existingEntry = history.find((h: any) => h.date === entryDate);
    if (existingEntry) {
      const val = type === 'milk' ? existingEntry.liters : existingEntry.value;
      setValue(String(val || ''));
    } else {
      setValue('');
    }
  }, [entryDate, history, type]);

  const parseLocalDay = (d: string) => {
    return new Date(`${d}T00:00:00`);
  };

  const loadLocal = async () => {
    const tableName = type === 'milk' ? 'milk_daily' : 'daily_metrics';
    const farmId = farmContextService.getFarmId();
    const rows = await localdb.getAll<any>(tableName, 'date');
    const scoped = rows.filter((row) => row?.farm_id === farmId);
    const data = type === 'milk'
      ? scoped.map(normalizeDailyMilk).filter((row): row is DailyMilk => row !== null)
      : scoped.map(normalizeDailyMetric).filter((row): row is DailyMetric => row !== null && row.type === type);
    setHistory(data);
  };

  const load = async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      // Offline-first: renderiza o SQLite imediatamente antes de aguardar rede.
      await loadLocal();
      const refreshed = type === 'milk'
        ? await db.refreshMilkDaily()
        : await db.refreshDailyMetrics();
      await loadLocal();
      setRefreshError(navigator.onLine && !refreshed
        ? 'Não foi possível atualizar os dados do servidor. A cópia salva neste aparelho continua visível.'
        : '');
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
      // Mantém a última leitura válida na tela; nenhum dado local é apagado.
      setRefreshError('Não foi possível atualizar os dados do servidor. A cópia salva neste aparelho continua visível.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const tableName = type === 'milk' ? 'milk_daily' : 'daily_metrics';
    const unsubscribe = localdb.subscribe(tableName, () => loadLocal());
    return () => unsubscribe && unsubscribe();
  }, [type]);

  const protectedAction = async (action: () => Promise<void>) => {
    if (authService.isAuthenticated()) {
      await action();
      return;
    }
    setPendingProtectedAction(() => action);
    setShowPinModal(true);
  };

  const handleSaveClick = () => {
      if(!value) { notify("Informe um valor.", "error"); return; }
      
      const num = parseFloat(value);
      if (!Number.isFinite(num)) {
        notify("Valor inválido.", "error");
        return;
      }
      if (num < 0) {
        notify("O valor não pode ser negativo.", "error");
        return;
      }
      
      // Check if date already has a value
      const existingEntry = history.find((h: any) => h.date === entryDate);
      if (existingEntry) {
        setIsReplacing(true);
        return;
      }
      
      if(authService.isAuthenticated()) {
          performSave();
      } else {
          setPendingProtectedAction(null);
          setShowPinModal(true);
      }
  };

  const confirmReplace = () => {
    setIsReplacing(false);
    if(authService.isAuthenticated()) {
        performSave();
    } else {
        setPendingReplaceAction(() => performSave);
        setShowPinModal(true);
    }
  };

  const performSave = async () => {
    const num = parseFloat(value);
    if (type === 'milk') await db.addMilkEntry({ date: entryDate, liters: num });
    else await db.addDailyMetric({ date: entryDate, type: type, value: num });
    setValue('');
    notify("Dados salvos com sucesso!", "success");
    await load(true);
  };

  const processChartData = () => {
     try {
       const sorted = [...history].sort((a,b) => parseLocalDay((a as any).date).getTime() - parseLocalDay((b as any).date).getTime());
       const monthData = sorted.filter(d => String((d as any).date || '').startsWith(selectedMonth));

       let displayData: { label: string, val: number, fullDate: string }[] = [];
       let totalMonth = 0;

         if (vizMode === 'accumulated') {
           let runningTotal = 0;
           displayData = monthData.map(d => {
               const v = type === 'milk' ? (Number((d as DailyMilk).liters) || 0) : (Number((d as DailyMetric).value) || 0);
               runningTotal += v;
               return { label: String((d as any).date || '').split('-')[2] || '', val: runningTotal, fullDate: (d as any).date };
           });
           totalMonth = runningTotal;
       } else {
           displayData = monthData.map(d => {
               const v = type === 'milk' ? (Number((d as DailyMilk).liters) || 0) : (Number((d as DailyMetric).value) || 0);
               return { label: String((d as any).date || '').split('-')[2] || '', val: v, fullDate: (d as any).date };
           });
           totalMonth = monthData.reduce((acc, curr) => acc + (type === 'milk' ? (Number((curr as DailyMilk).liters) || 0) : (Number((curr as DailyMetric).value) || 0)), 0);
       }
       return { displayData, totalMonth };
     } catch (e) {
       console.error('Erro ao processar gráfico:', e);
       return { displayData: [], totalMonth: 0 };
     }
  };

  const { displayData, totalMonth } = processChartData();
  const milkSummary = useMemo(
    () => buildMilkSummary(type === 'milk' ? history as DailyMilk[] : [], summaryYear),
    [history, summaryYear, type]
  );
  const selectedMilkMonth = useMemo(() => {
    const monthIndex = Number(selectedMonth.slice(5, 7)) - 1;
    return buildMilkSummary(type === 'milk' ? history as DailyMilk[] : [], Number(selectedMonth.slice(0, 4))).months[monthIndex];
  }, [history, selectedMonth, type]);

  const formatNumber = (n: number) => {
    if (!Number.isFinite(n)) return '0';
    try {
      return n.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: type === 'milk' ? 1 : 0
      });
    } catch {
      return type === 'milk' && !Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n));
    }
  };

  const getDailyListData = () => {
    const sortedDesc = [...history].sort((a,b) => parseLocalDay((b as any).date).getTime() - parseLocalDay((a as any).date).getTime());
    const monthItems = sortedDesc.filter(d => String((d as any).date || '').startsWith(selectedMonth));

    let accumulatedByDate: Record<string, number> = {};
    if (vizMode === 'accumulated') {
      const sortedAsc = [...history].sort((a,b) => parseLocalDay((a as any).date).getTime() - parseLocalDay((b as any).date).getTime());
      const monthData = sortedAsc.filter(d => String((d as any).date || '').startsWith(selectedMonth));
      let runningTotal = 0;
      for (const d of monthData) {
        const v = type === 'milk' ? (Number((d as DailyMilk).liters) || 0) : (Number((d as DailyMetric).value) || 0);
        runningTotal += v;
        accumulatedByDate[(d as any).date] = runningTotal;
      }
    }

    return monthItems.map(d => {
      const date = parseLocalDay((d as any).date);
      const shortDate = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const rawValue = type === 'milk' ? (d as DailyMilk).liters : (d as DailyMetric).value;
      const displayValue = vizMode === 'accumulated' ? (accumulatedByDate[(d as any).date] ?? rawValue) : rawValue;
      return {
        date: shortDate,
        fullDate: (d as any).date,
        value: displayValue,
        rawValue: rawValue,
        label: conf.title
      };
    }).sort((a, b) => parseLocalDay(b.fullDate).getTime() - parseLocalDay(a.fullDate).getTime());
  };

  const dailyList = getDailyListData();

  const exportCSV = async () => {
    try {
      const sorted = [...history].sort((a: any, b: any) => a.date > b.date ? 1 : -1);
      const rows = [
        ['Data', conf.label, 'Unidade'],
        ...sorted.map((d: any) => {
          const val = type === 'milk' ? d.liters : d.value;
          return [d.date, String(val ?? ''), conf.unit];
        })
      ];
      const result = await exportCsv(rows, `${conf.title}_${selectedMonth}`);
      notify(
        result.native
          ? `Arquivo salvo em Documentos/Gestao Rural/${result.fileName}`
          : 'Arquivo compatível com Excel exportado com sucesso!',
        'success'
      );
    } catch (e) {
      console.error('Erro ao exportar CSV:', e);
      notify('Erro ao exportar CSV.', 'error');
    }
  };

  const openEdit = (item: any) => {
    setEditingEntry(item);
    setEditValue(String(item?.rawValue ?? item?.value ?? ''));
  };

  const confirmDelete = async (item: any) => {
    if (!item?.fullDate) return;
    if (!confirm('Excluir este registro?')) return;

    await protectedAction(async () => {
      try {
        if (type === 'milk') {
          await db.deleteMilkEntry(item.fullDate);
        } else {
          await db.deleteDailyMetric(item.fullDate, type);
        }
        notify('Registro excluído.', 'success');
        await load(true);
      } catch (e) {
        console.error(e);
        notify('Erro ao excluir.', 'error');
      }
    });
  };

  const saveEdit = async () => {
    if (!editingEntry?.fullDate) return;
    const num = parseFloat(editValue);
    if (!Number.isFinite(num)) {
      notify('Informe um valor válido.', 'error');
      return;
    }
    if (num < 0) {
      notify('O valor não pode ser negativo.', 'error');
      return;
    }

    await protectedAction(async () => {
      try {
        if (type === 'milk') {
          await db.updateMilkEntry({ date: editingEntry.fullDate, liters: num });
        } else {
          await db.updateDailyMetric({ date: editingEntry.fullDate, type: type, value: num });
        }
        setEditingEntry(null);
        notify('Registro atualizado!', 'success');
        await load(true);
      } catch (e) {
        console.error(e);
        notify('Erro ao atualizar.', 'error');
      }
    });
  };

  const renderChart = () => {
    if (displayData.length < 1) return (
        <div className="h-40 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl text-gray-400 mt-6">
            <Calendar size={32} className="mb-2 opacity-50"/>
            <span className="text-sm">Sem dados neste período</span>
        </div>
    );

    const maxVal = Math.max(...displayData.map(d => d.val)) * 1.1 || 10;
    
    // Calcula largura mínima para forçar scroll se necessário
    const minChartWidth = Math.max(displayData.length * 50, 400); // 50px por item, mínimo 400px
    
    return (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mt-6 relative">
            <div className="relative h-56 flex items-end px-2" style={{ minWidth: `${minChartWidth}px`, width: '100%', gap: '4px' }}>
                {/* Linhas de Grade de Fundo */}
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full z-0 opacity-20 pointer-events-none">
                    <line x1="0" y1="25" x2="100" y2="25" stroke="#000" strokeWidth="0.5" vectorEffect="non-scaling-stroke"/>
                    <line x1="0" y1="50" x2="100" y2="50" stroke="#000" strokeWidth="0.5" vectorEffect="non-scaling-stroke"/>
                    <line x1="0" y1="75" x2="100" y2="75" stroke="#000" strokeWidth="0.5" vectorEffect="non-scaling-stroke"/>
                </svg>

                {/* Linha/escada para acumulado */}
                {vizMode === 'accumulated' && (
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full z-10 overflow-visible pointer-events-none">
                        <polyline 
                            points={displayData.map((d, i) => {
                                const x = (i / (displayData.length - 1 || 1)) * 100;
                                const nextX = ((i + 1) / (displayData.length - 1 || 1)) * 100;
                                const y = 100 - (d.val / maxVal * 100);
                                return i === displayData.length - 1 ? `${x},${y}` : `${x},${y} ${nextX},${y}`;
                            }).join(' ')} 
                            fill="none" 
                            stroke={conf.color} 
                            strokeWidth="2.5" 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            vectorEffect="non-scaling-stroke" 
                        />
                        {displayData.map((d, i) => {
                            const x = (i / (displayData.length - 1 || 1)) * 100;
                            const y = 100 - (d.val / maxVal * 100);
                            return <circle key={i} cx={x} cy={y} r="1.5" fill={conf.color} />;
                        })}
                    </svg>
                )}

                {/* Barras para diário */}
                {vizMode === 'daily' && displayData.map((d, i) => {
                    const heightPercent = (d.val / maxVal) * 100;
                    return (
                        <div key={i} className="flex flex-col justify-end items-center group relative h-full" style={{ minWidth: '45px', flex: '0 0 auto' }}>
                            <div className="text-[10px] font-black mb-1 h-4 flex items-end" style={{color: conf.color}}>
                                {formatNumber(d.val)}
                            </div>
                            <div 
                                className="w-full rounded-t-md transition-all duration-500 ease-out hover:opacity-80 cursor-pointer shadow-sm"
                                style={{ height: `${heightPercent}%`, backgroundColor: conf.color }}
                                title={`${d.label}: ${formatNumber(d.val)} ${conf.unit}`}
                            ></div>
                            <span className="text-[10px] text-gray-500 mt-2 font-semibold">{d.label}</span>
                        </div>
                    );
                })}

                {/* Barras com estilo escada para acumulado */}
                {vizMode === 'accumulated' && displayData.map((d, i) => {
                    const heightPercent = (d.val / maxVal) * 100;
                    return (
                        <div key={i} className="flex flex-col justify-end items-center group relative h-full" style={{ minWidth: '45px', flex: '0 0 auto' }}>
                            <div className="text-[10px] font-black mb-1 h-4 flex items-end" style={{color: conf.color}}>
                                {formatNumber(d.val)}
                            </div>
                            <div 
                                className="w-full transition-all duration-500 ease-out hover:opacity-80 cursor-pointer shadow-sm"
                                style={{ height: `${heightPercent}%`, backgroundColor: `${conf.color}40`, border: `2px solid ${conf.color}` }}
                                title={`Acumulado até ${d.label}: ${formatNumber(d.val)} ${conf.unit}`}
                            ></div>
                            <span className="text-[10px] text-gray-500 mt-2 font-semibold">{d.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
  };

  return (
    <Layout>
      <Header title={conf.title} targetRoute="/data" />
      
      <div className="flex-1 bg-gray-50 overflow-y-auto pb-40">
        {refreshError && (
          <div className="m-3 mb-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span className="font-semibold">{refreshError}</span>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-900 px-3 font-bold text-white disabled:opacity-60"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} /> Atualizar novamente
            </button>
          </div>
        )}
        {/* Input de Dados + Data (Scrollável, não fixo) */}
        <div className="bg-white border-b-2 border-gray-200 p-4">
           <div className="mb-4 overflow-hidden rounded-lg border text-white shadow-md" style={{backgroundColor: conf.color, borderColor: conf.color}}>
              <div className="grid grid-cols-2 divide-x divide-white/25 p-4">
                <div className="min-w-0 pr-3">
                  <p className="mb-1 text-[11px] font-bold uppercase text-white/80">Total do mês</p>
                  <p className="break-words text-2xl font-black sm:text-3xl">{formatNumber(totalMonth)} <span className="text-base font-medium opacity-80">{conf.unit}</span></p>
                </div>
                <div className="min-w-0 pl-3">
                  <p className="mb-1 text-[11px] font-bold uppercase text-white/80">{type === 'milk' ? 'Média diária' : 'Registros no mês'}</p>
                  <p className="break-words text-2xl font-black sm:text-3xl">
                    {type === 'milk' ? formatNumber(selectedMilkMonth?.average || 0) : dailyList.length}
                    <span className="text-base font-medium opacity-80"> {type === 'milk' ? conf.unit : 'dias'}</span>
                  </p>
                </div>
              </div>
              {type === 'milk' && (
                <button
                  type="button"
                  onClick={() => {
                    setSummaryYear(Number(selectedMonth.slice(0, 4)) || new Date().getFullYear());
                    setShowMilkSummary(true);
                  }}
                  className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-white/25 bg-black/10 px-4 text-sm font-bold active:bg-black/20"
                >
                  <BarChart2 size={18} /> Médias de janeiro a dezembro
                </button>
              )}
           </div>

           <div className="bg-white p-5 rounded-xl shadow-md border border-gray-200 relative z-10">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FieldLabel label={conf.label} helpText="Digite o valor e salve (Requer senha)." />
                {/* Badge indicando novo ou existente */}
                {history.find((h: any) => h.date === entryDate) ? (
                  <span className="text-[11px] font-black px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 flex items-center gap-1 whitespace-nowrap">
                    ✏️ Existe Dado
                  </span>
                ) : (
                  <span className="text-[11px] font-black px-2 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1 whitespace-nowrap">
                    📝 Novo
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-gray-500" />
                <input 
                  type="date" 
                  value={entryDate} 
                  onChange={e => {
                    const now = new Date();
                    const selectedDate = new Date(`${e.target.value}T00:00:00`);
                    if (selectedDate > now) {
                      notify("Não é possível inserir datas futuras.", "error");
                      return;
                    }
                    setEntryDate(e.target.value);
                  }}
                  max={getBusinessDateKey(new Date())}
                  className="px-3 py-2 rounded-lg font-bold text-gray-800 bg-gray-100 border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="flex-1 relative">
                <input 
                  type="number" 
                  value={value} 
                  onChange={e => setValue(e.target.value)} 
                  placeholder="0"
                  className="w-full p-4 text-2xl sm:text-3xl font-black border-2 border-gray-200 rounded-xl text-center focus:border-blue-500 outline-none text-gray-800 bg-gray-50 placeholder-gray-300" 
                />
                {value && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-500 pointer-events-none">{conf.unit}</span>}
              </div>
              <button onClick={handleSaveClick} className="w-full sm:w-auto px-6 py-4 bg-green-600 text-white rounded-xl font-bold flex items-center justify-center shadow-lg active:scale-95 transition-transform hover:bg-green-700">
                <div className="flex items-center gap-2">
                   {!authService.isAuthenticated() && <Lock size={18} className="opacity-75"/>}
                   <Save size={24} className="mr-2 sm:mr-0"/> 
                   <span className="sm:hidden">SALVAR</span>
                </div>
              </button>
            </div>
           </div>
        </div>

        {/* Indicador de carregamento */}
        {isLoading && (
          <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 text-center text-xs font-bold text-blue-500">
            Atualizando dados...
          </div>
        )}

        {/* Filtro de Mês e Toggle Diário/Acumulado (Fixo) */}
        <div className="sticky top-0 z-20 bg-white border-b-2 border-gray-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            {/* Seletor de Mês - Botão que abre modal */}
            <button
              onClick={() => {
                setShowMonthPicker(true);
              }}
              className="flex items-center gap-3 px-4 py-2 rounded-lg font-bold text-gray-800 bg-gray-100 border border-gray-300 shadow-sm hover:bg-gray-200 transition"
            >
              <Calendar size={18} className="text-blue-600" />
              <span>
                {(() => {
                  const [y, m] = selectedMonth.split('-');
                  const date = new Date(parseInt(y), parseInt(m) - 1);
                  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
                })()}
              </span>
            </button>

            {/* Toggle Diário/Acumulado - Direita */}
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
              <button 
                onClick={() => setVizMode('daily')} 
                className={`px-4 py-2 rounded font-bold text-sm transition-all ${vizMode === 'daily' ? 'bg-blue-600 text-white shadow-md' : 'bg-transparent text-gray-600 hover:bg-gray-200'}`}
              >
                📊 Diário
              </button>
              <button 
                onClick={() => setVizMode('accumulated')} 
                className={`px-4 py-2 rounded font-bold text-sm transition-all ${vizMode === 'accumulated' ? 'bg-blue-600 text-white shadow-md' : 'bg-transparent text-gray-600 hover:bg-gray-200'}`}
              >
                📈 Acumulado
              </button>
            </div>
        </div>

        {/* Gráfico com scroll horizontal */}
        <div className="p-4">
          <div className="bg-white p-5 rounded-xl shadow-md border border-gray-200 overflow-x-auto">
              {renderChart()}
          </div>

          {/* Lista Diária */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mt-6">
            <h4 className="font-bold text-gray-800 uppercase text-xs mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-blue-600"/>
                  <span>Registros Diários ({selectedMonth})</span>
                </div>
                {history.length > 0 && (
                  <button
                    onClick={() => void exportCSV()}
                    title="Exportar todos os dados para Excel"
                    className="flex items-center gap-1 px-3 py-1 bg-green-50 border border-green-300 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 transition active:scale-95"
                  >
                    <Download size={13} />
                    Excel
                  </button>
                )}
            </h4>
            {dailyList.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                    <Calendar size={32} className="mx-auto mb-2 opacity-50"/>
                    <p className="text-sm">Sem registros no período</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {dailyList.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-blue-50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-16 text-sm font-black text-gray-700">{item.date}</div>
                                <div className="flex-1">
                                    <div className="text-xs text-gray-500 uppercase font-medium">{item.label}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="text-lg font-black px-3 py-1 rounded-lg" style={{ color: conf.color, backgroundColor: `${conf.color}15` }}>
                                    {formatNumber(item.value)} {conf.unit}
                                </div>
                                <button onClick={() => openEdit(item)} className="p-2 bg-white border border-gray-300 rounded-lg active:bg-gray-100 hover:bg-blue-50 transition-colors">
                                  <Edit2 size={16} className="text-gray-600" />
                                </button>
                                <button onClick={() => void confirmDelete(item)} className="p-2 bg-white border border-gray-300 rounded-lg active:bg-gray-100 hover:bg-red-50 transition-colors">
                                  <Trash2 size={16} className="text-red-600" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>
      </div>

      {editingEntry && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gray-100 p-4 flex justify-between items-center border-b border-gray-200">
              <h3 className="font-black text-gray-800 uppercase">Editar Registro</h3>
              <button onClick={() => setEditingEntry(null)} className="p-2 rounded-full hover:bg-gray-200"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4 bg-gray-50">
              <div className="text-xs font-bold text-gray-500 uppercase">Data</div>
              <div className="font-black text-gray-800">{String(editingEntry.fullDate)}</div>
              <div>
                <FieldLabel label="Valor" />
                <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full p-4 border-2 border-gray-200 rounded-xl font-bold text-gray-800 bg-white outline-none" />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 bg-white flex gap-2">
              <button onClick={() => setEditingEntry(null)} className="flex-1 bg-gray-200 text-gray-700 font-bold py-4 rounded-xl">Cancelar</button>
              <button onClick={() => void saveEdit()} className="flex-1 bg-blue-600 text-white font-black py-4 rounded-xl">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Seleção de Mês/Ano */}
      {showMonthPicker && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-teal-500 p-6 text-white flex flex-col items-center">
              <p className="text-sm font-bold opacity-80 uppercase">Selecione o Mês</p>
              <h2 className="text-3xl font-black">{monthPickerYear}</h2>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Grid de Meses */}
              <div className="grid grid-cols-3 gap-2">
                {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map((monthName, idx) => {
                  const m = String(idx + 1).padStart(2, '0');
                  const monthStr = `${monthPickerYear}-${m}`;
                  const isSelected = selectedMonth === monthStr;
                  
                  return (
                    <button
                      key={monthStr}
                      onClick={() => {
                        setSelectedMonth(monthStr);
                        setShowMonthPicker(false);
                      }}
                      className={`py-3 rounded-lg font-bold text-sm transition-all border-2 ${
                        isSelected
                          ? 'bg-teal-500 text-white border-teal-500 shadow-md'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-teal-300'
                      }`}
                    >
                      {monthName}
                    </button>
                  );
                })}
              </div>

              {/* Navegação de Anos */}
              {(() => {
                const minYear = 2020;
                const maxYear = new Date().getFullYear() + 1;
                return (
                  <div className="flex items-center justify-between gap-2 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => setMonthPickerYear(Math.max(minYear, monthPickerYear - 1))}
                      disabled={monthPickerYear <= minYear}
                      className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Anterior
                    </button>
                    <span className="font-black text-gray-800">{monthPickerYear}</span>
                    <button
                      onClick={() => setMonthPickerYear(Math.min(maxYear, monthPickerYear + 1))}
                      disabled={monthPickerYear >= maxYear}
                      className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Próximo →
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2">
              <button
                onClick={() => setShowMonthPicker(false)}
                className="flex-1 bg-gray-300 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-400 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {type === 'milk' && showMilkSummary && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-lg bg-white shadow-2xl sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-xs font-bold uppercase text-gray-500">Produção de leite</p>
                <h3 className="text-lg font-black text-gray-900">Médias mensais</h3>
              </div>
              <button type="button" onClick={() => setShowMilkSummary(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 active:bg-gray-200" aria-label="Fechar médias">
                <X size={22} />
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
              <button type="button" onClick={() => setSummaryYear((year) => year - 1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white" aria-label="Ano anterior">
                <ChevronLeft size={20} />
              </button>
              <div className="flex-1 text-center text-xl font-black text-gray-900">{summaryYear}</div>
              <button type="button" onClick={() => setSummaryYear((year) => year + 1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white" aria-label="Próximo ano">
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-[52px_1fr_1fr_44px] gap-2 border-b border-gray-200 bg-gray-100 px-4 py-2 text-[10px] font-black uppercase text-gray-600">
                <span>Mês</span><span className="text-right">Média</span><span className="text-right">Total</span><span className="text-right">Dias</span>
              </div>
              {milkSummary.months.map((month) => (
                <div key={month.month} className="grid min-h-11 grid-cols-[52px_1fr_1fr_44px] items-center gap-2 border-b border-gray-100 px-4 py-2 text-sm">
                  <span className="font-black text-gray-800">{month.label}</span>
                  <span className="text-right font-bold text-blue-700">{formatNumber(month.average)} L</span>
                  <span className="text-right font-semibold text-gray-800">{formatNumber(month.total)} L</span>
                  <span className="text-right text-gray-500">{month.days}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 border-t-2 border-gray-300 bg-gray-50">
              <div className="border-b border-r border-gray-200 p-3">
                <p className="text-[10px] font-bold uppercase text-gray-500">Total do ano</p>
                <p className="text-lg font-black text-gray-900">{formatNumber(milkSummary.yearStats.total)} L</p>
              </div>
              <div className="border-b border-gray-200 p-3">
                <p className="text-[10px] font-bold uppercase text-gray-500">Média do ano</p>
                <p className="text-lg font-black text-blue-700">{formatNumber(milkSummary.yearStats.average)} L/dia</p>
              </div>
              <div className="border-r border-gray-200 p-3">
                <p className="text-[10px] font-bold uppercase text-gray-500">Total geral</p>
                <p className="text-lg font-black text-gray-900">{formatNumber(milkSummary.allTimeStats.total)} L</p>
              </div>
              <div className="p-3">
                <p className="text-[10px] font-bold uppercase text-gray-500">Média geral</p>
                <p className="text-lg font-black text-blue-700">{formatNumber(milkSummary.allTimeStats.average)} L/dia</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Substituição */}
      {isReplacing && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-yellow-100 p-4 border-b-2 border-yellow-300">
              <h3 className="font-black text-yellow-800 uppercase flex items-center gap-2">
                <span>⚠️</span> Confirmar Substituição
              </h3>
            </div>
            <div className="p-6 space-y-4 bg-gray-50">
              <p className="text-gray-700 font-semibold">
                Você tem certeza que deseja <strong>substituir</strong> o dado já existente em <strong>{entryDate}</strong>?
              </p>
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-600">
                  <span className="font-bold">Novo valor:</span> {formatNumber(parseFloat(value))} {conf.unit}
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 bg-white flex gap-2">
              <button 
                onClick={() => setIsReplacing(false)} 
                className="flex-1 bg-gray-200 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-300 transition"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmReplace} 
                className="flex-1 bg-yellow-500 text-white font-black py-3 rounded-xl hover:bg-yellow-600 transition"
              >
                Substituir
              </button>
            </div>
          </div>
        </div>
      )}

      {showPinModal && (
        <PinRequestModal 
            onSuccess={() => {
              void (async () => {
                setShowPinModal(false);
                if (pendingReplaceAction) {
                  try {
                    await pendingReplaceAction();
                  } catch (e) {
                    console.error(e);
                    notify('Erro ao executar ação.', 'error');
                  }
                  setPendingReplaceAction(null);
                  return;
                }
                if (pendingProtectedAction) {
                  try {
                    await pendingProtectedAction();
                  } catch (e) {
                    console.error(e);
                    notify('Erro ao executar ação.', 'error');
                  }
                  setPendingProtectedAction(null);
                  return;
                }
                await performSave();
              })();
            }}
            onClose={() => { setShowPinModal(false); setPendingProtectedAction(null); setPendingReplaceAction(null); }}
        />
      )}
    </Layout>
  );
};
