
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { FieldLabel } from '../components/FieldLabel';
import { Trash2, Plus, Save, Home, Edit2, Upload, User, Tag, Square, Type, MessageSquare, AlertCircle, GripVertical, Image as ImageIcon, FolderPlus, X, Lock, ArrowRight, LogOut, Database, RefreshCw, Droplets, Activity, Ban, Baby, Pencil, CheckCircle, Smartphone, KeyRound, Search, ClipboardList, CalendarDays, ChevronRight, Loader2, UserRound, UsersRound } from 'lucide-react';
import { db } from '../services/db.service';
import { Employee, Client, FarmSettings, UIConfig, AppColor, AppIcon, UIBlock, CustomPage, BlockType, Anomaly, Instruction, Notice, Improvement, FarmDoc } from '../types';
import { notify } from '../services/notification.service';
import { BigButton } from '../components/BigButton';
import { authService } from '../services/auth.service';
import { PinRequestModal } from '../components/PinRequestModal';
import { DEFAULT_SECTOR_BASE_COLOR, getSectorColorOverrides, setSectorColorOverrides, makeSectorColor, getSectorColors } from '../constants/sectors';
import { farmContextService } from '../services/farm-context.service';
import { AdminPanel } from '../components/AdminPanel';
import { AdminWorkOrderDashboard } from '../components/AdminWorkOrderDashboard';
import { permissionsService } from '../services/permissions.service';
import { createId, createUuid } from '../utils/id';
import { localdb } from '../services/localdb';

type Tab = 'dashboard' | 'workOrders' | 'admin' | 'registries' | 'visual' | 'data' | 'records';
type SubTab = 'employees' | 'clients' | 'sectors';
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
  { label: 'Agenda de visitas', val: '/agenda' },
  { label: 'Menu Ordem de Serviço', val: '/anomalies' },
  { label: 'Adicionar OS', val: '/anomalies/add' },
  { label: 'Lista de OS', val: '/anomalies/list' },
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
  { id: 'anomalies_menu', label: 'Menu Ordem de Serviço' },
  { id: 'instructions_menu', label: 'Menu Instruções' },
  { id: 'notices_menu', label: 'Menu Comunicados' },
  { id: 'improvements_menu', label: 'Menu Melhorias' },
  { id: 'farm_data_menu', label: 'Menu Dados' },
  { id: 'norms_menu', label: 'Menu Normas' },
];

const workOrderDate = (item: Anomaly) => item.serviceDate || item.createdAt?.slice(0, 10) || '';

const formatWorkOrderDate = (item: Anomaly) => {
  const [year, month, day] = workOrderDate(item).split('-');
  return year && month && day ? `${day}/${month}/${year}` : 'Data não informada';
};

const clientNameKey = (value: string) => value
  .trim()
  .replace(/\s+/g, ' ')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR');

