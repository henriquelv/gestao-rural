
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { FieldLabel } from '../components/FieldLabel';
import { Trash2, Plus, Save, Home, Edit2, Upload, User, Tag, Square, Type, MessageSquare, AlertCircle, GripVertical, Image as ImageIcon, FolderPlus, X, Lock, ArrowRight, LogOut, Database, RefreshCw, FileText, Droplets, Activity, Ban, Baby, Pencil, TrendingUp, CheckCircle } from 'lucide-react';
import { db } from '../services/db.service';
import { Employee, FarmSettings, UIConfig, AppColor, AppIcon, UIBlock, CustomPage, BlockType, Anomaly, Instruction, Notice, Improvement, FarmDoc } from '../types';
import { notify } from '../services/notification.service';
import { BigButton } from '../components/BigButton';
import { authService } from '../services/auth.service';
import { PinRequestModal } from '../components/PinRequestModal';
import { DEFAULT_SECTOR_BASE_COLOR, getSectorColorOverrides, setSectorColorOverrides, makeSectorColor, getSectorColors } from '../constants/sectors';

type Tab = 'dashboard' | 'registries' | 'visual' | 'data' | 'records';
type SubTab = 'employees' | 'sectors';
type RecordType = 'anomalies' | 'instructions' | 'notices' | 'improvements' | 'norms';

const COLORS: AppColor[] = ['blue', 'green', 'red', 'orange', 'purple', 'gray', 'slate'];

const ICONS: AppIcon[] = [
    'alert', 'file', 'megaphone', 'chart', 'trending', 'book', 'settings', 'plus', 'list', 
    'droplet', 'activity', 'ban', 'baby', 'tractor', 'users', 'clipboard', 'wrench', 'truck', 'box', 'calendar', 'check',
    'sun', 'moon', 'cloud', 'thermometer', 'wind', 'map-pin',
    'phone', 'mail', 'search', 'trash', 'edit', 'save', 'camera', 'video', 'mic', 'play', 'pause', 'stop', 'volume-2',
    'wifi', 'battery', 'bluetooth', 'cpu', 'database', 'hard-drive', 'server', 'smartphone', 'monitor', 'printer', 'speaker', 'headphones',
    'watch', 'scissors', 'key', 'lock', 'unlock', 'shield', 'star', 'heart', 'thumbs-up', 'thumbs-down', 'smile', 'frown', 'meh', 'help-circle', 'info',
    'alert-circle', 'check-circle', 'x-circle', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'chevron-right', 'chevron-left', 'chevron-up', 'chevron-down',
    'menu', 'more-horizontal', 'more-vertical', 'loader', 'refresh-cw', 'upload', 'download', 'share', 'external-link', 'link', 'paperclip',
    'map', 'navigation', 'compass', 'anchor', 'flag', 'bookmark', 'tag', 'hash', 'percent', 'dollar-sign', 'credit-card', 'shopping-cart', 'gift', 'package', 'clock', 'bell', 'eye', 'eye-off', 'user', 'user-plus', 'user-minus', 'user-check', 'user-x'
];

const FIXED_ROUTES = [
    { label: 'Menu Anomalias', val: '/anomalies' },
    { label: 'Adicionar Anomalia', val: '/anomalies/add' },
    { label: 'Lista Anomalias', val: '/anomalies/list' },
    { label: 'Menu Instruções', val: '/instructions' },
    { label: 'Adic. Instrução', val: '/instructions/add' },
    { label: 'Lista Instruções', val: '/instructions/list' },
    { label: 'Menu Comunicados', val: '/notices' },
    { label: 'Novo Comunicado', val: '/notices/add' },
    { label: 'Lista Comunicados', val: '/notices/list' },
    { label: 'Menu Dados', val: '/data' },
    { label: 'Dados Leite', val: '/data/milk' },
    { label: 'Dados Lactação', val: '/data/lactation' },
    { label: 'Menu Melhorias', val: '/improvements' },
    { label: 'Nova Melhoria', val: '/improvements/add' },
    { label: 'Menu Normas', val: '/norms' },
    { label: 'Visualizar Normas', val: '/norms/list' },
    { label: 'Configurações', val: '/settings' },
];

const DEFAULT_SCREENS = [
    { id: 'home', label: 'Tela Inicial (Principal)' },
    { id: 'anomalies_menu', label: 'Menu Anomalias' },
    { id: 'instructions_menu', label: 'Menu Instruções' },
    { id: 'notices_menu', label: 'Menu Comunicados' },
    { id: 'improvements_menu', label: 'Menu Melhorias' },
    { id: 'farm_data_menu', label: 'Menu Dados' },
    { id: 'norms_menu', label: 'Menu Normas' },
];

