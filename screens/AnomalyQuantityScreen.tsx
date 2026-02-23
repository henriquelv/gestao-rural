import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { db } from '../services/db.service';
import { localdb } from '../services/localdb';
import { notify } from '../services/notification.service';
import { authService } from '../services/auth.service';
import { PinRequestModal } from '../components/PinRequestModal';
import { Anomaly } from '../types';
import { SectorType, DEFAULT_SECTOR_BASE_COLOR, SECTORS_LIST } from '../constants/sectors';
import { Filter, BarChart3, Lock, TrendingUp, X, Calendar, ChevronDown, ChevronUp } from 'lucide-react';

interface MonthData {
  month: string;
  label: string;
  bySetor: Record<SectorType, number>;
}

type ViewMode = 'chart' | 'table' | 'period';

export const AnomalyQuantityScreen: React.FC = () => {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [closedMonths, setClosedMonths] = useState<Record<string, Record<SectorType, number>>>({});
  
  // Filtros
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [monthsToShow, setMonthsToShow] = useState(12);
  const [selectedSector, setSelectedSector] = useState<SectorType | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // Carregar meses fechados do localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('closedMonths');
      if (saved) {
        setClosedMonths(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Erro ao carregar meses fechados:', e);
    }
  }, []);

  // Salvar meses fechados quando mudar
  useEffect(() => {
    try {
      localStorage.setItem('closedMonths', JSON.stringify(closedMonths));
    } catch (e) {
      console.error('Erro ao salvar meses fechados:', e);
    }
  }, [closedMonths]);

  // Verificar autenticação
  useEffect(() => {
    if (!authService.isAuthenticated()) {
      setShowPinModal(true);
    } else {
      setAccessGranted(true);
      loadAnomalies();
    }
  }, []);

  const handlePinSuccess = () => {
    setAccessGranted(true);
    setShowPinModal(false);
    loadAnomalies();
  };

  const loadAnomalies = async () => {
    try {
      const data = await db.getAnomalies();
      setAnomalies(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Erro ao carregar anomalias:', e);
      notify('Erro ao carregar dados', 'error');
    }
  };

  // Subscribe para atualização automática
  useEffect(() => {
    if (!accessGranted) return;
    
    const unsub = localdb.subscribe('anomalies', () => {
      loadAnomalies();
    });

    return () => unsub && unsub();
  }, [accessGranted]);

  // Filtrar anomalias por período
  const filteredByPeriod = anomalies.filter(a => {
    const aDate = new Date(a.createdAt);
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59);
    return aDate >= start && aDate <= end;
  });

  // Gerar dados por mês (com meses fechados imutáveis)
  const getMonthlyData = (): MonthData[] => {
    const now = new Date();
    const months: MonthData[] = [];

    const startYear = 2026;
    const startMonth = 0; // Janeiro
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    for (let y = startYear; y <= currentYear; y++) {
      const startM = y === startYear ? startMonth : 0;
      const endM = y === currentYear ? currentMonth : 11;

      for (let m = startM; m <= endM; m++) {
        const date = new Date(y, m, 1);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        // Se o mês está fechado (é mês passado ou anterior), usar dados salvos se existirem
        const isMêsPassado = (y < currentYear) || (y === currentYear && m < currentMonth);
        
        let bySetor: Record<SectorType, number>;

        // Sempre calcular a partir das anomalias para ter dados atualizados
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);

        const monthAnomalies = anomalies.filter(a => {
          const aDate = new Date(a.createdAt);
          return aDate >= startOfMonth && aDate <= endOfMonth;
        });

        bySetor = {} as Record<SectorType, number>;
        SECTORS_LIST.forEach(s => {
          bySetor[s] = 0;
        });

        // Contar TODAS as anomalias do mês
        monthAnomalies.forEach(a => {
          const sector = (a.sector || 'Ordenha') as SectorType;
          
          // Se o setor é válido, incrementar seu contador
          if (SECTORS_LIST.includes(sector as any)) {
            bySetor[sector]++;
          } else {
            // Fallback: colocar em "Ordenha"
            bySetor['Ordenha']++;
          }
        });

        // Salvar dados de mês passado para preservar histórico
        if (isMêsPassado && !closedMonths[monthKey]) {
          setClosedMonths(prev => ({
            ...prev,
            [monthKey]: bySetor
          }));
        }

        // Label: jan 26, fev 26, mar 26, etc.
        const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        const label = `${monthNames[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;

        months.push({
          month: monthKey,
          label,
          bySetor
        });
      }
    }

    return months;
  };

  const monthlyData = getMonthlyData();

  // Dados do gráfico (filtrados por setor se selecionado)
  const chartData = monthlyData.map(m => {
    if (selectedSector === 'all') {
      return {
        ...m,
        total: Object.values(m.bySetor).reduce((a, b) => a + b, 0)
      };
    } else {
      return {
        ...m,
        total: m.bySetor[selectedSector] || 0
      };
    }
  });

  const maxValue = Math.max(...chartData.map(d => d.total), 5) * 1.1;

  // Estatísticas totais do DASHBOARD - USAR DADOS DE JANEIRO APENAS (MESMOS DO GRÁFICO)
  const janData = monthlyData.find(m => m.month === '2026-01');
  const stats = janData ? { ...janData.bySetor } : ({} as Record<SectorType, number>);
  
  // Garantir que todos os setores apareçam
  SECTORS_LIST.forEach(s => {
    if (!(s in stats)) stats[s] = 0;
  });

  const totalAnomalies = Object.values(stats).reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setSelectedSector('all');
    setMonthsToShow(12);
    setViewMode('chart');
    const now = new Date();
    setStartDate('2026-01-01');
    setEndDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  };

  if (!accessGranted) {
    return (
      <Layout>
        <Header title="Quantidade de Anomalias" targetRoute="/anomalies" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Lock size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 font-bold">Acessando...</p>
          </div>
        </div>
        {showPinModal && (
          <PinRequestModal
            onSuccess={handlePinSuccess}
            onClose={() => window.history.back()}
            title="Quantidade de Anomalias"
          />
        )}
      </Layout>
    );
  }

  return (
    <Layout>
      <Header title="Quantidade de Anomalias" targetRoute="/anomalies" />
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 pb-24">
        {/* FILTROS - COLAPSÁVEL */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition"
          >
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Filter size={18} className="text-blue-600" />
              Filtros
            </h3>
            {filtersOpen ? (
              <ChevronUp size={20} className="text-gray-600" />
            ) : (
              <ChevronDown size={20} className="text-gray-600" />
            )}
          </button>

          {filtersOpen && (
            <div className="border-t border-gray-200 p-4 space-y-3">
              {/* Filtro por Setor */}
              <div>
                <label className="text-xs font-bold text-gray-600 mb-2 block">Filtrar por Setor</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSelectedSector('all')}
                    className={`p-2 rounded-lg font-bold text-sm transition ${
                      selectedSector === 'all'
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Total (Todos)
                  </button>
                  {SECTORS_LIST.map(sector => (
                    <button
                      key={sector}
                      onClick={() => setSelectedSector(sector)}
                      className={`p-2 rounded-lg font-bold text-sm transition truncate ${
                        selectedSector === sector
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      style={selectedSector === sector ? { backgroundColor: DEFAULT_SECTOR_BASE_COLOR[sector] } : {}}
                    >
                      {sector}
                    </button>
                  ))}
                </div>
              </div>

              {/* Períodos a mostrar */}
              <div>
                <label className="text-xs font-bold text-gray-600 mb-2 block">Períodos</label>
                <div className="flex gap-2">
                  {[3, 6, 12].map(n => (
                    <button
                      key={n}
                      onClick={() => setMonthsToShow(n)}
                      className={`flex-1 p-2 rounded-lg font-bold text-sm transition ${
                        monthsToShow === n
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {n}M
                    </button>
                  ))}
                </div>
              </div>

              {/* Modo de Visualização */}
              <div>
                <label className="text-xs font-bold text-gray-600 mb-2 block">Visualização</label>
                <div className="flex gap-2">
                  {[
                    { key: 'chart', label: 'Gráfico' },
                    { key: 'table', label: 'Tabela' },
                    { key: 'period', label: 'Período' }
                  ].map(mode => (
                    <button
                      key={mode.key}
                      onClick={() => setViewMode(mode.key as ViewMode)}
                      className={`flex-1 p-2 rounded-lg font-bold text-sm transition ${
                        viewMode === mode.key
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtro de Datas (Período) */}
              {viewMode === 'period' && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200">
                  <div>
                    <label className="text-xs font-bold text-gray-600">De</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg font-bold text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600">Até</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg font-bold text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Botão Limpar Filtros */}
              {selectedSector !== 'all' && (
                <button
                  onClick={clearFilters}
                  className="w-full px-3 py-2 bg-red-100 text-red-600 font-bold rounded-lg hover:bg-red-200 transition text-sm flex items-center justify-center gap-1 border-t border-gray-200 mt-3 pt-3"
                >
                  <X size={16} /> Limpar Filtros
                </button>
              )}
            </div>
          )}
        </div>

        {/* GRÁFICO */}
        {viewMode === 'chart' && (
          chartData.some(d => d.total > 0) ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="font-black text-gray-800 uppercase text-sm mb-4">
                {selectedSector === 'all' ? 'Anomalias por Mês' : `Anomalias - ${selectedSector}`}
              </h3>
              
              <div className="overflow-x-auto pb-4">
                <div className="flex items-end justify-start gap-1 h-40 px-2" style={{ minWidth: `${chartData.length * 70}px` }}>
                  {chartData.map((data, i) => {
                    const heightPercent = (data.total / maxValue) * 100;
                    
                    // Se filtrado por setor, mostrar só uma cor
                    if (selectedSector !== 'all') {
                      const barColor = DEFAULT_SECTOR_BASE_COLOR[selectedSector];
                      return (
                        <div key={i} className="flex flex-col justify-end items-center group relative flex-1 h-full" style={{ minWidth: '55px' }}>
                          <div className="text-[11px] font-black mb-1 h-5 flex items-end" style={{ color: barColor }}>
                            {data.total > 0 ? data.total : '-'}
                          </div>

                          <div 
                            className="rounded-t-md transition-all duration-500 ease-out hover:opacity-80 cursor-pointer shadow-sm"
                            style={{ 
                              width: '14px',
                              height: `${Math.max(heightPercent, 2)}%`, 
                              backgroundColor: barColor,
                            }}
                            title={`${data.label}: ${data.total}`}
                          ></div>

                          <span className="text-[9px] text-gray-600 mt-2 font-semibold uppercase">{data.label}</span>
                        </div>
                      );
                    }

                    // Se não filtrado, mostrar barra empilhada com números dentro de cada cor
                    return (
                      <div key={i} className="flex flex-col justify-end items-center group relative flex-1 h-full" style={{ minWidth: '55px' }}>
                        <div className="text-[11px] font-black mb-1 h-5 flex items-end text-gray-800">
                          {data.total > 0 ? data.total : '-'}
                        </div>

                        <div className="flex flex-col-reverse rounded-t-md overflow-hidden shadow-sm transition-all duration-500 ease-out hover:opacity-80 cursor-pointer relative" style={{ width: '14px', height: `${Math.max(heightPercent, 2)}%` }}>
                          {SECTORS_LIST.map(setor => {
                            const count = data.bySetor[setor] || 0;
                            const sectorPercent = data.total > 0 ? (count / data.total) * 100 : 0;
                            
                            if (sectorPercent === 0) return null;

                            const showNumber = sectorPercent > 25; // Mostrar número só se houver espaço

                            return (
                              <div
                                key={setor}
                                className="flex items-center justify-center text-white font-bold text-[8px] transition-opacity"
                                style={{
                                  height: `${sectorPercent}%`,
                                  backgroundColor: DEFAULT_SECTOR_BASE_COLOR[setor],
                                  opacity: 1
                                }}
                                title={`${setor}: ${count}`}
                              >
                                {showNumber && count > 0 && count}
                              </div>
                            );
                          })}
                        </div>

                        <span className="text-[9px] text-gray-600 mt-2 font-semibold uppercase">{data.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-600">
                <p>Cada barra representa um mês (1º ao último dia)</p>
                {selectedSector !== 'all' && <p>Mostrando apenas: <strong>{selectedSector}</strong></p>}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <BarChart3 size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500 font-bold">Sem dados para exibir</p>
            </div>
          )
        )}

        {/* TABELA */}
        {viewMode === 'table' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="p-3 text-left font-bold text-gray-800">Mês</th>
                    {selectedSector === 'all' ? (
                      SECTORS_LIST.map(s => (
                        <th key={s} className="p-3 text-center font-bold text-gray-800">{s}</th>
                      ))
                    ) : (
                      <th className="p-3 text-center font-bold text-gray-800">{selectedSector}</th>
                    )}
                    <th className="p-3 text-center font-bold text-gray-800">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((month, i) => {
                    const monthTotal = selectedSector === 'all' 
                      ? Object.values(month.bySetor).reduce((a, b) => a + b, 0)
                      : (month.bySetor[selectedSector as SectorType] || 0);
                    
                    return (
                      <tr key={i} className="border-b border-gray-200 hover:bg-gray-50 transition">
                        <td className="p-3 font-bold text-gray-700">{month.label}</td>
                        {selectedSector === 'all' ? (
                          SECTORS_LIST.map(s => (
                            <td key={s} className="p-3 text-center">
                              <span className="inline-block px-2 py-1 rounded font-bold" style={{ backgroundColor: DEFAULT_SECTOR_BASE_COLOR[s] + '30', color: DEFAULT_SECTOR_BASE_COLOR[s] }}>
                                {month.bySetor[s] || 0}
                              </span>
                            </td>
                          ))
                        ) : (
                          <td className="p-3 text-center font-bold" style={{ color: DEFAULT_SECTOR_BASE_COLOR[selectedSector as SectorType] }}>
                            {monthTotal}
                          </td>
                        )}
                        <td className="p-3 text-center font-black text-lg text-gray-900">{monthTotal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PERÍODO */}
        {viewMode === 'period' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 className="font-black text-gray-800 uppercase text-sm mb-4 flex items-center gap-2">
              <Calendar size={18} className="text-blue-600" />
              Período de {startDate} a {endDate}
            </h3>
            <div className="space-y-3">
              {Object.entries(stats).map(([setor, count]) => {
                if (selectedSector !== 'all' && selectedSector !== setor) return null;
                return (
                  <div key={setor} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: DEFAULT_SECTOR_BASE_COLOR[setor as SectorType] }}></div>
                        <span className="capitalize font-bold text-gray-800">{setor}</span>
                      </div>
                      <span className="font-black text-xl" style={{ color: DEFAULT_SECTOR_BASE_COLOR[setor as SectorType] }}>
                        {count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TOTAL ACUMULADO - LEGENDA CLICÁVEL (SEM BARRA) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-black text-gray-800 uppercase text-sm mb-4">
            Total Acumulado
          </h3>

          {/* Legenda - lista formato */}
          <div className="space-y-2">
            <button
              onClick={() => setSelectedSector('all')}
              className={`w-full p-3 rounded-lg font-bold text-sm transition flex items-center justify-between ${
                selectedSector === 'all'
                  ? 'bg-gray-800 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>Total (Todos os Setores)</span>
              <span className="text-lg font-black">{totalAnomalies}</span>
            </button>

            {SECTORS_LIST.map(sector => {
              const count = anomalies.filter(a => a.sector === sector).length;
              return (
                <button
                  key={sector}
                  onClick={() => setSelectedSector(sector)}
                  className={`w-full p-3 rounded-lg flex items-center justify-between transition ${
                    selectedSector === sector
                      ? 'shadow-md transform scale-105'
                      : 'hover:bg-gray-50'
                  }`}
                  style={selectedSector === sector ? { backgroundColor: DEFAULT_SECTOR_BASE_COLOR[sector] + '20' } : {}}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: DEFAULT_SECTOR_BASE_COLOR[sector] }}
                    ></div>
                    <span className="font-bold text-gray-800">{sector}</span>
                  </div>
                  <span className="font-black text-lg" style={{ color: DEFAULT_SECTOR_BASE_COLOR[sector] }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* INFORMAÇÕES */}
        <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4 text-sm text-gray-700">
          <p className="font-bold mb-2 flex items-center gap-2"><TrendingUp size={16} /> Informações:</p>
          <ul className="space-y-1 text-xs">
            <li>• Cada barra/linha representa um mês (1º ao último dia)</li>
            <li>• Clique em um setor abaixo para filtrar o gráfico</li>
            <li>• O total acumulado mostra o somatório de todos os meses</li>
            <li>• O gráfico atualiza automaticamente quando anomalias são adicionadas</li>
            <li>• Use os filtros acima para diferentes visualizações</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
};