export const SettingsScreen: React.FC = () => {
  const navigate = useNavigate();
  const [farmContext, setFarmContext] = useState(() => farmContextService.getContext());
  const isOwner = farmContext?.is_owner === true;
  // Tabs
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('employees');

  // Farm Settings
  const [farmName, setFarmName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [farmLogo, setFarmLogo] = useState<string | undefined>(undefined);
  const [headerColor, setHeaderColor] = useState('#1f2937');

  // Employees & Sectors
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState('');
  const [empRole, setEmpRole] = useState('Técnico');
  const [empAccessPin, setEmpAccessPin] = useState('1234');
  const [empPhoto, setEmpPhoto] = useState<string | undefined>(undefined);
  const [employeeSearch, setEmployeeSearch] = useState('');

  const [clients, setClients] = useState<Client[]>([]);
  const [newClientName, setNewClientName] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingClientName, setEditingClientName] = useState('');
  const [clientActionId, setClientActionId] = useState<string | null>(null);

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
  const [workOrders, setWorkOrders] = useState<Anomaly[]>([]);
  const [workOrderSearch, setWorkOrderSearch] = useState('');
  const [workOrderToDelete, setWorkOrderToDelete] = useState<Anomaly | null>(null);
  const [deletingWorkOrder, setDeletingWorkOrder] = useState(false);

  // Generic Edit Form State
  const [editFormTitle, setEditFormTitle] = useState(''); // Used for Title, Content, Description
  const [editFormResponsible, setEditFormResponsible] = useState('');
  const [editFormSector, setEditFormSector] = useState('');

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinModalConfig, setPinModalConfig] = useState({ title: 'Autorização Necessária', description: 'Digite seu PIN de 4 dígitos.' });
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
    if (!editingEmp && !editingClient) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editingEmp, editingClient]);

  useEffect(() => {
    if (activeTab === 'records') {
      loadRecords(recordType);
    }
  }, [activeTab, recordType]);

  useEffect(() => {
    if (activeTab !== 'workOrders') return;
    let active = true;
    const load = async () => {
      const items = await db.getAnomalies();
      if (!active) return;
      setWorkOrders(items
        .filter((item) => item.recordType === 'service_order' || Boolean(item.clientName))
        .sort((a, b) => workOrderDate(b).localeCompare(workOrderDate(a)) || b.createdAt.localeCompare(a.createdAt)));
    };
    void load();
    const unsubscribe = localdb.subscribe('anomalies', () => { void load(); });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [activeTab]);

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

  useEffect(() => {
    if (activeTab === 'data') {
      void loadSyncStatus();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'registries') return;
    let active = true;
    const loadClients = async (force = false) => {
      if (force && navigator.onLine) await db.forceRefreshTable('clients');
      const items = await db.getClients();
      if (active) setClients(items);
    };
    void loadClients(true);
    const unsubscribe = localdb.subscribe('clients', () => { void loadClients(); });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [activeTab]);

  const protectedAction = async (action: () => Promise<void> | void, opts?: { forcePin?: boolean, title?: string, description?: string }) => {
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

    setPinModalConfig({
      title: opts?.title || 'Autorização Necessária',
      description: opts?.description || 'Digite seu PIN de 4 dígitos para continuar.'
    });
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
      const [emps, clientItems, secs] = await Promise.all([
        db.getEmployees(),
        db.getClients(),
        db.getSectors()
      ]);
      // Ordenar funcionários alfabeticamente
      emps.sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(emps);
      setClients(clientItems);
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

  useEffect(() => {
    const reload = () => {
      void loadRegistries();
    };
    const unsubscribeEmployees = localdb.subscribe('employees', reload);
    const unsubscribeSectors = localdb.subscribe('sectors', reload);
    return () => {
      unsubscribeEmployees();
      unsubscribeSectors();
    };
  }, []);

  const loadUI = async () => {
    setUiConfig(await db.getUIConfig());
  };

  // --- RECORDS MANAGEMENT ---
  const loadRecords = async (type: RecordType) => {
    let data: any[] = [];
    switch (type) {
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
    
    const typeMap: Record<string, { label: string, fem: boolean }> = {
      anomalies: { label: 'anomalia', fem: true },
      instructions: { label: 'instrução', fem: true },
      notices: { label: 'comunicado', fem: false },
      improvements: { label: 'melhoria', fem: true },
      norms: { label: 'norma', fem: true }
    };
    
    const tInfo = typeMap[recordType] || { label: 'registro', fem: false };
    const prefix = tInfo.fem ? 'essa' : 'esse';
    const pronoun = tInfo.fem ? 'Ela' : 'Ele';

    const action = async () => {
      try {
        switch (recordType) {
          case 'anomalies': await db.deleteAnomaly(id); break;
          case 'instructions': await db.deleteInstruction(id); break;
          case 'notices': await db.deleteNotice(id); break;
          case 'improvements': await db.deleteImprovement(id); break;
          case 'norms': await db.deleteFarmDoc(id); break;
        }
        notify("Item excluído.", "success");
        setRecordsList(prev => prev.filter((r: any) => r.id !== id));
        await loadRecords(recordType);
      } catch (e) {
        console.error(e);
        notify("Erro ao excluir", "error");
      }
    };

    setPinModalConfig({
      title: `Excluir ${tInfo.label}?`,
      description: `Tem certeza que deseja excluir ${prefix} ${tInfo.label}? ${pronoun} não poderá ser recuperada(o). Digite o PIN.`
    });
    setPendingAction(() => action);
    setShowPinModal(true);
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
    if (!editingRecord) return;

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
    if (!farmName) { notify("Nome da fazenda é obrigatório", "error"); return; }
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
        if (ev.target?.result) setFarmLogo(ev.target.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- EMPLOYEE ACTIONS ---
  const handleEditEmp = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpName(emp.name);
    setEmpRole(emp.role || (emp.is_admin ? 'Administrador' : 'Técnico'));
    setEmpAccessPin(emp.access_pin || emp.admin_pin || '1234');
    setEmpPhoto(emp.photoUri);
  };

  const handleClearEmpForm = () => {
    setEditingEmp(null);
    setEmpName('');
    setEmpRole('Técnico');
    setEmpAccessPin('1234');
    setEmpPhoto(undefined);
  };

  const handleSaveEmp = async () => {
    const currentFarmId = farmContextService.getFarmId();
    const normalizedName = empName.trim();
    if (!normalizedName) { notify("Preencha o nome.", "error"); return; }
    if (!currentFarmId || currentFarmId === 'owner') {
      notify("Use o Painel Admin para cadastrar funcionário em uma fazenda.", "error");
      return;
    }
    if (!/^\d{4}$/.test(empAccessPin)) { notify("A senha deve ter 4 números.", "error"); return; }
    const duplicate = employees.some((employee) => employee.id !== editingEmp?.id
      && employee.name.trim().toLocaleLowerCase('pt-BR') === normalizedName.toLocaleLowerCase('pt-BR'));
    if (duplicate) { notify("Já existe um perfil com este nome.", "error"); return; }

    const wasAdmin = permissionsService.isPrivilegedEmployee(editingEmp);
    const willBeAdmin = permissionsService.isPrivilegedEmployee({ role: empRole, is_admin: false });
    const adminCount = employees.filter((employee) => permissionsService.isPrivilegedEmployee(employee)).length;
    if (editingEmp && wasAdmin && !willBeAdmin && adminCount <= 1) {
      notify("Mantenha pelo menos um Administrador ativo.", "error");
      return;
    }

    protectedAction(async () => {
      try {
        const now = new Date().toISOString();
        const newEmp: Employee = {
          id: editingEmp ? editingEmp.id : createId('employee'),
          farm_id: currentFarmId,
          name: normalizedName,
          role: empRole || 'Técnico',
          is_admin: willBeAdmin,
          access_pin: empAccessPin,
          admin_pin: willBeAdmin ? empAccessPin : undefined,
          photoUri: empPhoto,
          status: editingEmp?.status || 'active',
          created_at: editingEmp?.created_at || now,
          updated_at: now
        };

        if (editingEmp) {
          setEmployees(prev => prev.map(e => e.id === newEmp.id ? newEmp : e).sort((a, b) => a.name.localeCompare(b.name)));
          await db.updateEmployee(newEmp);
          if (String(newEmp.id) === String(farmContext?.employee_id)) {
            farmContextService.updateContext({
              employee_name: newEmp.name,
              employee_role: newEmp.role,
              is_admin: newEmp.is_admin === true,
              admin_pin: newEmp.admin_pin
            });
            setFarmContext(farmContextService.getContext());
          }
        } else {
          setEmployees(prev => [...prev, newEmp].sort((a, b) => a.name.localeCompare(b.name)));
          await db.addEmployee(newEmp);
        }

        if (navigator.onLine) {
          await db.syncPendingData();
          await db.forceRefreshTable('employees');
        }
        await loadRegistries();
        handleClearEmpForm();
        notify("Funcionário salvo!", "success");
      } catch (e) {
        console.error(e);
        notify("Erro ao salvar funcionário", "error");
      }
    });
  };

  const handleRemoveEmp = async (id: string) => {
    const employee = employees.find((item) => String(item.id) === String(id));
    if (!employee) return;
    if (String(id) === String(farmContext?.employee_id)) {
      notify("O perfil em uso não pode ser excluído.", "error");
      return;
    }
    const adminCount = employees.filter((item) => permissionsService.isPrivilegedEmployee(item)).length;
    if (permissionsService.isPrivilegedEmployee(employee) && adminCount <= 1) {
      notify("Mantenha pelo menos um Administrador ativo.", "error");
      return;
    }
    protectedAction(async () => {
      if (confirm(`Remover o perfil de ${employee.name}?`)) {
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

  const handleSaveClient = () => {
    const normalizedName = newClientName.trim().replace(/\s+/g, ' ');
    if (normalizedName.length < 3) {
      notify('Informe o nome completo do cliente.', 'error');
      return;
    }

    void protectedAction(async () => {
      setSavingClient(true);
      try {
        if (navigator.onLine) await db.forceRefreshTable('clients');
        const currentClients = await db.getClients();
        if (currentClients.some((client) => clientNameKey(client.name) === clientNameKey(normalizedName))) {
          setClients(currentClients);
          notify('Já existe um cliente com este nome.', 'error');
          return;
        }

        const client: Client = {
          id: createUuid(),
          name: normalizedName,
          status: 'active'
        };
        await db.addClient(client);
        setClients((current) => [...current, client].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
        setNewClientName('');
        notify(navigator.onLine ? 'Cliente adicionado.' : 'Cliente salvo offline e aguardando sincronização.', 'success');
      } catch (error) {
        console.error('Erro ao cadastrar cliente:', error);
        notify('Não foi possível cadastrar o cliente.', 'error');
      } finally {
        setSavingClient(false);
      }
    });
  };

  const handleUpdateClient = () => {
    if (!editingClient) return;
    const normalizedName = editingClientName.trim().replace(/\s+/g, ' ');
    if (normalizedName.length < 3) {
      notify('Informe o nome completo do cliente.', 'error');
      return;
    }

    void protectedAction(async () => {
      setClientActionId(editingClient.id);
      try {
        if (navigator.onLine) await db.forceRefreshTable('clients');
        const currentClients = await db.getClients();
        const duplicate = currentClients.some((client) => client.id !== editingClient.id
          && clientNameKey(client.name) === clientNameKey(normalizedName));
        if (duplicate) {
          setClients(currentClients);
          notify('Já existe outro cliente com este nome.', 'error');
          return;
        }

        const updatedClient: Client = { ...editingClient, name: normalizedName, status: 'active' };
        await db.updateClient(updatedClient);
        setClients((current) => current
          .map((client) => client.id === updatedClient.id ? updatedClient : client)
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
        setEditingClient(null);
        setEditingClientName('');
        notify(navigator.onLine ? 'Cliente atualizado.' : 'Alteração salva offline e aguardando sincronização.', 'success');
      } catch (error) {
        console.error('Erro ao editar cliente:', error);
        notify('Não foi possível editar o cliente.', 'error');
      } finally {
        setClientActionId(null);
      }
    });
  };

  const handleDeactivateClient = (client: Client) => {
    if (!window.confirm(`Excluir o cliente "${client.name}" das novas OS e agendamentos? O histórico existente será preservado.`)) return;

    void protectedAction(async () => {
      setClientActionId(client.id);
      try {
        await db.deactivateClient(client);
        setClients((current) => current.filter((item) => item.id !== client.id));
        if (editingClient?.id === client.id) {
          setEditingClient(null);
          setEditingClientName('');
        }
        notify(
          navigator.onLine
            ? 'Cliente excluído das novas seleções. O histórico foi preservado.'
            : 'Exclusão salva offline. O histórico permanece preservado.',
          'success'
        );
      } catch (error) {
        console.error('Erro ao excluir cliente:', error);
        notify('Não foi possível excluir o cliente.', 'error');
      } finally {
        setClientActionId(null);
      }
    });
  };

  // --- SECTOR ACTIONS ---
  const handleAddSector = async () => {
    if (newSector) {
      protectedAction(async () => {
        if (sectors.includes(newSector)) { notify("Setor já existe", "error"); return; }
        setSectors(prev => [...prev, newSector]);
        await db.addSector(newSector);
        setNewSector('');
        notify("Setor adicionado!", "success");
      });
    }
  };

  const handleRemoveSector = async (s: string) => {
    protectedAction(async () => {
      if (confirm(`Remover o setor "${s}"?`)) {
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
      if (sectors.includes(newName)) {
        notify("Setor com este nome já existe", "error");
        return;
      }
      setSectors(prev => prev.map(item => item === oldName ? newName : item));
      // Atualizar cores também
      const colors = getSectorColorOverrides();
      if (colors[oldName as any]) {
        const newColors = { ...colors };
        delete newColors[oldName as any];
        newColors[newName as any] = colors[oldName as any];
        setSectorColorOverrides(newColors as any);
        setSectorColorBase(prev => {
          const newBase = { ...prev };
          if (newBase[oldName]) {
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
    if (!newPageTitle || !uiConfig) { notify("Defina um título para a página.", "error"); return; }
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
    if (!uiConfig) return;
    if (!selectedScreen.startsWith('custom_')) { notify("Telas padrão não podem ser excluídas.", "error"); return; }
    protectedAction(async () => {
      if (!confirm("Excluir esta tela e todos os seus botões?")) return;

      const newPages = (uiConfig.customPages || []).filter(p => p.id !== selectedScreen);
      const newButtons = uiConfig.buttons.filter(b => b.screen !== selectedScreen);

      setUiConfig({ buttons: newButtons, customPages: newPages });
      setSelectedScreen('home');

      await db.saveUIConfig({ buttons: newButtons, customPages: newPages });
      notify("Tela excluída.", "info");
    });
  };



  const handleLogout = () => {
    authService.logout();
    window.location.reload(); // Recarrega para bloquear tudo novamente
  };

  const handleReactivateApp = () => {
    protectedAction(async () => {
      if (!confirm('Trocar o perfil deste aparelho? Os dados locais não serão apagados.')) return;
      farmContextService.clearContext();
      setFarmContext(null);
      window.location.reload();
    });
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

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLocaleLowerCase('pt-BR');
    if (!query) return employees;
    return employees.filter(employee => employee.name.toLocaleLowerCase('pt-BR').includes(query));
  }, [employeeSearch, employees]);

  const filteredClients = useMemo(() => {
    const query = clientNameKey(clientSearch);
    if (!query) return clients;
    return clients.filter((client) => clientNameKey(client.name).includes(query));
  }, [clientSearch, clients]);

  const filteredWorkOrders = useMemo(() => {
    const query = workOrderSearch.trim().toLocaleLowerCase('pt-BR');
    if (!query) return workOrders;
    return workOrders.filter((item) => [
      item.clientName,
      item.responsible,
      item.createdByEmployeeName,
      item.description,
      item.id
    ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(query)));
  }, [workOrderSearch, workOrders]);

  const deleteSelectedWorkOrder = async () => {
    if (!workOrderToDelete || deletingWorkOrder) return;
    setDeletingWorkOrder(true);
    try {
      await db.deleteAnomaly(workOrderToDelete.id);
      setWorkOrders((current) => current.filter((item) => item.id !== workOrderToDelete.id));
      setWorkOrderToDelete(null);
      notify(
        navigator.onLine
          ? 'Ordem de Serviço excluída.'
          : 'OS excluída neste aparelho. A exclusão será sincronizada quando houver internet.',
        'success'
      );
    } catch (error) {
      console.error('Erro ao excluir OS nas configurações:', error);
      notify('Não foi possível excluir a Ordem de Serviço.', 'error');
    } finally {
      setDeletingWorkOrder(false);
    }
  };

  return (
    <Layout>
      <Header title="Configurações" targetRoute="/" />

      <div className="sticky top-16 z-10 border-b border-[#ded7ca] bg-[#f7f3eb]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1 rounded-2xl border border-[#ded7ca] bg-white p-1 shadow-sm">
          {([
            ['dashboard', 'Resumo'],
            ['workOrders', 'OS'],
            ['registries', 'Cadastros'],
            ['data', 'Sistema'],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`min-h-11 rounded-xl px-2 text-[11px] font-black uppercase tracking-[0.08em] transition-all sm:text-xs ${activeTab === tab ? 'bg-[#173f32] text-white shadow-sm' : 'text-[#66736c] hover:bg-[#f1ede4]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f3efe7] p-4 pb-20">

        {/* --- DASHBOARD TAB --- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <AdminWorkOrderDashboard />
            <section className="overflow-hidden rounded-[26px] bg-[#173f32] text-white shadow-[0_16px_36px_rgba(23,63,50,0.18)]">
              <div className="border-b border-white/10 p-5 sm:p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c9b77d]">Acesso neste aparelho</p>
                <h2 className="mt-2 font-serif text-2xl font-black leading-tight">{farmContext?.farm_name || 'Campo Legado Consultoria'}</h2>
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[0.08] p-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#c9b77d] text-[#173f32]">
                    <User size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Perfil ativo</p>
                    <p className="truncate font-bold">{farmContext?.employee_name || 'Não identificado'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-5 sm:p-6">
                <button onClick={() => setActiveTab('registries')} className="rounded-2xl bg-white px-3 py-4 text-[#173f32] transition-transform active:scale-[0.98]">
                  <User size={20} className="mx-auto mb-2" />
                  <span className="text-xs font-black uppercase tracking-wide">Gerenciar cadastros</span>
                </button>
                <button onClick={() => setActiveTab('data')} className="rounded-2xl border border-white/20 bg-white/10 px-3 py-4 text-white transition-transform active:scale-[0.98]">
                  <RefreshCw size={20} className="mx-auto mb-2" />
                  <span className="text-xs font-black uppercase tracking-wide">Sincronização</span>
                </button>
                <button onClick={handleReactivateApp} className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 text-xs font-black uppercase tracking-wide text-white/85 transition-colors hover:bg-white/10">
                  <KeyRound size={16} /> Trocar perfil
                </button>
              </div>
            </section>
          </div>
        )}

        {/* --- WORK ORDERS TAB --- */}
        {activeTab === 'workOrders' && (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-[26px] bg-[#173f32] text-white shadow-[0_16px_36px_rgba(23,63,50,0.18)]">
              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#d7e6c9]">
                    <ClipboardList size={23} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c9b77d]">Administração</p>
                    <h2 className="mt-1 font-serif text-2xl font-black leading-tight">Gestão de OS</h2>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-white/65">Crie uma nova ordem ou localize um registro para abrir, editar e excluir.</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
                <button
                  type="button"
                  onClick={() => navigate('/anomalies/add')}
                  className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#c9b77d] px-3 text-xs font-black uppercase tracking-[0.06em] text-[#173f32] transition-transform active:scale-[0.98]"
                >
                  <Plus size={18} /> Nova OS
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/anomalies/list')}
                  className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 text-xs font-black uppercase tracking-[0.06em] text-white transition-transform active:scale-[0.98]"
                >
                  Histórico <ArrowRight size={17} />
                </button>
              </div>
            </section>

            <section className="rounded-[26px] border border-[#d9d1c4] bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a7441]">Registros cadastrados</p>
                  <h3 className="mt-1 font-serif text-xl font-black text-[#173f32]">Ordens de Serviço</h3>
                </div>
                <span className="shrink-0 rounded-full bg-[#edf2e8] px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#47745e]">
                  {filteredWorkOrders.length} OS
                </span>
              </div>

              <label className="relative block">
                <span className="sr-only">Buscar Ordem de Serviço</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6f7c74]" size={18} />
                <input
                  type="search"
                  value={workOrderSearch}
                  onChange={(event) => setWorkOrderSearch(event.target.value)}
                  placeholder="Buscar cliente, técnico ou número"
                  className="min-h-12 w-full rounded-xl border-2 border-[#d9d1c4] bg-[#fbf8f1] py-3 pl-10 pr-3 text-sm font-bold text-[#173f32] outline-none transition focus:border-[#47745e] focus-visible:ring-2 focus-visible:ring-[#47745e]/20"
                />
              </label>

              <div className="mt-4 space-y-3">
                {filteredWorkOrders.map((item) => (
                  <article key={item.id} className="overflow-hidden rounded-2xl border border-[#ded7ca] bg-[#fcfaf6]">
                    <button
                      type="button"
                      onClick={() => navigate(`/anomalies/detail/${item.id}`)}
                      className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-[#f1ede4]"
                    >
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.serviceOrderType === 'despesa' ? 'bg-[#f7ddd2] text-[#8b3e2f]' : 'bg-[#dcebd5] text-[#315f45]'}`}>
                        <ClipboardList size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-black text-[#173f32]">{item.clientName || 'Cliente não informado'}</h4>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] font-bold text-[#68736d]">
                          <UserRound size={13} className="shrink-0" /> {item.responsible || 'Técnico não informado'}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-[#8a918c]">
                          <CalendarDays size={12} /> {formatWorkOrderDate(item)}
                        </p>
                      </div>
                      <ChevronRight className="shrink-0 text-[#87928c]" size={20} />
                    </button>

                    <div className="grid grid-cols-2 border-t border-[#e7e0d5] bg-white">
                      <button
                        type="button"
                        onClick={() => navigate(`/anomalies/edit/${item.id}`)}
                        className="flex min-h-11 items-center justify-center gap-2 border-r border-[#e7e0d5] px-3 text-[11px] font-black uppercase tracking-wide text-[#315f45]"
                      >
                        <Pencil size={15} /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setWorkOrderToDelete(item)}
                        className="flex min-h-11 items-center justify-center gap-2 px-3 text-[11px] font-black uppercase tracking-wide text-[#9b4939]"
                      >
                        <Trash2 size={15} /> Excluir
                      </button>
                    </div>
                  </article>
                ))}

                {filteredWorkOrders.length === 0 && (
                  <div className="rounded-2xl border-2 border-dashed border-[#d9d1c4] bg-[#fbf8f1] px-5 py-10 text-center">
                    <ClipboardList className="mx-auto text-[#94a095]" size={34} />
                    <p className="mt-3 font-serif text-lg font-black text-[#173f32]">Nenhuma OS encontrada</p>
                    <p className="mt-1 text-xs font-semibold text-[#718078]">Tente outro nome ou adicione uma nova Ordem de Serviço.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'admin' && <AdminPanel />}

        {/* --- REGISTRIES TAB --- */}
        {activeTab === 'registries' && (
          <div>
            <div className="mb-5 rounded-[24px] border border-[#d9d1c4] bg-[#fbf8f1] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a7441]">Base da operação</p>
              <h2 className="mt-1 font-serif text-2xl font-black text-[#173f32]">Cadastros</h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-[#68736d]">Mantenha funcionários, acessos e clientes disponíveis nas OS e na agenda.</p>
            </div>

            <div className="mb-5 grid grid-cols-2 rounded-2xl border border-[#d9d1c4] bg-white p-1 shadow-sm" aria-label="Tipo de cadastro">
              <button
                type="button"
                onClick={() => setActiveSubTab('employees')}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-[0.08em] transition ${activeSubTab === 'employees' ? 'bg-[#173f32] text-white shadow-sm' : 'text-[#68736d]'}`}
              >
                <UserRound size={17} /> Funcionários
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('clients')}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-[0.08em] transition ${activeSubTab === 'clients' ? 'bg-[#173f32] text-white shadow-sm' : 'text-[#68736d]'}`}
              >
                <UsersRound size={18} /> Clientes
              </button>
            </div>

            {activeSubTab === 'employees' && (
              <div className="space-y-6">
                {/* FORMULÁRIO DE FUNCIONÁRIO */}
                <div className="rounded-[26px] border border-[#d9d1c4] bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="mb-5 flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-[#173f32]">
                    <Plus size={16} /> Novo Funcionário
                  </h3>
                  <div className="flex items-start gap-4">
                    <label className="group shrink-0 cursor-pointer text-center">
                      <span className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[#9daf9f] bg-[#edf2e8]">
                        <User className="text-[#66806f]" size={30} />
                        {empPhoto && (
                          <img
                            src={empPhoto}
                            alt="Foto do funcionário"
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                        <input type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" onChange={handleEmpPhoto} />
                      </span>
                      <span className="mt-1.5 block text-[9px] font-black uppercase tracking-wide text-[#66806f]">Adicionar foto</span>
                    </label>
                    <div className="min-w-0 flex-1 space-y-3">
                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[#68736d]">Nome completo</span>
                        <input value={empName} onChange={e => setEmpName(e.target.value)} className="w-full rounded-xl border border-[#d9d1c4] bg-[#fcfaf6] p-3 font-bold text-[#18382e] outline-none transition focus:border-[#47745e] focus:ring-2 focus:ring-[#47745e]/15" placeholder="Nome do funcionário" />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[#68736d]">Perfil</span>
                        <select value={empRole} onChange={e => setEmpRole(e.target.value)} className="w-full rounded-xl border border-[#d9d1c4] bg-[#fcfaf6] p-3 font-bold text-[#18382e] outline-none transition focus:border-[#47745e] focus:ring-2 focus:ring-[#47745e]/15">
                          <option value="Técnico">Técnico</option>
                          <option value="Administrador">Administrador</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <label className="mt-4 block">
                    <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#68736d]"><KeyRound size={13} /> Senha de acesso</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      name="employee-access-code"
                      enterKeyHint="done"
                      spellCheck={false}
                      maxLength={4}
                      value={empAccessPin}
                      onChange={e => setEmpAccessPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full rounded-xl border border-[#d9d1c4] bg-[#fcfaf6] p-3 text-center font-black tracking-[0.35em] text-[#18382e] outline-none transition focus:border-[#47745e] focus:ring-2 focus:ring-[#47745e]/15"
                      placeholder="1234"
                      style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
                    />
                  </label>
                  <div className="mt-5 flex gap-2">
                    <button onClick={handleSaveEmp} className="flex-1 rounded-xl bg-[#173f32] py-3 text-xs font-black uppercase tracking-wide text-white shadow-sm transition-transform active:scale-[0.98]">Adicionar</button>
                  </div>
                </div>

                {/* LISTA DE FUNCIONÁRIOS */}
                <div className="grid gap-3">
                  <div className="flex items-end justify-between gap-3 px-1">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a7441]">Cadastrados</p>
                      <h4 className="font-serif text-xl font-black text-[#173f32]">{employees.length} pessoas</h4>
                    </div>
                  </div>
                  <label className="relative block">
                    <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#718078]" />
                    <input
                      type="search"
                      value={employeeSearch}
                      onChange={event => setEmployeeSearch(event.target.value)}
                      className="w-full rounded-2xl border border-[#d9d1c4] bg-white py-3.5 pl-11 pr-4 font-semibold text-[#18382e] outline-none transition placeholder:text-[#8e9993] focus:border-[#47745e] focus:ring-2 focus:ring-[#47745e]/15"
                      placeholder="Buscar funcionário"
                    />
                  </label>
                  {filteredEmployees.map(emp => (
                    <div key={emp.id} className="flex items-center gap-3 rounded-2xl border border-[#ded7ca] bg-white p-3.5 shadow-sm">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#edf2e8] text-[#66806f]">
                        <User size={20} />
                        {emp.photoUri && (
                          <img
                            src={emp.photoUri}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-black text-[#18382e]">{emp.name}</h4>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${permissionsService.isPrivilegedEmployee(emp) ? 'bg-[#f0e5c4] text-[#765f25]' : 'bg-[#edf2e8] text-[#47745e]'}`}>{emp.role || (emp.is_admin ? 'Administrador' : 'Técnico')}</span>
                      </div>
                      <button aria-label={`Editar ${emp.name}`} onClick={() => handleEditEmp(emp)} className="rounded-xl bg-[#edf2e8] p-3 text-[#47745e] transition-colors hover:bg-[#dfe9dc]"><Edit2 size={18} /></button>
                      <button aria-label={`Excluir ${emp.name}`} onClick={() => handleRemoveEmp(emp.id)} className="rounded-xl bg-[#fbefec] p-3 text-[#a95849] transition-colors hover:bg-[#f4ded9]"><Trash2 size={18} /></button>
                    </div>
                  ))}
                  {filteredEmployees.length === 0 && <p className="rounded-2xl border border-dashed border-[#cfc7ba] bg-white/50 py-10 text-center text-sm font-medium text-[#7a857f]">Nenhum funcionário encontrado.</p>}
                </div>

                {editingEmp && (
                  <div
                    className="fixed inset-0 z-[80] flex items-end justify-center bg-[#10231d]/70 backdrop-blur-[2px] sm:items-center sm:p-4"
                    onClick={handleClearEmpForm}
                  >
                    <section
                      className="flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden overscroll-contain rounded-t-[28px] border border-[#d9d1c4] bg-[#f8f4eb] shadow-2xl sm:rounded-[28px]"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="edit-employee-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="bg-white px-5 pb-4 pt-3">
                        <span className="mx-auto mb-3 block h-1 w-12 rounded-full bg-[#c7c1b6] sm:hidden" aria-hidden="true" />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a7441]">Cadastro selecionado</p>
                            <h3 id="edit-employee-title" className="mt-1 font-serif text-2xl font-black text-[#173f32]">Editar funcionário</h3>
                            <p className="mt-1 truncate text-sm font-bold text-[#64736b]">{editingEmp.name}</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleClearEmpForm}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d9d1c4] bg-[#fbf8f1] text-[#52655b] transition active:scale-95"
                            aria-label="Fechar edição do funcionário"
                          >
                            <X size={20} />
                          </button>
                        </div>
                      </div>

                      <form
                        className="min-h-0 flex-1 overflow-y-auto border-t border-[#d9d1c4]"
                        onSubmit={(event) => {
                          event.preventDefault();
                          handleSaveEmp();
                        }}
                      >
                        <div className="space-y-5 p-5">
                          <div className="flex items-center gap-4 rounded-2xl border border-[#ded7ca] bg-white p-4">
                            <label className="group flex shrink-0 cursor-pointer flex-col items-center">
                              <span className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[#9daf9f] bg-[#edf2e8]">
                                <User className="text-[#66806f]" size={30} />
                                {empPhoto && (
                                  <img
                                    src={empPhoto}
                                    alt="Foto do funcionário"
                                    className="absolute inset-0 h-full w-full object-cover"
                                    onError={(event) => {
                                      event.currentTarget.style.display = 'none';
                                    }}
                                  />
                                )}
                                <input type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" onChange={handleEmpPhoto} />
                              </span>
                            </label>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-[#18382e]">Foto do perfil</p>
                              <p className="mt-1 text-xs font-semibold leading-5 text-[#718078]">Toque na imagem para trocar. Este campo é opcional.</p>
                            </div>
                          </div>

                          <label className="block">
                            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#68736d]">Nome completo</span>
                            <input
                              value={empName}
                              onChange={(event) => setEmpName(event.target.value)}
                              autoFocus
                              maxLength={140}
                              className="min-h-12 w-full rounded-xl border-2 border-[#d9d1c4] bg-white px-4 py-3 font-bold text-[#18382e] outline-none transition focus:border-[#47745e] focus:ring-2 focus:ring-[#47745e]/15"
                              placeholder="Nome do funcionário"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#68736d]">Perfil de acesso</span>
                            <select
                              value={empRole}
                              onChange={(event) => setEmpRole(event.target.value)}
                              className="min-h-12 w-full rounded-xl border-2 border-[#d9d1c4] bg-white px-4 py-3 font-bold text-[#18382e] outline-none transition focus:border-[#47745e] focus:ring-2 focus:ring-[#47745e]/15"
                            >
                              <option value="Técnico">Técnico</option>
                              <option value="Administrador">Administrador</option>
                            </select>
                          </label>

                          <label className="block">
                            <span className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#68736d]"><KeyRound size={13} /> Senha de acesso</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              name="edit-employee-access-code"
                              enterKeyHint="done"
                              spellCheck={false}
                              maxLength={4}
                              value={empAccessPin}
                              onChange={(event) => setEmpAccessPin(event.target.value.replace(/\D/g, ''))}
                              className="min-h-12 w-full rounded-xl border-2 border-[#d9d1c4] bg-white px-4 py-3 text-center font-black tracking-[0.35em] text-[#18382e] outline-none transition focus:border-[#47745e] focus:ring-2 focus:ring-[#47745e]/15"
                              style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
                            />
                          </label>

                          <p className="rounded-xl bg-[#edf2e8] px-3 py-2.5 text-xs font-semibold leading-5 text-[#52655b]">As alterações entram em vigor assim que forem salvas e também serão sincronizadas quando houver conexão.</p>
                        </div>

                        <div className="sticky bottom-0 grid grid-cols-[auto_1fr] gap-2 border-t border-[#d9d1c4] bg-[#f8f4eb]/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
                          <button type="button" onClick={handleClearEmpForm} className="min-h-12 rounded-xl border-2 border-[#d9d1c4] bg-white px-4 text-xs font-black uppercase text-[#64736b]">Cancelar</button>
                          <button type="submit" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f32] px-4 text-xs font-black uppercase tracking-[0.08em] text-white shadow-sm transition active:scale-[0.99]">
                            <Save size={18} /> Salvar alterações
                          </button>
                        </div>
                      </form>
                    </section>
                  </div>
                )}
              </div>
            )}

            {activeSubTab === 'clients' && (
              <div className="space-y-6">
                <section className="overflow-hidden rounded-[26px] border border-[#d9d1c4] bg-white shadow-sm">
                  <div className="bg-[#173f32] p-5 text-white">
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#c9b77d] text-[#173f32]"><Plus size={21} /></span>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#c9b77d]">Novo cadastro</p>
                        <h3 className="mt-1 font-serif text-xl font-black">Adicionar cliente</h3>
                        <p className="mt-1 text-xs font-semibold leading-5 text-white/60">O nome ficará disponível imediatamente nas OS e na agenda.</p>
                      </div>
                    </div>
                  </div>
                  <form
                    className="p-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleSaveClient();
                    }}
                  >
                    <label className="block">
                      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#68736d]">Nome do cliente</span>
                      <input
                        value={newClientName}
                        onChange={(event) => setNewClientName(event.target.value)}
                        maxLength={140}
                        autoComplete="off"
                        enterKeyHint="done"
                        className="min-h-12 w-full rounded-xl border-2 border-[#d9d1c4] bg-[#fcfaf6] px-4 py-3 font-bold text-[#18382e] outline-none transition placeholder:text-[#929a95] focus:border-[#47745e] focus:ring-2 focus:ring-[#47745e]/15"
                        placeholder="Nome ou razão social"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={savingClient || newClientName.trim().length < 3}
                      className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173f32] px-4 text-xs font-black uppercase tracking-[0.08em] text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
                    >
                      {savingClient ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                      {savingClient ? 'Adicionando…' : 'Adicionar cliente'}
                    </button>
                  </form>
                </section>

                <section>
                  <div className="mb-3 flex items-end justify-between gap-3 px-1">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a7441]">Carteira cadastrada</p>
                      <h3 className="font-serif text-xl font-black text-[#173f32]">{clients.length} clientes</h3>
                    </div>
                  </div>
                  <label className="relative block">
                    <span className="sr-only">Buscar cliente cadastrado</span>
                    <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#718078]" />
                    <input
                      type="search"
                      value={clientSearch}
                      onChange={(event) => setClientSearch(event.target.value)}
                      className="w-full rounded-2xl border border-[#d9d1c4] bg-white py-3.5 pl-11 pr-4 font-semibold text-[#18382e] outline-none transition placeholder:text-[#8e9993] focus:border-[#47745e] focus:ring-2 focus:ring-[#47745e]/15"
                      placeholder="Buscar cliente"
                    />
                  </label>

                  <div className="mt-3 space-y-2">
                    {filteredClients.map((client) => (
                      <article key={client.id} className="flex items-center gap-3 rounded-2xl border border-[#ded7ca] bg-white p-3.5 shadow-sm">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#edf2e8] font-serif text-base font-black text-[#47745e]">
                          {client.name.trim().charAt(0).toLocaleUpperCase('pt-BR') || 'C'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-black leading-5 text-[#18382e]">{client.name}</h4>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#859089]">Ativo</p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingClient(client);
                              setEditingClientName(client.name);
                            }}
                            disabled={clientActionId === client.id}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf2e8] text-[#47745e] transition active:scale-95 disabled:opacity-50"
                            aria-label={`Editar cliente ${client.name}`}
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeactivateClient(client)}
                            disabled={clientActionId === client.id}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fbefec] text-[#a95849] transition active:scale-95 disabled:opacity-50"
                            aria-label={`Excluir cliente ${client.name}`}
                          >
                            {clientActionId === client.id ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />}
                          </button>
                        </div>
                      </article>
                    ))}
                    {filteredClients.length === 0 && (
                      <div className="rounded-2xl border-2 border-dashed border-[#cfc7ba] bg-white/55 px-5 py-10 text-center">
                        <UsersRound className="mx-auto text-[#8a968f]" size={30} />
                        <p className="mt-3 text-sm font-black text-[#40564b]">Nenhum cliente encontrado</p>
                        <p className="mt-1 text-xs font-semibold text-[#718078]">Revise o nome informado na busca.</p>
                      </div>
                    )}
                  </div>
                </section>

                {editingClient && (
                  <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#10231d]/70 sm:items-center sm:p-4" onClick={() => clientActionId === null && setEditingClient(null)}>
                    <section className="w-full max-w-md overflow-hidden rounded-t-[26px] border border-[#d9d1c4] bg-[#f8f4eb] shadow-2xl sm:rounded-[26px]" role="dialog" aria-modal="true" aria-labelledby="edit-client-title" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-start justify-between gap-3 border-b border-[#d9d1c4] bg-white p-5">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a7441]">Cadastro selecionado</p>
                          <h3 id="edit-client-title" className="mt-1 font-serif text-2xl font-black text-[#173f32]">Editar cliente</h3>
                        </div>
                        <button type="button" onClick={() => setEditingClient(null)} disabled={clientActionId !== null} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d9d1c4] bg-[#fbf8f1] text-[#52655b] disabled:opacity-50" aria-label="Fechar edição"><X size={19} /></button>
                      </div>
                      <form
                        className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
                        onSubmit={(event) => {
                          event.preventDefault();
                          handleUpdateClient();
                        }}
                      >
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#68736d]">Nome do cliente</span>
                          <input
                            value={editingClientName}
                            onChange={(event) => setEditingClientName(event.target.value)}
                            maxLength={140}
                            autoFocus
                            enterKeyHint="done"
                            className="min-h-12 w-full rounded-xl border-2 border-[#d9d1c4] bg-white px-4 py-3 font-bold text-[#18382e] outline-none transition focus:border-[#47745e] focus:ring-2 focus:ring-[#47745e]/15"
                          />
                        </label>
                        <p className="mt-3 rounded-xl bg-[#edf2e8] px-3 py-2.5 text-xs font-semibold leading-5 text-[#52655b]">A alteração vale para novas seleções. OS e agendamentos antigos mantêm o nome registrado na época.</p>
                        <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
                          <button type="button" onClick={() => setEditingClient(null)} disabled={clientActionId !== null} className="min-h-12 rounded-xl border-2 border-[#d9d1c4] bg-white px-4 text-xs font-black uppercase text-[#64736b] disabled:opacity-50">Cancelar</button>
                          <button type="submit" disabled={clientActionId !== null || editingClientName.trim().length < 3} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f32] px-4 text-xs font-black uppercase tracking-[0.08em] text-white disabled:opacity-50">
                            {clientActionId !== null ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            Salvar alteração
                          </button>
                        </div>
                      </form>
                    </section>
                  </div>
                )}
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
                        <div className="p-2 rounded-lg" style={{ backgroundColor: makeSectorColor(sectorColorBase[s] || '#3B82F6').bg, color: makeSectorColor(sectorColorBase[s] || '#3B82F6').fg }}><Tag size={20} /></div>
                        {editingSector === s ? (
                          <input
                            type="text"
                            value={editingSectorName}
                            onChange={e => setEditingSectorName(e.target.value)}
                            placeholder="Nome do setor..."
                            className="p-2 border-2 border-blue-500 rounded-lg font-bold text-gray-800 outline-none flex-1 text-sm"
                            autoFocus
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') handleEditSector(s, editingSectorName);
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
                              <CheckCircle size={20} />
                            </button>
                            <button
                              onClick={() => setEditingSector(null)}
                              className="text-gray-400 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <X size={20} />
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
                              <Pencil size={20} />
                            </button>
                            <button onClick={() => handleRemoveSector(s)} className="text-red-400 p-2 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={20} /></button>
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
                <option value="anomalies">Ordens de Serviço</option>
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
                      <button onClick={() => startEditRecord(item)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Edit2 size={18} /></button>
                      <button onClick={() => handleDeleteRecord(item.id)} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"><Trash2 size={18} /></button>
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
                    <button onClick={() => setEditingRecord(null)} className="p-2 rounded-full hover:bg-gray-200"><X size={20} /></button>
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
                          <Pencil size={14} /> Renomear
                        </button>
                        <button onClick={handleDeletePage} className="text-xs text-red-600 font-bold flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 uppercase">
                          <Trash2 size={14} /> Excluir
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <select value={selectedScreen} onChange={e => setSelectedScreen(e.target.value)} className="flex-1 p-4 bg-gray-50 border-2 border-gray-200 rounded-xl font-bold text-gray-800 outline-none focus:border-blue-500">
                      {combinedScreens.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <button onClick={() => setIsCreatingPage(true)} className="bg-blue-100 text-blue-700 px-4 rounded-xl border border-blue-200 shadow-sm font-bold text-sm flex flex-col items-center justify-center leading-none">
                      <FolderPlus size={20} />
                      <span className="text-[10px] mt-1">NOVA</span>
                    </button>
                  </div>
                </div>

                {showRenameModal && (
                  <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                      <div className="bg-gray-100 p-4 flex justify-between items-center border-b border-gray-200">
                        <h3 className="font-black text-gray-800 uppercase">Renomear Tela</h3>
                        <button onClick={() => setShowRenameModal(false)} className="p-2 rounded-full hover:bg-gray-200"><X size={20} /></button>
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
                      <Square size={24} className="text-green-600" />
                      <span className="text-[10px] font-bold text-gray-600 uppercase">Botão</span>
                    </button>
                    <button onClick={() => startCreateBlock('header')} className="bg-white border-2 border-gray-200 p-3 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all">
                      <Type size={24} className="text-blue-600" />
                      <span className="text-[10px] font-bold text-gray-600 uppercase">Título</span>
                    </button>
                    <button onClick={() => startCreateBlock('text')} className="bg-white border-2 border-gray-200 p-3 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm hover:border-purple-400 hover:bg-purple-50 active:scale-95 transition-all">
                      <MessageSquare size={24} className="text-purple-600" />
                      <span className="text-[10px] font-bold text-gray-600 uppercase">Texto</span>
                    </button>
                    <button onClick={() => startCreateBlock('card')} className="bg-white border-2 border-gray-200 p-3 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm hover:border-yellow-400 hover:bg-yellow-50 active:scale-95 transition-all">
                      <AlertCircle size={24} className="text-yellow-600" />
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
                          {block.type === 'button' && <Square size={24} className="text-blue-500" />}
                          {block.type === 'header' && <Type size={24} className="text-gray-800" />}
                          {block.type === 'text' && <MessageSquare size={24} className="text-gray-500" />}
                          {block.type === 'card' && <AlertCircle size={24} className="text-yellow-600" />}
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
                    {filteredBlocks.length === 0 && <div className="text-center text-gray-400 py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 font-bold text-sm">Nenhum item neste filtro.<br />Altere o filtro ou adicione um bloco acima.</div>}
                  </div>
                </div>
              </>
            )}

            {/* --- PAGE CREATOR MODAL --- */}
            {isCreatingPage && (
              <div className="bg-white p-6 rounded-2xl shadow-xl border-2 border-blue-100">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-xl text-gray-800 uppercase">Nova Tela</h3>
                  <button onClick={() => setIsCreatingPage(false)} className="p-2 bg-gray-100 rounded-full"><X size={24} /></button>
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
                  <button onClick={() => { setEditingBlock(null); setIsCreatingNew(false); }} className="px-4 py-2 bg-gray-100 rounded-xl font-black text-gray-700 uppercase text-xs flex items-center gap-2"><ArrowRight className="rotate-180" size={18} /> Voltar</button>
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
                            <BigButton icon={i} label="" onClick={() => { }} fullWidth={false} color="gray" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4 border-t border-gray-100">
                    {editingBlock && <button onClick={() => deleteBlock(editingBlock.id)} className="p-4 bg-red-100 text-red-600 rounded-xl font-bold"><Trash2 /></button>}
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
            <div className="rounded-[24px] border border-[#d9d1c4] bg-[#fbf8f1] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a7441]">Sistema</p>
              <h2 className="mt-1 font-serif text-2xl font-black text-[#173f32]">Sincronização</h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-[#68736d]">Confira se os registros deste aparelho já foram enviados e atualize as informações salvas para uso offline.</p>
            </div>

            <div className="rounded-[26px] border border-[#d9d1c4] bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf2e8] text-[#47745e]">
                    <Database size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#7a857f]">Situação do aparelho</p>
                    <h3 className="font-serif text-xl font-black text-[#173f32]">Registros locais</h3>
                  </div>
                </div>
                <button
                  aria-label="Atualizar status da sincronização"
                  onClick={() => void loadSyncStatus()}
                  className="rounded-xl border border-[#d9d1c4] bg-[#fbf8f1] p-3 text-[#47745e]"
                >
                  <RefreshCw size={18} className={syncStatusLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#dce5d8] bg-[#f3f7ef] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#66806f]">Aguardando envio</div>
                  <div className="mt-1 text-3xl font-black text-[#173f32]">{syncStatus?.pendingCount ?? '-'}</div>
                </div>
                <div className={`rounded-2xl border p-4 ${(syncStatus?.errorCount ?? 0) > 0 ? 'border-[#efcec7] bg-[#fbefec]' : 'border-[#dce5d8] bg-[#f3f7ef]'}`}>
                  <div className={`text-[10px] font-black uppercase tracking-[0.12em] ${(syncStatus?.errorCount ?? 0) > 0 ? 'text-[#a95849]' : 'text-[#66806f]'}`}>Com erro</div>
                  <div className="mt-1 text-3xl font-black text-[#173f32]">{syncStatus?.errorCount ?? '-'}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    void (async () => {
                      notify('Sincronizando...', 'info');
                      await db.syncPendingData();
                      await loadSyncStatus();
                    })();
                  }}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f32] px-2 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition-transform active:scale-[0.98]"
                >
                  <RefreshCw size={16} /> Sincronizar
                </button>
                <button
                  onClick={() => {
                    void (async () => {
                      await db.retrySyncErrors();
                      notify('Erros preparados para nova tentativa.', 'success');
                      await loadSyncStatus();
                    })();
                  }}
                  disabled={(syncStatus?.errorCount ?? 0) === 0}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d9d1c4] bg-[#fbf8f1] px-2 text-[11px] font-black uppercase tracking-wide text-[#47745e] transition-transform enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <RefreshCw size={16} /> Tentar erros
                </button>
              </div>

              {syncStatus?.errors?.length > 0 && (
                <div className="mt-4 border-t border-[#ebe5da] pt-4">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#a95849]">Erros recentes</div>
                  <div className="space-y-2">
                    {syncStatus.errors.slice(0, 5).map((error: any) => (
                      <div key={String(error.id)} className="rounded-xl border border-[#efcec7] bg-[#fbefec] p-3">
                        <div className="text-xs font-black text-[#8f493d]">{error.tableName || error.table_name}</div>
                        <div className="mt-1 line-clamp-2 text-[11px] font-semibold text-[#695e59]">{error.errorMessage || error.error_message || 'Erro'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[26px] border border-[#d9d1c4] bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f0e5c4] text-[#765f25]">
                  <Smartphone size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#7a857f]">Manutenção</p>
                  <h3 className="font-serif text-xl font-black text-[#173f32]">Dados do dispositivo</h3>
                </div>
              </div>
              <button
                onClick={() => {
                  void (async () => {
                    notify('Atualizando do servidor...', 'info');
                    await db.refreshFromServer();
                    notify('Atualização concluída.', 'success');
                    await loadSyncStatus();
                  })();
                }}
                className="mb-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173f32] px-3 text-xs font-black uppercase tracking-wide text-white shadow-sm transition-transform active:scale-[0.98]"
              >
                <RefreshCw size={18} /> Buscar atualizações
              </button>
              <button
                onClick={() => {
                  void (async () => {
                    notify('Recarregando todos os dados do servidor...', 'info');
                    await db.forceFullRefreshFromServer();
                    notify('Carga completa concluída.', 'success');
                    await loadSyncStatus();
                  })();
                }}
                className="mb-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#d9d1c4] bg-[#fbf8f1] px-3 text-xs font-black uppercase tracking-wide text-[#47745e] transition-transform active:scale-[0.98]"
              >
                <RefreshCw size={18} /> Recarregar dados completos
              </button>
              <button
                onClick={() => navigate('/diagnostics')}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#d9d1c4] bg-white px-3 text-xs font-black uppercase tracking-wide text-[#47745e] transition-transform active:scale-[0.98]"
              >
                <Smartphone size={18} /> Diagnóstico do aparelho
              </button>
            </div>

            {!dangerUnlocked ? (
              <button
                onClick={() => {
                  if (!confirm('ATENÇÃO: você está prestes a acessar a Zona de Perigo. Deseja continuar?')) return;
                  setDangerUnlocked(true);
                }}
                className="w-full bg-red-600 active:bg-red-700 text-white font-black text-xl py-5 rounded-2xl shadow-lg uppercase hidden"
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
                  className="w-full bg-red-600 active:bg-red-700 text-white font-black text-xl py-5 rounded-xl shadow-lg uppercase hidden"
                >
                  LIMPAR TUDO AGORA
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {workOrderToDelete && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-[#10231d]/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="presentation"
          onClick={() => !deletingWorkOrder && setWorkOrderToDelete(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-work-order-title"
            className="w-full max-w-md rounded-t-[28px] bg-[#fbf8f1] p-5 shadow-2xl sm:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f7ddd2] text-[#9b4939]">
                <Trash2 size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9b4939]">Ação permanente</p>
                <h2 id="delete-work-order-title" className="mt-1 font-serif text-2xl font-black text-[#173f32]">Excluir esta OS?</h2>
              </div>
              <button
                type="button"
                onClick={() => setWorkOrderToDelete(null)}
                disabled={deletingWorkOrder}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d9d1c4] bg-white text-[#52655b] disabled:opacity-50"
                aria-label="Cancelar exclusão"
              >
                <X size={19} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-[#ded7ca] bg-white p-4">
              <p className="truncate font-black text-[#173f32]">{workOrderToDelete.clientName || 'Cliente não informado'}</p>
              <p className="mt-1 text-xs font-semibold text-[#68736d]">{formatWorkOrderDate(workOrderToDelete)} · {workOrderToDelete.responsible || 'Técnico não informado'}</p>
            </div>

            <p className="mt-4 text-sm font-semibold leading-6 text-[#68736d]">A OS e seus anexos serão removidos. Se o aparelho estiver offline, a exclusão será enviada ao servidor assim que a conexão voltar.</p>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWorkOrderToDelete(null)}
                disabled={deletingWorkOrder}
                className="min-h-12 rounded-xl border-2 border-[#d9d1c4] bg-white px-3 text-xs font-black uppercase tracking-wide text-[#52655b] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void deleteSelectedWorkOrder()}
                disabled={deletingWorkOrder}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#9b4939] px-3 text-xs font-black uppercase tracking-wide text-white shadow-sm disabled:opacity-50"
              >
                {deletingWorkOrder ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />}
                Excluir OS
              </button>
            </div>
          </section>
        </div>
      )}

      {showDangerModal && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-red-50 p-4 flex justify-between items-center border-b border-red-100">
              <h3 className="font-black text-red-900 uppercase">Confirmação Final</h3>
              <button onClick={() => setShowDangerModal(false)} className="p-2 rounded-full hover:bg-red-100"><X size={20} /></button>
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
          title={pinModalConfig.title}
          description={pinModalConfig.description}
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