export const SettingsScreen: React.FC = () => {
  const navigate = useNavigate();
  // Tabs
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('employees');

  // Dashboard Stats
  const [stats, setStats] = useState({ anomalies: 0, improvements: 0, notices: 0, instructions: 0 });

  // Farm Settings
  const [farmName, setFarmName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [farmLogo, setFarmLogo] = useState<string | undefined>(undefined);
  const [headerColor, setHeaderColor] = useState('#1f2937');

  // Employees & Sectors
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState('');
  const [empRole, setEmpRole] = useState('Colaborador'); 
  const [empPhoto, setEmpPhoto] = useState<string | undefined>(undefined);
  
  const [sectors, setSectors] = useState<string[]>([]);
  const [newSector, setNewSector] = useState('');
  const [sectorColorBase, setSectorColorBase] = useState<Record<string, string>>({});
  const [editingSector, setEditingSector] = useState<string | null>(null);
  const [editingSectorName, setEditingSectorName] = useState('');

  // UI Config
  const [uiConfig, setUiConfig] = useState<UIConfig | null>(null);
  const [selectedScreen, setSelectedScreen] = useState<string>('home');
  
  // Editor State
  const [editingBlock, setEditingBlock] = useState<UIBlock | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isCreatingPage, setIsCreatingPage] = useState(false); 
  const [newPageTitle, setNewPageTitle] = useState('');

  // Block Edit Form State
  const [blockType, setBlockType] = useState<BlockType>('button');
  const [blockLabel, setBlockLabel] = useState('');
  const [blockContent, setBlockContent] = useState('');
  const [blockColor, setBlockColor] = useState<AppColor>('blue');
  const [blockIconType, setBlockIconType] = useState<'lucide' | 'custom'>('lucide');
  const [blockIconValue, setBlockIconValue] = useState('alert');
  const [blockRoute, setBlockRoute] = useState('');

  const [blockTypeFilter, setBlockTypeFilter] = useState<'all' | BlockType>('all');
  const [dragId, setDragId] = useState<string | null>(null);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');

  // Records Management State
  const [recordType, setRecordType] = useState<RecordType>('anomalies');
  const [recordsList, setRecordsList] = useState<any[]>([]);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  
  // Generic Edit Form State
  const [editFormTitle, setEditFormTitle] = useState(''); // Used for Title, Content, Description
  const [editFormResponsible, setEditFormResponsible] = useState('');
  const [editFormSector, setEditFormSector] = useState('');

  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void> | void) | null>(null);

  const [dangerUnlocked, setDangerUnlocked] = useState(false);
  const [showDangerModal, setShowDangerModal] = useState(false);
  const [dangerResponsible, setDangerResponsible] = useState('');

  const [syncStatus, setSyncStatus] = useState<{ pendingCount: number; errorCount: number; pending: any[]; errors: any[] } | null>(null);
  const [syncStatusLoading, setSyncStatusLoading] = useState(false);

  useEffect(() => {
     loadAllData();
  }, []);

  useEffect(() => {
    // Carrega estatísticas
    const loadStats = async () => {
      try {
        const [anomalies, improvements, notices, instructions] = await Promise.all([
          db.getAnomalies(),
          db.getImprovements(),
          db.getNotices(),
          db.getInstructions()
        ]);
        setStats({
          anomalies: anomalies?.length || 0,
          improvements: improvements?.length || 0,
          notices: notices?.length || 0,
          instructions: instructions?.length || 0
        });
      } catch (e) {
        console.error('Erro ao carregar estatísticas:', e);
      }
    };
    
    loadStats();
    
    // Re-carregar a cada 5 segundos
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
     if(activeTab === 'records') {
         loadRecords(recordType);
     }
  }, [activeTab, recordType]);

  useEffect(() => {
      setBlockTypeFilter('all');
  }, [selectedScreen]);

  const loadAllData = () => {
      loadSettings();
      loadRegistries();
      loadUI();
  };

  const loadSyncStatus = async () => {
    setSyncStatusLoading(true);
    try {
      const s = await db.getSyncStatus();
      setSyncStatus(s);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncStatusLoading(false);
    }
  };

  const protectedAction = async (action: () => Promise<void> | void, opts?: { forcePin?: boolean }) => {
      const forcePin = opts?.forcePin === true;

      if (authService.isAuthenticated() && !forcePin) {
          try {
              await action();
          } catch (e) {
              console.error(e);
              notify("Erro ao executar ação", "error");
          }
          return;
      }

      setPendingAction(() => action);
      setShowPinModal(true);
  };

  const loadSettings = async () => {
    const s = await db.getSettings();
    setFarmName(s.farmName);
    setOwnerName(s.ownerName || '');
    setFarmLogo(s.farmLogoUri);
    setHeaderColor(s.headerTextColor || '#1f2937');
  };

  const loadRegistries = async () => {
    try {
        const emps = await db.getEmployees();
        // Ordenar funcionários alfabeticamente
        emps.sort((a,b) => a.name.localeCompare(b.name));
        setEmployees(emps);
        
        const secs = await db.getSectors();
        setSectors(secs);

        const overrides = getSectorColorOverrides() as Record<string, string>;
        const next: Record<string, string> = {};
        for (const s of secs) {
          next[s] = overrides[s] || (DEFAULT_SECTOR_BASE_COLOR as any)[s] || '#3B82F6';
        }
        setSectorColorBase(next);
    } catch (e) {
        console.error(e);
        notify("Erro ao carregar registros", "error");
    }
  };

  const loadUI = async () => {
      setUiConfig(await db.getUIConfig());
  };

  // --- RECORDS MANAGEMENT ---
  const loadRecords = async (type: RecordType) => {
      let data: any[] = [];
      switch(type) {
          case 'anomalies': data = await db.getAnomalies(); break;
          case 'instructions': data = await db.getInstructions(); break;
          case 'notices': data = await db.getNotices(); break;
          case 'improvements': data = await db.getImprovements(); break;
          case 'norms': data = await db.getFarmDocs(); break;
      }
      setRecordsList(data);
  };

  const handleDeleteRecord = async (id: string) => {
      const item = recordsList.find((r: any) => r.id === id);
      const name = item?.title || item?.description || item?.content || 'sem nome';
      const isDocument = recordType !== 'anomalies';

      const message = isDocument
        ? `Você deseja excluir o documento "${name}"?`
        : `Tem certeza que deseja excluir permanentemente este item "${name}"?`;

      if(!confirm(message)) return;

      if (isDocument) {
        setPendingAction(() => async () => {
          try {
            switch(recordType) {
              case 'instructions': await db.deleteInstruction(id); break;
              case 'notices': await db.deleteNotice(id); break;
              case 'improvements': await db.deleteImprovement(id); break;
              case 'norms': await db.deleteFarmDoc(id); break;
            }
            notify("Item excluído.", "success");
            setRecordsList(prev => prev.filter((r: any) => r.id !== id));
            await loadRecords(recordType);
          } catch(e) {
            console.error(e);
            notify("Erro ao excluir", "error");
          }
        });
        setShowPinModal(true);
        return;
      }

      try {
          await db.deleteAnomaly(id);
          notify("Item excluído.", "success");
          setRecordsList(prev => prev.filter(item => item.id !== id));
          await loadRecords(recordType);
      } catch(e) {
          console.error(e);
          notify("Erro ao excluir", "error");
      }
  };

  const startEditRecord = (item: any) => {
      setEditingRecord(item);
      // Map generic fields based on type
      if (recordType === 'anomalies') {
          setEditFormTitle(item.description);
          setEditFormResponsible(item.responsible);
          setEditFormSector(item.sector);
      } else if (recordType === 'instructions') {
          setEditFormTitle(item.title);
          setEditFormResponsible(''); 
          setEditFormSector(item.sector);
      } else if (recordType === 'notices') {
          setEditFormTitle(item.content);
          setEditFormResponsible(item.responsible);
          setEditFormSector(''); 
      } else if (recordType === 'improvements') {
          setEditFormTitle(item.description);
          setEditFormResponsible(item.employee);
          setEditFormSector(item.sector);
      } else if (recordType === 'norms') {
          setEditFormTitle(item.title);
          setEditFormResponsible(item.responsible || '');
          setEditFormSector(item.sector);
      }
  };

  const saveEditedRecord = async () => {
      if(!editingRecord) return;

      protectedAction(async () => {
          let updatedItem = { ...editingRecord };

          if (recordType === 'anomalies') {
              updatedItem.description = editFormTitle;
              updatedItem.responsible = editFormResponsible;
              updatedItem.sector = editFormSector;
              await db.updateAnomaly(updatedItem);
          } else if (recordType === 'instructions') {
              updatedItem.title = editFormTitle;
              updatedItem.sector = editFormSector;
              await db.updateInstruction(updatedItem);
          } else if (recordType === 'notices') {
              updatedItem.content = editFormTitle;
              updatedItem.responsible = editFormResponsible;
              await db.updateNotice(updatedItem);
          } else if (recordType === 'improvements') {
              updatedItem.description = editFormTitle;
              updatedItem.employee = editFormResponsible;
              updatedItem.sector = editFormSector;
              await db.updateImprovement(updatedItem);
          } else if (recordType === 'norms') {
              updatedItem.title = editFormTitle;
              updatedItem.responsible = editFormResponsible;
              updatedItem.sector = editFormSector;
              await db.updateFarmDoc(updatedItem);
          }

          setEditingRecord(null);
          notify("Registro atualizado!", "success");
          loadRecords(recordType);
      });
  };

  // --- FARM ACTIONS ---
  const handleSaveFarm = async () => {
    if(!farmName) { notify("Nome da fazenda é obrigatório", "error"); return; }
    protectedAction(async () => {
        try {
            const settings: FarmSettings = { farmName, ownerName, farmLogoUri: farmLogo, headerTextColor: headerColor };
            await db.saveSettings(settings);
            notify("Identidade da fazenda salva!", "success");
        } catch (e) {
            notify("Erro ao salvar. Imagem muito grande?", "error");
        }
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 1 * 1024 * 1024) {
          notify("A imagem deve ter menos de 1MB.", "error");
          return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        if(ev.target?.result) setFarmLogo(ev.target.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- EMPLOYEE ACTIONS ---
  const handleEditEmp = (emp: Employee) => { 
      setEditingEmp(emp); 
      setEmpName(emp.name); 
      setEmpRole(emp.role || 'Colaborador'); 
      setEmpPhoto(emp.photoUri); 
  };

  const handleClearEmpForm = () => { 
      setEditingEmp(null); 
      setEmpName(''); 
      setEmpRole('Colaborador'); 
      setEmpPhoto(undefined); 
  };

  const handleSaveEmp = async () => {
    if(!empName) { notify("Preencha o Nome", "error"); return; }

    protectedAction(async () => {
        try {
            const newEmp: Employee = { 
                id: editingEmp ? editingEmp.id : crypto.randomUUID(), 
                name: empName, 
                role: (empRole || 'Colaborador'), 
                photoUri: empPhoto 
            };

            if(editingEmp) {
                setEmployees(prev => prev.map(e => e.id === newEmp.id ? newEmp : e).sort((a,b)=>a.name.localeCompare(b.name)));
                await db.updateEmployee(newEmp);
            } else {
                setEmployees(prev => [...prev, newEmp].sort((a,b)=>a.name.localeCompare(b.name)));
                await db.addEmployee(newEmp);
            }
            
            handleClearEmpForm(); 
            notify("Funcionário salvo!", "success");
        } catch(e) {
            console.error(e);
            notify("Erro ao salvar funcionário", "error");
        }
    });
  };

  const handleRemoveEmp = async (id: string) => { 
      protectedAction(async () => {
          if(confirm("Remover este funcionário?")) { 
              setEmployees(prev => prev.filter(e => e.id !== id));
              await db.removeEmployee(id); 
              notify("Removido.", "info");
          }
      });
  };

  const handleEmpPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        const r = new FileReader(); r.onload = (ev) => setEmpPhoto(ev.target?.result as string); r.readAsDataURL(e.target.files[0]);
    }
  };

  // --- SECTOR ACTIONS ---
  const handleAddSector = async () => { 
      if(newSector) {
          protectedAction(async () => {
              if(sectors.includes(newSector)) { notify("Setor já existe", "error"); return; }
              setSectors(prev => [...prev, newSector]);
              await db.addSector(newSector); 
              setNewSector(''); 
              notify("Setor adicionado!", "success");
          });
      }
  };

  const handleRemoveSector = async (s: string) => { 
      protectedAction(async () => {
          if(confirm(`Remover o setor "${s}"?`)) { 
              setSectors(prev => prev.filter(item => item !== s));
              await db.removeSector(s); 
              notify("Setor removido.", "info");
          }
      });
  };

  const handleEditSector = async (oldName: string, newName: string) => {
      if (!newName || newName === oldName) {
          setEditingSector(null);
          return;
      }
      protectedAction(async () => {
          if(sectors.includes(newName)) { 
              notify("Setor com este nome já existe", "error"); 
              return; 
          }
          setSectors(prev => prev.map(item => item === oldName ? newName : item));
          // Atualizar cores também
          const colors = getSectorColorOverrides();
          if(colors[oldName as any]) {
              const newColors = { ...colors };
              delete newColors[oldName as any];
              newColors[newName as any] = colors[oldName as any];
              setSectorColorOverrides(newColors as any);
              setSectorColorBase(prev => {
                  const newBase = { ...prev };
                  if(newBase[oldName]) {
                      newBase[newName] = newBase[oldName];
                      delete newBase[oldName];
                  }
                  return newBase;
              });
          }
          await db.renameSector(oldName, newName);
          setEditingSector(null);
          notify("Setor renomeado com sucesso!", "success");
      });
  };

  // --- UI CONFIG ACTIONS ---
  const startEditBlock = (block: UIBlock) => {
      setEditingBlock(block);
      setIsCreatingNew(false);
      setIsCreatingPage(false);
      setBlockType(block.type || 'button');
      setBlockLabel(block.label);
      setBlockContent(block.content || '');
      setBlockColor(block.color);
      setBlockIconType(block.iconType);
      setBlockIconValue(block.iconValue);
      setBlockRoute(block.route);
  };

  const startCreateBlock = (type: BlockType) => {
      setIsCreatingNew(true);
      setEditingBlock(null);
      setIsCreatingPage(false);
      setBlockType(type);
      setBlockLabel(type === 'header' ? 'NOVO TÍTULO' : type === 'button' ? 'Novo Botão' : 'Novo Texto');
      setBlockContent('');
      setBlockColor('blue');
      setBlockIconType('lucide');
      setBlockIconValue('alert');
      setBlockRoute('');
  };

  const saveBlock = async () => {
      if (!uiConfig) return;
      if (!blockLabel) { notify("Texto/Título é obrigatório.", "error"); return; }
      if (blockType === 'button' && !blockRoute) { notify("Botões precisam de um destino.", "error"); return; }

      protectedAction(async () => {
          let newButtons = [...uiConfig.buttons];

          if (isCreatingNew) {
              const newBlock: UIBlock = {
                  id: Date.now().toString(),
                  screen: selectedScreen,
                  type: blockType,
                  label: blockLabel,
                  content: blockContent,
                  color: blockColor,
                  iconType: blockIconType,
                  iconValue: blockIconValue,
                  route: blockRoute,
                  order: newButtons.filter(b => b.screen === selectedScreen).length + 1,
                  visible: true
              };
              newButtons.push(newBlock);
          } else if (editingBlock) {
              newButtons = newButtons.map(b => b.id === editingBlock.id ? {
                  ...b,
                  type: blockType,
                  label: blockLabel,
                  content: blockContent,
                  color: blockColor,
                  iconType: blockIconType,
                  iconValue: blockIconValue,
                  route: blockRoute
              } : b);
          }

          setUiConfig({ ...uiConfig, buttons: newButtons });
          setEditingBlock(null);
          setIsCreatingNew(false);
          
          await db.saveUIConfig({ ...uiConfig, buttons: newButtons });
          notify("Bloco salvo com sucesso!", "success");
      });
  };

  const deleteBlock = async (id: string) => {
      if (!uiConfig) return;
      protectedAction(async () => {
          if (!confirm("Excluir este item?")) return;
          const newButtons = uiConfig.buttons.filter(b => b.id !== id);
          setUiConfig({ ...uiConfig, buttons: newButtons });
          setEditingBlock(null);
          await db.saveUIConfig({ ...uiConfig, buttons: newButtons });
      });
  };

  const handleAddPage = async () => {
    if(!newPageTitle || !uiConfig) { notify("Defina um título para a página.", "error"); return; }
    protectedAction(async () => {
        const id = 'custom_' + Date.now();
        const newPage: CustomPage = { id, title: newPageTitle };
        const newPages = [...(uiConfig.customPages || []), newPage];
        
        setUiConfig({ ...uiConfig, customPages: newPages });
        setSelectedScreen(id); 
        setNewPageTitle('');
        setIsCreatingPage(false);
        
        await db.saveUIConfig({ ...uiConfig, customPages: newPages });
        notify("Nova tela criada!", "success");
    });
  };

  const handleDeletePage = async () => {
     if(!uiConfig) return;
     if(!selectedScreen.startsWith('custom_')) { notify("Telas padrão não podem ser excluídas.", "error"); return; }
     protectedAction(async () => {
         if(!confirm("Excluir esta tela e todos os seus botões?")) return;

         const newPages = (uiConfig.customPages || []).filter(p => p.id !== selectedScreen);
         const newButtons = uiConfig.buttons.filter(b => b.screen !== selectedScreen);
         
         setUiConfig({ buttons: newButtons, customPages: newPages });
         setSelectedScreen('home');
         
         await db.saveUIConfig({ buttons: newButtons, customPages: newPages });
         notify("Tela excluída.", "info");
     });
  };

  const handleClearData = async () => {
    if (!dangerResponsible.trim()) {
      notify('Informe o responsável.', 'error');
      return;
    }

    protectedAction(async () => {
        await db.clearAllData();
        window.location.reload();
    }, { forcePin: true });
  };
  
  const handleLogout = () => {
      authService.logout();
      window.location.reload(); // Recarrega para bloquear tudo novamente
  };

  const currentBlocks = uiConfig?.buttons
    .filter(b => b.screen === selectedScreen)
    .sort((a, b) => a.order - b.order) || [];

  const combinedScreens = [
      ...DEFAULT_SCREENS,
      ...(uiConfig?.customPages || []).map(p => ({ id: p.id, label: `${p.title} (Personalizada)` }))
  ];

  const filteredBlocks = useMemo(() => {
    if (blockTypeFilter === 'all') return currentBlocks;
    return currentBlocks.filter(b => b.type === blockTypeFilter);
  }, [currentBlocks, blockTypeFilter]);

  return (
    <Layout>
      <Header title="Configurações" targetRoute="/" />
      
      {/* IMPROVED TAB BAR */}
      <div className="bg-white shadow-sm z-10 sticky top-16 border-b border-gray-200 overflow-x-auto no-scrollbar">
        <div className="flex p-2 gap-2 min-w-max">
            <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'dashboard' ? 'bg-purple-600 text-white shadow' : 'bg-gray-100 text-gray-500'}`}>Dashboard</button>
            <button onClick={() => setActiveTab('registries')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'registries' ? 'bg-green-600 text-white shadow' : 'bg-gray-100 text-gray-500'}`}>Cadastros</button>
            <button onClick={() => setActiveTab('visual')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'visual' ? 'bg-green-600 text-white shadow' : 'bg-gray-100 text-gray-500'}`}>Visual</button>
            <button onClick={() => setActiveTab('records')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'records' ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-500'}`}>Registros</button>
            <button onClick={() => setActiveTab('data')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'data' ? 'bg-red-600 text-white shadow' : 'bg-gray-100 text-gray-500'}`}>Dados</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-100 p-4 pb-20">
        
        {/* --- DASHBOARD TAB --- */}
        {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-purple-100">
                <h2 className="text-2xl font-black text-gray-800 mb-6">Resumo de Dados</h2>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Anomalias */}
                  <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-red-100 transition" onClick={() => navigate('/anomalies/list')}>
                    <AlertCircle size={32} className="text-red-600 mb-3" />
                    <span className="text-3xl font-black text-red-700">{stats.anomalies}</span>
                    <span className="text-xs text-red-600 font-bold uppercase mt-2">Anomalias</span>
                  </div>
                  
                  {/* Melhorias */}
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-green-100 transition" onClick={() => navigate('/improvements/list')}>
                    <TrendingUp size={32} className="text-green-600 mb-3" />
                    <span className="text-3xl font-black text-green-700">{stats.improvements}</span>
                    <span className="text-xs text-green-600 font-bold uppercase mt-2">Melhorias</span>
                  </div>
                  
                  {/* Comunicados */}
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-100 transition" onClick={() => navigate('/notices/list')}>
                    <FileText size={32} className="text-blue-600 mb-3" />
                    <span className="text-3xl font-black text-blue-700">{stats.notices}</span>
                    <span className="text-xs text-blue-600 font-bold uppercase mt-2">Comunicados</span>
                  </div>
                  
                  {/* Instruções */}
                  <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-purple-100 transition" onClick={() => navigate('/instructions/list')}>
                    <CheckCircle size={32} className="text-purple-600 mb-3" />
                    <span className="text-3xl font-black text-purple-700">{stats.instructions}</span>
                    <span className="text-xs text-purple-600 font-bold uppercase mt-2">Instruções</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-orange-100">
                <h3 className="text-lg font-black text-gray-800 mb-4 flex items-center gap-2">
                  <RefreshCw size={24} className="text-orange-600" />
                  Ações Rápidas
                </h3>
                
                <div className="space-y-3">
                  <button onClick={() => setActiveTab('registries')} className="w-full bg-green-100 text-green-700 font-bold py-4 rounded-xl hover:bg-green-200 transition flex items-center justify-center gap-2 border-2 border-green-300">
                    <User size={20} /> Gerenciar Funcionários e Setores
                  </button>
                  <button onClick={() => setActiveTab('visual')} className="w-full bg-blue-100 text-blue-700 font-bold py-4 rounded-xl hover:bg-blue-200 transition flex items-center justify-center gap-2 border-2 border-blue-300">
                    <Square size={20} /> Personalizar Telas
                  </button>
                  <button onClick={() => setActiveTab('records')} className="w-full bg-purple-100 text-purple-700 font-bold py-4 rounded-xl hover:bg-purple-200 transition flex items-center justify-center gap-2 border-2 border-purple-300">
                    <Pencil size={20} /> Editar Registros
                  </button>
                </div>
              </div>
            </div>
        )}
        
        {/* --- REGISTRIES TAB --- */}
        {activeTab === 'registries' && (
            <div>
                <div className="flex gap-2 mb-4 p-1 bg-gray-200 rounded-xl">
                    <button onClick={() => setActiveSubTab('employees')} className={`flex-1 py-3 rounded-lg text-sm font-black uppercase transition-all ${activeSubTab === 'employees' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'}`}>Funcionários</button>
                    <button onClick={() => setActiveSubTab('sectors')} className={`flex-1 py-3 rounded-lg text-sm font-black uppercase transition-all ${activeSubTab === 'sectors' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'}`}>Setores</button>
                </div>

                {activeSubTab === 'employees' && (
                    <div className="space-y-6">
                        {/* FORMULÁRIO DE FUNCIONÁRIO */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border-2 border-green-100 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-2 h-full bg-green-500"></div>
                            <h3 className="text-green-800 font-black uppercase text-sm mb-4 flex items-center gap-2 pl-2">
                                {editingEmp ? <><Edit2 size={16}/> Editando</> : <><Plus size={16}/> Novo Funcionário</>}
                            </h3>
                            <div className="flex gap-4 mb-4">
                                <div className="relative w-20 h-20 bg-gray-100 rounded-xl overflow-hidden border-2 border-gray-200 flex items-center justify-center shrink-0">
                                    <User className="text-gray-300" size={32}/>
                                    {empPhoto && (
                                      <img
                                        src={empPhoto}
                                        className="absolute inset-0 w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    )}
                                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleEmpPhoto} />
                                </div>
                                <div className="flex-1 space-y-3">
                                    <div>
                                        <input value={empName} onChange={e => setEmpName(e.target.value)} className="w-full p-3 border-2 border-gray-200 rounded-lg font-bold text-gray-800 placeholder-gray-400 focus:border-green-500 outline-none" placeholder="Nome Completo" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {editingEmp && <button onClick={handleClearEmpForm} className="flex-1 bg-gray-200 text-gray-600 font-bold py-3 rounded-lg text-sm uppercase">Cancelar</button>}
                                <button onClick={handleSaveEmp} className="flex-1 bg-green-600 active:bg-green-700 text-white font-black py-3 rounded-lg text-sm shadow uppercase">{editingEmp ? 'Atualizar' : 'Adicionar'}</button>
                            </div>
                        </div>

                        {/* LISTA DE FUNCIONÁRIOS */}
                        <div className="grid gap-3">
                            <h4 className="font-bold text-gray-500 text-xs uppercase px-1">Cadastrados ({employees.length})</h4>
                            {employees.map(emp => (
                                <div key={emp.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3">
                                    <div className="relative w-12 h-12 bg-gray-100 rounded-full overflow-hidden flex items-center justify-center border-2 border-white shadow-sm shrink-0">
                                        <User size={20} className="text-gray-400"/>
                                        {emp.photoUri && (
                                          <img
                                            src={emp.photoUri}
                                            className="absolute inset-0 w-full h-full object-cover"
                                            onError={(e) => {
                                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                                            }}
                                          />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-black text-gray-800 truncate text-sm">{emp.name}</h4>
                                    </div>
                                    <button onClick={() => handleEditEmp(emp)} className="p-3 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Edit2 size={18}/></button>
                                    <button onClick={() => handleRemoveEmp(emp.id)} className="p-3 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"><Trash2 size={18}/></button>
                                </div>
                            ))}
                            {employees.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Nenhum funcionário cadastrado.</p>}
                        </div>
                    </div>
                )}

                {activeSubTab === 'sectors' && (
                    <div className="space-y-6">
                        <div className="bg-white p-5 rounded-xl shadow-sm border-2 border-green-100 flex gap-2 items-end">
                             <div className="flex-1">
                                <FieldLabel label="Novo Setor" />
                                <input value={newSector} onChange={e => setNewSector(e.target.value)} placeholder="Digite o nome..." className="w-full p-4 border-2 border-gray-200 rounded-xl font-bold text-gray-800 focus:border-green-500 outline-none" />
                             </div>
                             <button onClick={handleAddSector} className="bg-green-600 active:bg-green-700 text-white font-black px-6 py-4 rounded-xl shadow mb-[1px] h-[60px] uppercase">ADD</button>
                        </div>
                        <div className="grid gap-2">
                             <h4 className="font-bold text-gray-500 text-xs uppercase px-1">Setores Ativos ({sectors.length})</h4>
                             {sectors.map(s => (
                                <div key={s} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center group">
                                    <div className="flex items-center gap-3 flex-1">
                                        <div className="p-2 rounded-lg" style={{ backgroundColor: makeSectorColor(sectorColorBase[s] || '#3B82F6').bg, color: makeSectorColor(sectorColorBase[s] || '#3B82F6').fg }}><Tag size={20}/></div>
                                        {editingSector === s ? (
                                            <input
                                              type="text"
                                              value={editingSectorName}
                                              onChange={e => setEditingSectorName(e.target.value)}
                                              placeholder="Nome do setor..."
                                              className="p-2 border-2 border-blue-500 rounded-lg font-bold text-gray-800 outline-none flex-1 text-sm"
                                              autoFocus
                                              onKeyPress={(e) => {
                                                if(e.key === 'Enter') handleEditSector(s, editingSectorName);
                                              }}
                                            />
                                        ) : (
                                            <span className="font-black text-gray-700 text-sm uppercase">{s}</span>
                                        )}
                                        <input
                                          type="color"
                                          value={sectorColorBase[s] || '#3B82F6'}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setSectorColorBase(prev => ({ ...prev, [s]: v }));
                                            const merged = { ...getSectorColorOverrides(), [s]: v } as any;
                                            setSectorColorOverrides(merged);
                                          }}
                                          className="h-10 w-10 rounded-lg border border-gray-200 cursor-pointer p-1 bg-white"
                                        />
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        {editingSector === s ? (
                                            <>
                                                <button 
                                                  onClick={() => handleEditSector(s, editingSectorName)}
                                                  className="text-green-600 p-2 hover:bg-green-50 rounded-lg transition-colors"
                                                >
                                                  <CheckCircle size={20}/>
                                                </button>
                                                <button 
                                                  onClick={() => setEditingSector(null)}
                                                  className="text-gray-400 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                                >
                                                  <X size={20}/>
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button 
                                                  onClick={() => {
                                                      setEditingSector(s);
                                                      setEditingSectorName(s);
                                                  }}
                                                  className="text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                  <Pencil size={20}/>
                                                </button>
                                                <button onClick={() => handleRemoveSector(s)} className="text-red-400 p-2 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={20}/></button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* --- RECORDS MANAGEMENT TAB --- */}
        {activeTab === 'records' && (
            <div className="space-y-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <Database size={20} className="text-gray-400" />
                        <h3 className="font-black text-gray-800 uppercase">Dados da Fazenda</h3>
                    </div>
                    <p className="text-sm text-gray-500 font-bold mb-4">Acesse as métricas diárias.</p>
                    <div className="grid grid-cols-2 gap-3">
                        <BigButton icon={Droplets} label="Leite (Diário)" onClick={() => navigate('/data/milk')} color="blue" fullWidth={false} />
                        <BigButton icon={Activity} label="Vacas em Lactação" onClick={() => navigate('/data/lactation')} color="green" fullWidth={false} />
                        <BigButton icon={Ban} label="Vacas de Descarte" onClick={() => navigate('/data/discard')} color="red" fullWidth={false} />
                        <BigButton icon={Baby} label="Nascimentos" onClick={() => navigate('/data/births')} color="purple" fullWidth={false} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <FieldLabel label="Tipo de Registro" />
                    <select value={recordType} onChange={e => setRecordType(e.target.value as RecordType)} className="w-full p-4 border-2 border-gray-200 rounded-xl bg-gray-50 font-bold text-gray-800 text-lg outline-none focus:border-blue-500">
                        <option value="anomalies">Anomalias</option>
                        <option value="instructions">Instruções</option>
                        <option value="notices">Comunicados</option>
                        <option value="improvements">Melhorias</option>
                        <option value="norms">Normas</option>
                    </select>
                </div>

                <div className="space-y-3">
                    {recordsList.map((item: any) => (
                        <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-2 relative pl-4 border-l-4 border-l-blue-500">
                            <div className="flex justify-between items-start">
                                <div className="flex-1 pr-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase bg-gray-100 px-2 py-0.5 rounded">
                                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Sem data'}
                                    </span>
                                    <h4 className="font-bold text-gray-800 text-sm mt-1 line-clamp-2 leading-tight">
                                        {item.title || item.description || item.content}
                                    </h4>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={() => startEditRecord(item)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Edit2 size={18}/></button>
                                    <button onClick={() => handleDeleteRecord(item.id)} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"><Trash2 size={18}/></button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 mt-1 flex-wrap">
                                {item.sector && (
                                  <span
                                    className="text-[10px] font-bold uppercase px-2 py-1 rounded"
                                    style={{ backgroundColor: getSectorColors(String(item.sector).trim()).bg, color: getSectorColors(String(item.sector).trim()).fg }}
                                  >
                                    {String(item.sector).trim()}
                                  </span>
                                )}
                                {item.responsible && <span>Resp: {item.responsible}</span>}
                                {item.employee && <span>Func: {item.employee}</span>}
                            </div>
                        </div>
                    ))}
                    {recordsList.length === 0 && <div className="text-center text-gray-400 mt-10 p-10 border-2 border-dashed border-gray-200 rounded-xl">Nenhum registro encontrado.</div>}
                </div>

                {/* EDIT RECORD MODAL */}
                {editingRecord && (
                    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-in fade-in">
                        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="bg-gray-100 p-4 flex justify-between items-center border-b border-gray-200">
                                <h3 className="font-black text-gray-800 uppercase">Editar Registro</h3>
                                <button onClick={() => setEditingRecord(null)} className="p-2 rounded-full hover:bg-gray-200"><X size={20}/></button>
                            </div>
                            <div className="p-6 overflow-y-auto space-y-4 bg-gray-50">
                                <div>
                                    <FieldLabel label="Descrição / Título" />
                                    <textarea value={editFormTitle} onChange={e => setEditFormTitle(e.target.value)} className="w-full p-4 border-2 border-gray-200 rounded-xl font-bold text-gray-700 h-32 focus:border-blue-500 outline-none" />
                                </div>
                                {recordType !== 'instructions' && (
                                    <div>
                                        <FieldLabel label="Responsável" />
                                        <input value={editFormResponsible} onChange={e => setEditFormResponsible(e.target.value)} className="w-full p-4 border-2 border-gray-200 rounded-xl font-bold text-gray-700 focus:border-blue-500 outline-none" />
                                    </div>
                                )}
                                {recordType !== 'notices' && (
                                    <div>
                                        <FieldLabel label="Setor" />
                                        <select value={editFormSector} onChange={e => setEditFormSector(e.target.value)} className="w-full p-4 border-2 border-gray-200 rounded-xl bg-white font-bold text-gray-700 outline-none">
                                            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t border-gray-200 bg-white">
                                <button onClick={saveEditedRecord} className="w-full bg-blue-600 text-white font-black text-lg py-4 rounded-xl shadow-lg uppercase active:scale-95 transition-transform">SALVAR ALTERAÇÕES</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* --- VISUAL CONFIG TAB --- */}
        {activeTab === 'visual' && uiConfig && (
            <div>
                {!editingBlock && !isCreatingNew && !isCreatingPage && (
                    <>
                        <div className="mb-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-bold text-gray-800 text-lg">Editor de Telas</h3>
                                {selectedScreen.startsWith('custom_') && (
                                    <div className="flex gap-2">
                                      <button onClick={() => {
                                        const page = uiConfig.customPages?.find(p => p.id === selectedScreen);
                                        setRenameTitle(page?.title || '');
                                        setShowRenameModal(true);
                                      }} className="text-xs text-blue-700 font-bold flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 uppercase">
                                        <Pencil size={14}/> Renomear
                                      </button>
                                      <button onClick={handleDeletePage} className="text-xs text-red-600 font-bold flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 uppercase">
                                          <Trash2 size={14}/> Excluir
                                      </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <select value={selectedScreen} onChange={e => setSelectedScreen(e.target.value)} className="flex-1 p-4 bg-gray-50 border-2 border-gray-200 rounded-xl font-bold text-gray-800 outline-none focus:border-blue-500">
                                    {combinedScreens.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                </select>
                                <button onClick={() => setIsCreatingPage(true)} className="bg-blue-100 text-blue-700 px-4 rounded-xl border border-blue-200 shadow-sm font-bold text-sm flex flex-col items-center justify-center leading-none">
                                    <FolderPlus size={20}/>
                                    <span className="text-[10px] mt-1">NOVA</span>
                                </button>
                            </div>
                        </div>

                        {showRenameModal && (
                          <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 animate-in fade-in">
                            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                              <div className="bg-gray-100 p-4 flex justify-between items-center border-b border-gray-200">
                                <h3 className="font-black text-gray-800 uppercase">Renomear Tela</h3>
                                <button onClick={() => setShowRenameModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={20}/></button>
                              </div>
                              <div className="p-6 space-y-4 bg-gray-50">
                                <div>
                                  <FieldLabel label="Nome da Tela" />
                                  <input value={renameTitle} onChange={e => setRenameTitle(e.target.value)} className="w-full p-4 border-2 border-gray-200 rounded-xl font-bold text-gray-800 bg-white outline-none focus:border-blue-500" autoFocus />
                                </div>
                              </div>
                              <div className="p-4 border-t border-gray-200 bg-white flex gap-2">
                                <button onClick={() => setShowRenameModal(false)} className="flex-1 bg-gray-200 text-gray-700 font-bold py-4 rounded-xl">Cancelar</button>
                                <button
                                  onClick={() => {
                                    if (!uiConfig) return;
                                    if (!selectedScreen.startsWith('custom_')) return;
                                    const t = renameTitle.trim();
                                    if (!t) { notify('Informe um nome.', 'error'); return; }

                                    protectedAction(async () => {
                                      const newPages = (uiConfig.customPages || []).map(p => p.id === selectedScreen ? ({ ...p, title: t }) : p);
                                      const newCfg = { ...uiConfig, customPages: newPages };
                                      setUiConfig(newCfg);
                                      await db.saveUIConfig(newCfg);
                                      notify('Tela renomeada!', 'success');
                                      setShowRenameModal(false);
                                    });
                                  }}
                                  className="flex-1 bg-blue-600 text-white font-black py-4 rounded-xl"
                                >
                                  Salvar
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* EDITOR DE LAYOUT */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center px-1">
                                <h4 className="font-black text-gray-400 text-xs uppercase tracking-wider">Elementos da Tela</h4>
                                <span className="text-xs font-bold text-gray-400 bg-gray-200 px-2 py-1 rounded-full">{filteredBlocks.length}</span>
                            </div>

                            <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                              <FieldLabel label="Filtrar por tipo" />
                              <div className="grid grid-cols-5 gap-2">
                                <button onClick={() => setBlockTypeFilter('all')} className={`py-2 rounded-lg text-[10px] font-black uppercase border ${blockTypeFilter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>Todos</button>
                                <button onClick={() => setBlockTypeFilter('button')} className={`py-2 rounded-lg text-[10px] font-black uppercase border ${blockTypeFilter === 'button' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>Botão</button>
                                <button onClick={() => setBlockTypeFilter('header')} className={`py-2 rounded-lg text-[10px] font-black uppercase border ${blockTypeFilter === 'header' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>Título</button>
                                <button onClick={() => setBlockTypeFilter('text')} className={`py-2 rounded-lg text-[10px] font-black uppercase border ${blockTypeFilter === 'text' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}>Texto</button>
                                <button onClick={() => setBlockTypeFilter('card')} className={`py-2 rounded-lg text-[10px] font-black uppercase border ${blockTypeFilter === 'card' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white text-gray-600 border-gray-200'}`}>Aviso</button>
                              </div>
                            </div>

                            {/* ADD BAR */}
                            <div className="grid grid-cols-4 gap-2">
                                <button onClick={() => startCreateBlock('button')} className="bg-white border-2 border-gray-200 p-3 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm hover:border-green-400 hover:bg-green-50 active:scale-95 transition-all">
                                    <Square size={24} className="text-green-600"/>
                                    <span className="text-[10px] font-bold text-gray-600 uppercase">Botão</span>
                                </button>
                                <button onClick={() => startCreateBlock('header')} className="bg-white border-2 border-gray-200 p-3 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all">
                                    <Type size={24} className="text-blue-600"/>
                                    <span className="text-[10px] font-bold text-gray-600 uppercase">Título</span>
                                </button>
                                <button onClick={() => startCreateBlock('text')} className="bg-white border-2 border-gray-200 p-3 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm hover:border-purple-400 hover:bg-purple-50 active:scale-95 transition-all">
                                    <MessageSquare size={24} className="text-purple-600"/>
                                    <span className="text-[10px] font-bold text-gray-600 uppercase">Texto</span>
                                </button>
                                <button onClick={() => startCreateBlock('card')} className="bg-white border-2 border-gray-200 p-3 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm hover:border-yellow-400 hover:bg-yellow-50 active:scale-95 transition-all">
                                    <AlertCircle size={24} className="text-yellow-600"/>
                                    <span className="text-[10px] font-bold text-gray-600 uppercase">Aviso</span>
                                </button>
                            </div>

                            {/* BLOCKS LIST */}
                            <div className="space-y-3">
                                {filteredBlocks.map(block => (
                                    <div
                                      key={block.id}
                                      draggable
                                      onDragStart={() => setDragId(block.id)}
                                      onDragOver={(e) => e.preventDefault()}
                                      onDrop={() => {
                                        if (!uiConfig) return;
                                        if (!dragId || dragId === block.id) return;

                                        const blocks = uiConfig.buttons
                                          .filter(b => b.screen === selectedScreen)
                                          .sort((a, b) => a.order - b.order);

                                        const fromIndex = blocks.findIndex(b => b.id === dragId);
                                        const toIndex = blocks.findIndex(b => b.id === block.id);
                                        if (fromIndex < 0 || toIndex < 0) return;

                                        const moved = [...blocks];
                                        const [it] = moved.splice(fromIndex, 1);
                                        moved.splice(toIndex, 0, it);

                                        const reOrdered = moved.map((b, idx) => ({ ...b, order: idx + 1 }));
                                        const others = uiConfig.buttons.filter(b => b.screen !== selectedScreen);
                                        const newButtons = [...others, ...reOrdered];
                                        setUiConfig({ ...uiConfig, buttons: newButtons });
                                        void db.saveUIConfig({ ...uiConfig, buttons: newButtons });
                                        setDragId(null);
                                      }}
                                      className="relative group bg-white p-4 rounded-xl border-2 border-gray-200 flex items-center gap-4 cursor-pointer hover:border-blue-400 transition-colors shadow-sm"
                                      onClick={() => startEditBlock(block)}
                                    >
                                        <GripVertical className="text-gray-300" size={24} />
                                        
                                        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200">
                                            {block.type === 'button' && <Square size={24} className="text-blue-500"/>}
                                            {block.type === 'header' && <Type size={24} className="text-gray-800"/>}
                                            {block.type === 'text' && <MessageSquare size={24} className="text-gray-500"/>}
                                            {block.type === 'card' && <AlertCircle size={24} className="text-yellow-600"/>}
                                        </div>

                                        <div className="flex-1 overflow-hidden">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded text-white ${block.type === 'button' ? 'bg-blue-500' : 'bg-gray-400'}`}>
                                                    {block.type === 'header' ? 'Título' : block.type === 'card' ? 'Aviso' : block.type === 'text' ? 'Texto' : 'Botão'}
                                                </span>
                                            </div>
                                            <h4 className="font-bold text-gray-800 truncate text-sm">{block.label}</h4>
                                            {block.type === 'button' && <p className="text-[10px] text-blue-500 font-bold truncate mt-1">LINK: {block.route}</p>}
                                        </div>

                                        <div className="bg-gray-100 px-3 py-1 rounded-lg text-xs font-bold text-gray-500">#{block.order}</div>
                                    </div>
                                ))}
                                {filteredBlocks.length === 0 && <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 font-bold text-sm">Nenhum item neste filtro.<br/>Altere o filtro ou adicione um bloco acima.</div>}
                            </div>
                        </div>
                    </>
                )}

                {/* --- PAGE CREATOR MODAL --- */}
                {isCreatingPage && (
                    <div className="bg-white p-6 rounded-2xl shadow-xl border-2 border-blue-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-black text-xl text-gray-800 uppercase">Nova Tela</h3>
                            <button onClick={() => setIsCreatingPage(false)} className="p-2 bg-gray-100 rounded-full"><X size={24}/></button>
                         </div>
                         <div className="space-y-4">
                            <div>
                                 <FieldLabel label="Nome da Tela" />
                                 <input value={newPageTitle} onChange={e => setNewPageTitle(e.target.value)} className="w-full p-4 border-2 border-gray-200 rounded-xl font-bold text-lg outline-none focus:border-blue-500" placeholder="Ex: Manutenção" autoFocus />
                            </div>
                            <button onClick={handleAddPage} className="w-full bg-green-600 text-white font-black text-lg py-4 rounded-xl shadow-lg uppercase">CRIAR TELA</button>
                         </div>
                    </div>
                )}

                {/* --- BLOCK EDITOR MODAL --- */}
                {(editingBlock || isCreatingNew) && (
                    <div className="bg-white p-6 rounded-2xl shadow-xl border-2 border-gray-100 animate-in slide-in-from-bottom-10">
                         <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                            <div className="flex items-center gap-3">
                                <span className="bg-gray-100 px-3 py-1 rounded-lg text-xs font-black uppercase text-gray-500">{blockType}</span>
                                <h3 className="font-black text-xl text-gray-800 uppercase">{isCreatingNew ? 'Novo Bloco' : 'Editar'}</h3>
                            </div>
                            <button onClick={() => { setEditingBlock(null); setIsCreatingNew(false); }} className="px-4 py-2 bg-gray-100 rounded-xl font-black text-gray-700 uppercase text-xs flex items-center gap-2"><ArrowRight className="rotate-180" size={18}/> Voltar</button>
                         </div>
                         
                         <div className="space-y-5">
                             <div>
                                 <FieldLabel label={blockType === 'header' ? 'Texto do Título' : blockType === 'text' ? 'Texto Principal' : 'Rótulo'} />
                                 <input value={blockLabel} onChange={e => setBlockLabel(e.target.value)} className="w-full p-4 border-2 border-gray-200 rounded-xl font-bold text-lg outline-none focus:border-blue-500" autoFocus />
                             </div>

                             {(blockType === 'text' || blockType === 'card') && (
                                 <div>
                                     <FieldLabel label="Conteúdo / Descrição" />
                                     <textarea value={blockContent} onChange={e => setBlockContent(e.target.value)} className="w-full p-4 border-2 border-gray-200 rounded-xl h-28 resize-none font-bold text-gray-600 outline-none focus:border-blue-500" />
                                 </div>
                             )}

                             {blockType === 'button' && (
                                 <div>
                                     <FieldLabel label="Destino (Ao clicar)" />
                                     <select value={blockRoute} onChange={e => setBlockRoute(e.target.value)} className="w-full p-4 border-2 border-gray-200 rounded-xl bg-white font-bold text-gray-800 outline-none">
                                         <option value="">Selecione...</option>
                                         <optgroup label="Telas Personalizadas">
                                            {uiConfig.customPages?.map(p => <option key={p.id} value={`/custom/${p.id}`}>{p.title}</option>)}
                                         </optgroup>
                                         <optgroup label="Menus do Sistema">
                                            {FIXED_ROUTES.map(r => <option key={r.val} value={r.val}>{r.label}</option>)}
                                         </optgroup>
                                     </select>
                                 </div>
                             )}

                             {blockType === 'button' && (
                                <div>
                                     <FieldLabel label="Cor do Botão" />
                                     <div className="grid grid-cols-7 gap-3">
                                         {COLORS.map(c => (
                                             <button 
                                                key={c} 
                                                onClick={() => setBlockColor(c)} 
                                                className={`h-12 w-12 rounded-xl border-4 transition-all ${blockColor === c ? 'border-gray-800 scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`} 
                                                style={{ backgroundColor: c === 'blue' ? '#2563eb' : c === 'red' ? '#dc2626' : c === 'green' ? '#16a34a' : c === 'orange' ? '#ea580c' : c === 'purple' ? '#9333ea' : c === 'gray' ? '#e2e8f0' : '#475569' }} 
                                             />
                                         ))}
                                     </div>
                                 </div>
                             )}

                             {blockType === 'button' && (
                                 <div>
                                     <FieldLabel label="Ícone" />
                                     <div className="grid grid-cols-6 gap-2 p-2 bg-gray-50 rounded-xl border-2 border-gray-200 max-h-48 overflow-y-auto">
                                         {ICONS.map(i => (
                                             <button 
                                                key={i} 
                                                onClick={() => { setBlockIconType('lucide'); setBlockIconValue(i); }} 
                                                className={`p-2 rounded-lg border-2 flex items-center justify-center aspect-square transition-all ${blockIconType === 'lucide' && blockIconValue === i ? 'bg-blue-100 border-blue-500 scale-105 shadow-md' : 'bg-white border-gray-100 hover:border-blue-300'}`}
                                             >
                                                 <BigButton icon={i} label="" onClick={()=>{}} fullWidth={false} color="gray" />
                                             </button>
                                         ))}
                                     </div>
                                 </div>
                             )}

                             <div className="flex gap-3 pt-4 border-t border-gray-100">
                                 {editingBlock && <button onClick={() => deleteBlock(editingBlock.id)} className="p-4 bg-red-100 text-red-600 rounded-xl font-bold"><Trash2/></button>}
                                 <button onClick={saveBlock} className="flex-1 bg-green-600 text-white font-black text-lg py-4 rounded-xl shadow-lg uppercase">SALVAR</button>
                             </div>
                         </div>
                    </div>
                )}
            </div>
        )}

        {/* --- DATA TAB (DANGER ZONE) --- */}
        {activeTab === 'data' && (
            <div className="space-y-6">
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <Database size={20} className="text-gray-400" />
                        <h3 className="font-black text-gray-800 uppercase">Dados de Produção</h3>
                    </div>
                    <p className="text-sm text-gray-500 font-bold mb-4">Para editar ou excluir registros, entre na métrica desejada e use os botões de editar/excluir na lista diária.</p>
                    <button
                        onClick={() => {
                          void (async () => {
                            notify('Atualizando do servidor...', 'info');
                            await db.refreshFromServer();
                            notify('Atualização concluída.', 'success');
                            await loadSyncStatus();
                          })();
                        }}
                        className="w-full mb-4 bg-gray-900 text-white font-black py-4 rounded-xl shadow flex items-center justify-center gap-2 uppercase"
                    >
                        <RefreshCw size={18} /> Atualizar agora
                    </button>

                    <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl mb-4">
                      <div className="flex items-center justify-between">
                        <div className="font-black text-gray-800 uppercase text-sm">Sincronização</div>
                        <button
                          onClick={() => void loadSyncStatus()}
                          className="text-xs font-bold text-gray-700 bg-white border border-gray-200 px-3 py-2 rounded-lg"
                        >
                          {syncStatusLoading ? 'Carregando...' : 'Atualizar status'}
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="bg-white border border-gray-200 rounded-lg p-3">
                          <div className="text-[10px] uppercase font-black text-gray-500">Pendentes</div>
                          <div className="text-2xl font-black text-gray-900">
                            {syncStatus?.pendingCount ?? '-'}
                          </div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg p-3">
                          <div className="text-[10px] uppercase font-black text-gray-500">Erros</div>
                          <div className="text-2xl font-black text-gray-900">
                            {syncStatus?.errorCount ?? '-'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            void (async () => {
                              notify('Sincronizando...', 'info');
                              await db.syncPendingData();
                              await loadSyncStatus();
                            })();
                          }}
                          className="bg-blue-600 text-white font-black py-3 rounded-xl shadow flex items-center justify-center gap-2 uppercase active:scale-95 transition-transform"
                        >
                          <RefreshCw size={16} /> Sincronizar agora
                        </button>
                        <button
                          onClick={() => {
                            void (async () => {
                              await db.retrySyncErrors();
                              notify('Erros marcados para re-tentar.', 'success');
                              await loadSyncStatus();
                            })();
                          }}
                          className="bg-gray-900 text-white font-black py-3 rounded-xl shadow flex items-center justify-center gap-2 uppercase active:scale-95 transition-transform"
                        >
                          <RefreshCw size={16} /> Re-tentar erros
                        </button>
                      </div>

                      {syncStatus?.errors?.length > 0 && (
                        <div className="mt-3">
                          <div className="text-[10px] uppercase font-black text-gray-500 mb-2">Erros recentes</div>
                          <div className="space-y-2">
                            {syncStatus.errors.slice(0, 5).map((e: any) => (
                              <div key={String(e.id)} className="bg-white border border-red-200 rounded-lg p-3">
                                <div className="text-xs font-black text-red-700">{e.tableName || e.table_name}</div>
                                <div className="text-[11px] text-gray-700 font-bold mt-1 line-clamp-2">{e.errorMessage || e.error_message || 'Erro'}</div>
                                <div className="text-[10px] text-gray-500 mt-1">{e.created_at}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                </div>

                {!dangerUnlocked ? (
                  <button
                    onClick={() => {
                      if (!confirm('ATENÇÃO: você está prestes a acessar a Zona de Perigo. Deseja continuar?')) return;
                      setDangerUnlocked(true);
                    }}
                    className="w-full bg-red-600 active:bg-red-700 text-white font-black text-xl py-5 rounded-2xl shadow-lg uppercase"
                  >
                    ENTRAR NA ZONA DE PERIGO
                  </button>
                ) : (
                  <div className="bg-red-50 p-8 rounded-2xl border-2 border-red-100 text-center shadow-sm">
                      <AlertCircle size={64} className="text-red-500 mx-auto mb-6" />
                      <h3 className="font-black text-red-900 text-2xl mb-2 uppercase">Zona de Perigo</h3>
                      <p className="text-base text-red-700 font-bold mb-6">Esta ação apagará PERMANENTEMENTE todos os dados locais do aplicativo neste dispositivo.</p>
                      <button
                        onClick={() => {
                          setDangerResponsible('');
                          setShowDangerModal(true);
                        }}
                        className="w-full bg-red-600 active:bg-red-700 text-white font-black text-xl py-5 rounded-xl shadow-lg uppercase"
                      >
                        LIMPAR TUDO AGORA
                      </button>
                  </div>
                )}
            </div>
        )}
      </div>

      {showDangerModal && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-red-50 p-4 flex justify-between items-center border-b border-red-100">
              <h3 className="font-black text-red-900 uppercase">Confirmação Final</h3>
              <button onClick={() => setShowDangerModal(false)} className="p-2 rounded-full hover:bg-red-100"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 bg-white">
              <div className="text-sm font-bold text-gray-700">
                Esta ação vai:
              </div>
              <div className="text-sm text-gray-600 font-medium text-left space-y-1">
                <div>- Limpar o armazenamento local do aplicativo (cache/banco local)</div>
                <div>- Remover registros e mídias armazenadas neste dispositivo</div>
                <div>- Você precisará abrir o app novamente para baixar tudo do servidor</div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl text-left">
                <div className="font-black text-yellow-900 text-sm uppercase">Atenção</div>
                <div className="text-sm text-yellow-800 font-bold mt-1">Se houver dados offline ainda não sincronizados, eles podem ser perdidos neste dispositivo.</div>
              </div>

              <div>
                <FieldLabel label="Responsável" />
                <input value={dangerResponsible} onChange={e => setDangerResponsible(e.target.value)} className="w-full p-4 border-2 border-gray-200 rounded-xl font-bold text-gray-800 outline-none focus:border-red-500" placeholder="Nome do responsável" />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 bg-white flex gap-2">
              <button onClick={() => setShowDangerModal(false)} className="flex-1 bg-gray-200 text-gray-700 font-bold py-4 rounded-xl">Cancelar</button>
              <button
                onClick={() => {
                  setShowDangerModal(false);
                  void handleClearData();
                }}
                className="flex-1 bg-red-600 text-white font-black py-4 rounded-xl"
              >
                Confirmar e limpar
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
              if (pendingAction) {
                try {
                  await pendingAction();
                } catch (e) {
                  console.error(e);
                  notify("Erro ao executar ação", "error");
                }
              }
              setPendingAction(null);
            })();
          }}
          onClose={() => {
            setShowPinModal(false);
            setPendingAction(null);
          }}
        />
      )}
    </Layout>
  );
};
