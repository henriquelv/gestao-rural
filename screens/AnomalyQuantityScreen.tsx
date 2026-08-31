import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { db } from '../services/db.service';
import { localdb } from '../services/localdb';
import { notify } from '../services/notification.service';
import { Anomaly } from '../types';
import { SectorType, DEFAULT_SECTOR_BASE_COLOR, SECTORS_LIST } from '../constants/sectors';
import { Filter, TrendingUp, X, Calendar, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { getAnomalyDateParts, groupAnomaliesByMonth, isAnomalyInDateRange } from '../utils/anomaly-months';
import { buildAnomalyPareto } from '../utils/anomaly-pareto';
import { SpreadsheetExportSheet } from '../components/SpreadsheetExportSheet';
import { AnomalyExportFormat, exportAnomalyReport } from '../services/anomaly-export.service';

interface MonthData {
  month: string;
  label: string;
  bySetor: Record<SectorType, number>;
  unknownCount: number;
}

type ViewMode = 'chart' | 'table' | 'period' | 'pareto';

export const AnomalyQuantityScreen: React.FC = () => {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const loadingRef = useRef(false);
  const queuedRef = useRef(false);
  const mountedRef = useRef(false);
  
  // Filtros
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedSector, setSelectedSector] = useState<SectorType | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [isExporting, setIsExporting] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [startDate, setStartDate] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const loadAnomalies = async () => {
    if (loadingRef.current) {
      queuedRef.current = true;
      return;
    }
    loadingRef.current = true;
    try {
      const data = await db.getAnomalies();
      if (mountedRef.current) setAnomalies(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Erro ao carregar anomalias:', e);
      notify('Erro ao carregar dados', 'error');
    } finally {
      loadingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void loadAnomalies();
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void loadAnomalies();
    const unsub = localdb.subscribe('anomalies', loadAnomalies);
    return () => {
      mountedRef.current = false;
      unsub?.();
    };
  }, []);

  // Filtrar anomalias por período
  const filteredByPeriod = anomalies.filter(a => {
    return isAnomalyInDateRange(a.createdAt, startDate, endDate);
  });

  const annualAnomalies = anomalies.filter((a) => getAnomalyDateParts(a.createdAt)?.year === selectedYear);

  // Gerar dados por mês: sempre janeiro a dezembro, com zero quando nao houver registros.
  const getMonthlyData = (): MonthData[] => {
    return groupAnomaliesByMonth(anomalies, selectedYear);
  };

  const monthlyData = getMonthlyData();

  // Dados do gráfico (filtrados por setor se selecionado)
  const chartData = monthlyData.map(m => {
    if (selectedSector === 'all') {
      return {
        ...m,
        total: Object.values(m.bySetor).reduce((a, b) => a + b, 0) + m.unknownCount
      };
    } else {
      return {
        ...m,
        total: m.bySetor[selectedSector] || 0
      };
    }
  });

  const maxValue = Math.max(...chartData.map(d => d.total), 5) * 1.1;

  const stats = {} as Record<SectorType, number>;
  
  // Garantir que todos os setores apareçam
  SECTORS_LIST.forEach(s => {
    stats[s] = filteredByPeriod.filter(a => a.sector === s).length;
  });

  const totalAnomalies = annualAnomalies.length;
  const paretoData = buildAnomalyPareto(annualAnomalies);
  const paretoMax = Math.max(...paretoData.map((row) => row.count), 1);

  const exportAnnualAnomalies = async (format: AnomalyExportFormat) => {
    if (isExporting || annualAnomalies.length === 0) return;
    setIsExporting(true);
    try {
      const result = await exportAnomalyReport(
        annualAnomalies,
        `anomalias_pareto_${selectedYear}`,
        format,
        `Ano ${selectedYear}`
      );
      setShowExportSheet(false);
      notify(
        result.native && result.notificationShown
          ? `Planilha pronta. Toque na notificação para abrir ${result.fileName}.`
          : result.native
            ? `Planilha salva em ${result.location === 'downloads' ? 'Downloads' : 'Documentos'}/Gestao Rural/${result.fileName}.`
            : 'Dados do Pareto exportados.',
        'success'
      );
    } catch (error) {
      console.error('[ParetoExport] Falha ao gerar arquivo:', error);
      notify('Não foi possível exportar os dados.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const clearFilters = () => {
    setSelectedSector('all');
    setViewMode('chart');
    const now = new Date();
    const year = now.getFullYear();
    setSelectedYear(year);
    setStartDate(`${year}-01-01`);
    setEndDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  };

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

              {/* Ano do gráfico anual */}
              <div>
                <label className="text-xs font-bold text-gray-600 mb-2 block">Ano do gráfico</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedYear(y => y - 1)}
                    className="p-2 rounded-lg bg-gray-100 text-gray-700 border border-gray-200"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-2 text-center text-lg font-black text-gray-900">
                    {selectedYear}
                  </div>
                  <button
                    onClick={() => setSelectedYear(y => y + 1)}
                    className="p-2 rounded-lg bg-gray-100 text-gray-700 border border-gray-200"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              {/* Modo de Visualização */}
              <div>
                <label className="text-xs font-bold text-gray-600 mb-2 block">Visualização</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'chart', label: 'Gráfico' },
                    { key: 'table', label: 'Tabela' },
                    { key: 'period', label: 'Período' },
                    { key: 'pareto', label: 'Pareto' }
                  ].map(mode => (
                    <button
                      key={mode.key}
                      onClick={() => {
                        setViewMode(mode.key as ViewMode);
                        if (mode.key === 'pareto') setSelectedSector('all');
                      }}
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
              {(selectedSector !== 'all' || selectedYear !== new Date().getFullYear() || viewMode !== 'chart') && (
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="font-black text-gray-800 uppercase text-sm mb-4">
                {selectedSector === 'all' ? `Anomalias por Mês - ${selectedYear}` : `Anomalias - ${selectedSector} - ${selectedYear}`}
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
                            {data.total}
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
                          {data.total}
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
                          {data.unknownCount > 0 && (
                            <div
                              className="flex items-center justify-center text-white font-bold text-[8px]"
                              style={{ height: `${(data.unknownCount / data.total) * 100}%`, backgroundColor: '#6B7280' }}
                              title={`Outros/legado: ${data.unknownCount}`}
                            >
                              {data.unknownCount}
                            </div>
                          )}
                        </div>

                        <span className="text-[9px] text-gray-600 mt-2 font-semibold uppercase">{data.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-600">
                <p>Cada barra representa um mês de janeiro a dezembro de {selectedYear}</p>
                {selectedSector !== 'all' && <p>Mostrando apenas: <strong>{selectedSector}</strong></p>}
              </div>
          </div>
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
                      <>
                        {SECTORS_LIST.map(s => (
                          <th key={s} className="p-3 text-center font-bold text-gray-800">{s}</th>
                        ))}
                        <th className="p-3 text-center font-bold text-gray-800">Outros/legado</th>
                      </>
                    ) : (
                      <th className="p-3 text-center font-bold text-gray-800">{selectedSector}</th>
                    )}
                    <th className="p-3 text-center font-bold text-gray-800">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((month, i) => {
                    const monthTotal = selectedSector === 'all' 
                      ? Object.values(month.bySetor).reduce((a, b) => a + b, 0) + month.unknownCount
                      : (month.bySetor[selectedSector as SectorType] || 0);
                    
                    return (
                      <tr key={i} className="border-b border-gray-200 hover:bg-gray-50 transition">
                        <td className="p-3 font-bold text-gray-700">{month.label}</td>
                        {selectedSector === 'all' ? (
                          <>
                            {SECTORS_LIST.map(s => (
                              <td key={s} className="p-3 text-center">
                                <span className="inline-block px-2 py-1 rounded font-bold" style={{ backgroundColor: DEFAULT_SECTOR_BASE_COLOR[s] + '30', color: DEFAULT_SECTOR_BASE_COLOR[s] }}>
                                  {month.bySetor[s] || 0}
                                </span>
                              </td>
                            ))}
                            <td className="p-3 text-center font-bold text-gray-600">{month.unknownCount}</td>
                          </>
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

        {viewMode === 'pareto' && (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-black uppercase text-gray-800">Pareto por setor - {selectedYear}</h3>
                <p className="text-xs text-gray-500">Ordenado do maior impacto para o menor</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExportSheet(true)}
                disabled={isExporting || annualAnomalies.length === 0}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50"
                title="Baixar planilha do Pareto"
                aria-label="Baixar planilha do Pareto"
              >
                <Download size={19} />
              </button>
            </div>

            {paretoData.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-500">Sem anomalias em {selectedYear}.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {paretoData.map((row) => (
                  <div key={row.label} className="px-4 py-3">
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-bold text-gray-800">{row.label}</span>
                      <span className="shrink-0 text-sm font-black text-gray-900">{row.count}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded bg-gray-100">
                      <div className="h-full bg-blue-600" style={{ width: `${(row.count / paretoMax) * 100}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] font-semibold text-gray-500">
                      <span>{row.percentage.toFixed(1).replace('.', ',')}% do total</span>
                      <span>Acumulado {row.cumulativePercentage.toFixed(1).replace('.', ',')}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TOTAL ACUMULADO - LEGENDA CLICÁVEL (SEM BARRA) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-black text-gray-800 uppercase text-sm mb-4">
            Total Acumulado - {selectedYear}
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
              const count = annualAnomalies.filter(a => a.sector === sector).length;
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
      <SpreadsheetExportSheet
        open={showExportSheet}
        count={annualAnomalies.length}
        busy={isExporting}
        onClose={() => setShowExportSheet(false)}
        onExcel={() => void exportAnnualAnomalies('xlsx')}
        onCsv={() => void exportAnnualAnomalies('csv')}
      />
    </Layout>
  );
};
