
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Filter, X, Image as ImageIcon, Video, Calendar, User, LayoutGrid, List as ListIcon, Table as TableIcon, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { Anomaly } from '../types';
import { db } from '../services/db.service';
import { localdb } from '../services/localdb';
import { notify } from '../services/notification.service';
import { SECTORS_LIST, SectorType, getSectorColors } from '../constants/sectors';
import { mediaService } from '../services/media.service';

// Responsáveis são derivados dos dados atuais para manter filtros atualizados

type SortField = 'createdAt' | 'sector' | 'responsible';
type SortOrder = 'asc' | 'desc';
type ResolvedStatus = 'all' | 'resolved' | 'unresolved';

export const ListAnomaliesScreen: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Anomaly[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  
  // View Mode: 'list' | 'grid' | 'table'
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'table'>('list');

  // Filter States
  const [filterSectors, setFilterSectors] = useState<SectorType[]>([]);
  const [filterResponsible, setFilterResponsible] = useState('');
  const [filterPeriod, setFilterPeriod] = useState<'today' | '7days' | '30days' | 'all' | 'custom'>('all');
  const [filterResolved, setFilterResolved] = useState<ResolvedStatus>('all');
  
  // Custom Date Range
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sorting State
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    loadData();
    const unsub = localdb.subscribe('anomalies', () => {
      loadData();
    });
    return () => unsub && unsub();
  }, []);

  const loadData = async () => {
    const data = await db.getAnomalies();
    setItems(data);
    
    // Carregar URLs das fotos
    const urls: Record<string, string> = {};
    for (const item of data) {
      const photo = item.media?.find(m => m.type === 'photo');
      if (photo) {
        const url = await mediaService.loadMediaUrl(photo);
        if (url) urls[item.id] = url;
      }
    }
    setPhotoUrls(urls);
  };

  const toggleSectorFilter = (s: SectorType) => {
    setFilterSectors(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s]);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    notify(`Ordenando por ${field === 'createdAt' ? 'Data' : field === 'sector' ? 'Setor' : 'Responsável'} (${sortOrder === 'asc' ? 'Decrescente' : 'Crescente'})`, 'info');
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="text-gray-400 ml-1" />;
    return sortOrder === 'asc' ? <ArrowUp size={14} className="text-blue-600 ml-1" /> : <ArrowDown size={14} className="text-blue-600 ml-1" />;
  };

  const filteredItems = useMemo(() => {
    let result = [...items];
    
    // Filters
    if (filterSectors.length > 0) result = result.filter(i => filterSectors.includes(i.sector as SectorType));
    if (filterResponsible) result = result.filter(i => i.responsible.toLowerCase().includes(filterResponsible.toLowerCase()));
    
    // Filter por Status de Resolução
    if (filterResolved === 'resolved') {
      result = result.filter(i => i.resolvedAt !== undefined && i.resolvedAt !== null);
    } else if (filterResolved === 'unresolved') {
      result = result.filter(i => !i.resolvedAt || i.resolvedAt === null);
    }
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (filterPeriod === 'today') {
        result = result.filter(i => new Date(i.createdAt) >= todayStart);
    } else if (filterPeriod === '7days') {
        const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
        result = result.filter(i => new Date(i.createdAt) >= cutoff);
    } else if (filterPeriod === '30days') {
        const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
        result = result.filter(i => new Date(i.createdAt) >= cutoff);
    } else if (filterPeriod === 'custom' && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59); // Include full end day
        result = result.filter(i => {
            const d = new Date(i.createdAt);
            return d >= start && d <= end;
        });
    }

    // Sorting
    result.sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];

        if (sortField === 'createdAt') {
            valA = new Date(valA).getTime();
            valB = new Date(valB).getTime();
        } else {
            valA = valA.toString().toLowerCase();
            valB = valB.toString().toLowerCase();
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    return result.slice(0, 100); // Pagination limit
  }, [items, filterSectors, filterResponsible, filterPeriod, filterResolved, startDate, endDate, sortField, sortOrder]);

  const activeFiltersCount = filterSectors.length + (filterResponsible ? 1 : 0) + (filterPeriod !== 'all' ? 1 : 0) + (filterResolved !== 'all' ? 1 : 0);
  const clearFilters = () => { 
      setFilterSectors([]); 
      setFilterResponsible(''); 
      setFilterPeriod('all'); 
      setFilterResolved('all');
      setStartDate('');
      setEndDate('');
      setShowFilters(false); 
  };

  return (
    <Layout>
      <Header title="Lista de Anomalias" targetRoute="/anomalies" />
      
      {/* TOOLBAR */}
      <div className="bg-white border-b border-gray-200 p-2 shadow-sm z-10 sticky top-16 flex flex-col gap-2">
        <div className="flex gap-2">
            <button 
            onClick={() => setShowFilters(true)}
            className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg font-bold border-2 transition-colors ${activeFiltersCount > 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >
            <Filter size={18} className="mr-2" />
            {activeFiltersCount > 0 ? `Filtros (${activeFiltersCount})` : 'Filtrar'}
            </button>
        </div>

        {/* Intuitve View Toggles */}
        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button 
                onClick={() => setViewMode('list')}
                className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all text-xs font-bold uppercase ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
            >
                <ListIcon size={16} className="mr-1" /> Lista
            </button>
            <button 
                onClick={() => setViewMode('grid')}
                className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all text-xs font-bold uppercase ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
            >
                <LayoutGrid size={16} className="mr-1" /> Grade
            </button>
            <button 
                onClick={() => setViewMode('table')}
                className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all text-xs font-bold uppercase ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
            >
                <TableIcon size={16} className="mr-1" /> Tabela
            </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto bg-gray-100 p-3">
        {filteredItems.length === 0 && <div className="text-center p-10 text-gray-400">Nenhum registro encontrado.</div>}

        {viewMode === 'table' ? (
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                 <div className="overflow-x-auto">
                     <table className="w-full text-sm text-left text-gray-500">
                         <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                             <tr>
                                 <th 
                                    className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none" 
                                    onClick={() => handleSort('createdAt')}
                                 >
                                    <div className="flex items-center">Data {getSortIcon('createdAt')}</div>
                                 </th>
                                 <th 
                                    className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                                    onClick={() => handleSort('sector')}
                                 >
                                    <div className="flex items-center">Setor {getSortIcon('sector')}</div>
                                 </th>
                                 <th 
                                    className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                                    onClick={() => handleSort('responsible')}
                                 >
                                    <div className="flex items-center">Resp. {getSortIcon('responsible')}</div>
                                 </th>
                                 <th className="px-3 py-3 min-w-[150px]">Descrição</th>
                             </tr>
                         </thead>
                         <tbody>
                             {filteredItems.map(item => (
                                 <tr 
                                    key={item.id} 
                                    onClick={() => navigate(`/anomalies/detail/${item.id}`)}
                                    className="bg-white border-b hover:bg-gray-50 active:bg-blue-50 cursor-pointer"
                                 >
                                     <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                                        {new Date(item.createdAt).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}
                                     </td>
                                     <td className="px-3 py-2 whitespace-nowrap">
                                         <span
                                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                            style={{ backgroundColor: getSectorColors(item.sector).bg, color: getSectorColors(item.sector).fg }}
                                         >
                                            {item.sector}
                                         </span>
                                     </td>
                                     <td className="px-3 py-2 whitespace-nowrap text-xs">{item.responsible}</td>
                                     <td className="px-3 py-2 text-xs truncate max-w-[150px]">{item.description}</td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 </div>
             </div>
        ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
                {filteredItems.map((item) => {
                    const photo = item.media.find(m => m.type === 'photo');
                    const hasVideo = item.media.some(m => m.type === 'video');
                    const photoUrl = photoUrls[item.id] || (photo ? mediaService.getRemoteUrl(photo) : '');
                    
                    return (
                    <div 
                        key={item.id} 
                        onClick={() => navigate(`/anomalies/detail/${item.id}`)}
                        className={`bg-white rounded-xl shadow-sm border-gray-200 overflow-hidden active:opacity-90 transition-opacity relative ${viewMode === 'list' ? 'border-l-8 p-4' : 'border'}`}
                        style={viewMode === 'list' ? { borderLeftColor: getSectorColors(item.sector).border } : undefined}
                    >
                        {/* Badge de Resolvido */}
                        {item.resolvedAt && (
                          <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-2 z-10 shadow-lg">
                            <CheckCircle size={20} fill="currentColor" />
                          </div>
                        )}

                        {viewMode === 'grid' && (
                            <div className="h-28 bg-gray-200 w-full relative">
                                {photo ? (
                                    <img
                                      src={photoUrl}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        const next = photo?.remoteUrl || photo?.uri || '';
                                        if (next && (e.currentTarget as HTMLImageElement).src !== next) {
                                          (e.currentTarget as HTMLImageElement).src = next;
                                        }
                                      }}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                                        <ImageIcon size={32} />
                                    </div>
                                )}
                                {hasVideo && <div className="absolute top-2 right-2 bg-purple-600 text-white p-1 rounded-full"><Video size={10}/></div>}
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                                    <span className="text-white text-[10px] font-bold">{new Date(item.createdAt).toLocaleDateString('pt-BR')}</span>
                                </div>
                            </div>
                        )}

                        <div className={viewMode === 'grid' ? 'p-2' : ''}>
                            {viewMode === 'list' && (
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-lg font-black text-gray-800">
                                        {new Date(item.createdAt).toLocaleDateString('pt-BR')} 
                                    </span>
                                    <div className="flex gap-2">
                                        {photo && <ImageIcon size={20} className="text-blue-500"/>}
                                        {hasVideo && <Video size={20} className="text-purple-500"/>}
                                    </div>
                                </div>
                            )}
                            
                            {viewMode === 'grid' ? (
                                <>
                                    <div>
                                      <span
                                        className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
                                        style={{ backgroundColor: getSectorColors(item.sector).bg, color: getSectorColors(item.sector).fg }}
                                      >
                                        {item.sector}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-gray-500 truncate">{item.responsible}</div>
                                </>
                            ) : (
                                <div className="flex items-center gap-2 mb-1">
                                    <span
                                        className="text-xs font-bold uppercase px-2 py-1 rounded"
                                        style={{ backgroundColor: getSectorColors(item.sector).bg, color: getSectorColors(item.sector).fg }}
                                    >
                                        {item.sector}
                                    </span>
                                    <span className="text-gray-600 font-medium text-sm">
                                        {item.responsible}
                                    </span>
                                </div>
                            )}
                            
                            {viewMode === 'list' && <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>}
                        </div>
                    </div>
                    );
                })}
            </div>
        )}
      </div>

      {/* FILTER MODAL */}
      {showFilters && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center animate-in fade-in">
          <div className="bg-white w-full max-w-md p-6 rounded-t-2xl sm:rounded-xl shadow-2xl animate-in slide-in-from-bottom max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-gray-800">Filtrar</h2>
              <button onClick={() => setShowFilters(false)} className="p-2 bg-gray-100 rounded-full"><X size={24} /></button>
            </div>
            <div className="space-y-6 pb-6">
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2 uppercase flex items-center"><Calendar size={16} className="mr-1"/> Período</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                    <button onClick={() => setFilterPeriod('today')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === 'today' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Hoje</button>
                    <button onClick={() => setFilterPeriod('7days')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === '7days' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>7 Dias</button>
                    <button onClick={() => setFilterPeriod('30days')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === '30days' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>30 Dias</button>
                    <button onClick={() => setFilterPeriod('all')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Todos</button>
                </div>
                
                <button 
                  onClick={() => setFilterPeriod('custom')} 
                  className={`w-full p-3 rounded-lg font-bold border-2 mb-2 ${filterPeriod === 'custom' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                >
                  Personalizado
                </button>

                {filterPeriod === 'custom' && (
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 animate-in fade-in">
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-gray-400">De</label>
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2 rounded border" />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-bold text-gray-400">Até</label>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-2 rounded border" />
                        </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2 uppercase flex items-center"><User size={16} className="mr-1"/> Responsável</label>
                <select className="w-full p-4 text-lg border-2 border-gray-300 rounded-xl bg-white" value={filterResponsible} onChange={(e) => setFilterResponsible(e.target.value)}>
                  <option value="">Qualquer um</option>
                  {Array.from(new Set(items.map(i => i.responsible))).filter(r => r).sort().map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2 uppercase flex items-center"><LayoutGrid size={16} className="mr-1"/> Setores</label>
                <div className="grid grid-cols-2 gap-2">
                    {SECTORS_LIST.map(s => {
                        const isSelected = filterSectors.includes(s);
                        return (
                            <button
                              key={s}
                              onClick={() => toggleSectorFilter(s)}
                              className="p-2 rounded-lg text-sm font-bold border-2"
                              style={isSelected
                                ? { backgroundColor: getSectorColors(s).bg, color: getSectorColors(s).fg, borderColor: getSectorColors(s).border }
                                : { backgroundColor: '#FFFFFF', color: '#374151', borderColor: '#E5E7EB' }
                              }
                            >
                              {s}
                            </button>
                        )
                    })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2 uppercase flex items-center"><CheckCircle size={16} className="mr-1"/> Status de Resolução</label>
                <div className="grid grid-cols-3 gap-2">
                    <button 
                      onClick={() => setFilterResolved('all')}
                      className={`p-3 rounded-lg font-bold border-2 text-sm ${filterResolved === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                    >
                      Todos
                    </button>
                    <button 
                      onClick={() => setFilterResolved('resolved')}
                      className={`p-3 rounded-lg font-bold border-2 text-sm ${filterResolved === 'resolved' ? 'bg-green-600 text-white' : 'bg-white text-gray-600'}`}
                    >
                      Resolvidas
                    </button>
                    <button 
                      onClick={() => setFilterResolved('unresolved')}
                      className={`p-3 rounded-lg font-bold border-2 text-sm ${filterResolved === 'unresolved' ? 'bg-orange-600 text-white' : 'bg-white text-gray-600'}`}
                    >
                      Pendentes
                    </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-100">
              <button onClick={clearFilters} className="flex-1 py-4 text-gray-600 font-bold text-lg bg-gray-100 rounded-xl">Limpar</button>
              <button onClick={() => setShowFilters(false)} className="flex-2 w-2/3 py-4 text-white font-bold text-lg bg-blue-600 rounded-xl shadow-lg">Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};