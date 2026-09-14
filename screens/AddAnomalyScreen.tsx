import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CalendarDays,
  Camera,
  Check,
  CircleDollarSign,
  CopyPlus,
  Crosshair,
  FileText,
  Loader2,
  MapPin,
  Paperclip,
  Save,
  Trash2,
  UserRound,
  UsersRound
} from 'lucide-react';
import { ClientSignaturePad, ClientSignaturePadHandle } from '../components/ClientSignaturePad';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { ADMIN_PROFILE, CLIENTS, TECHNICIANS, WORK_ORDER_TYPES } from '../constants/work-orders';
import { db } from '../services/db.service';
import { farmContextService } from '../services/farm-context.service';
import { mediaService } from '../services/media.service';
import { notify } from '../services/notification.service';
import { permissionsService } from '../services/permissions.service';
import { Anomaly, Employee, MediaItem } from '../types';
import { validateFileSize } from '../utils/media-compression';
import { SearchableSelect } from '../components/SearchableSelect';
import { geocodingService } from '../services/geocoding.service';
import {
  clientSignature,
  currencyInput,
  formatAutomaticCents,
  parseCurrency,
  regularWorkOrderMedia,
  workOrderProjectValue
} from '../utils/work-orders';
import { createId } from '../utils/id';

const inputClass = 'w-full rounded-xl border-2 border-[#d8d0c2] bg-white px-4 py-3.5 text-base font-semibold text-[#173f32] outline-none transition focus:border-[#3f7457] focus:ring-2 focus:ring-[#3f7457]/10';

const createWorkOrderId = () => createId('os');

const getLocalDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

const geolocationMessage = (error: GeolocationPositionError) => {
  if (error.code === error.PERMISSION_DENIED) return 'Permissão de localização não concedida.';
  if (error.code === error.POSITION_UNAVAILABLE) return 'Localização indisponível neste aparelho.';
  if (error.code === error.TIMEOUT) return 'O GPS demorou para responder. Tente novamente.';
  return 'Não foi possível capturar a localização.';
};

const mediaTypeFor = (file: File): MediaItem['type'] => {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type === 'application/pdf') return 'pdf';
  if (/\.pptx?$/i.test(file.name)) return 'ppt';
  return 'doc';
};

export const AddAnomalyScreen: React.FC = () => {
  const navigate = useNavigate();
  const { id: editingId, cloneId } = useParams<{ id?: string; cloneId?: string }>();
  const isEditing = Boolean(editingId);
  const isCloning = Boolean(cloneId);
  const sourceRecordId = editingId || cloneId;
  const currentContext = farmContextService.getContext();
  const isAdminProfile = permissionsService.isAdmin(currentContext);
  const [employees, setEmployees] = useState<Employee[]>(TECHNICIANS);
  const [clients, setClients] = useState<string[]>([...CLIENTS]);
  const [serviceDate, setServiceDate] = useState(getLocalDate);
  const [clientName, setClientName] = useState('');
  const [technicianId, setTechnicianId] = useState(() => (
    isAdminProfile ? '' : String(currentContext?.employee_id || '')
  ));
  const [serviceOrderType, setServiceOrderType] = useState<'receita' | 'despesa'>('receita');
  const [projectValue, setProjectValue] = useState('');
  const [visitValue, setVisitValue] = useState('');
  const [kmQuantity, setKmQuantity] = useState('');
  const [kmTotalValue, setKmTotalValue] = useState('');
  const [additionalExpenseValue, setAdditionalExpenseValue] = useState('');
  const [additionalExpenseDescription, setAdditionalExpenseDescription] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'a_receber' | 'recebido'>('a_receber');
  const [notes, setNotes] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [existingOrder, setExistingOrder] = useState<Anomaly | null>(null);
  const [removedMedia, setRemovedMedia] = useState<MediaItem[]>([]);
  const [location, setLocation] = useState<Anomaly['location']>();
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [addressStatus, setAddressStatus] = useState<'idle' | 'loading' | 'ready' | 'offline' | 'error'>('idle');
  const [locationError, setLocationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [loadingRecord, setLoadingRecord] = useState(isEditing || isCloning);
  const signaturePadRef = useRef<ClientSignaturePadHandle>(null);
  const signaturePreviewUrlRef = useRef('');
  const mediaRef = useRef<MediaItem[]>([]);

  const captureLocation = useCallback((automatic = false) => {
    if (!('geolocation' in navigator)) {
      const message = 'Este aparelho não oferece localização pelo navegador.';
      setLocationStatus('error');
      setLocationError(message);
      if (!automatic) notify(message, 'error');
      return;
    }

    setLocationStatus('loading');
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const capturedLocation: NonNullable<Anomaly['location']> = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
          capturedAt: new Date(position.timestamp || Date.now()).toISOString()
        };
        setLocation(capturedLocation);
        setLocationStatus('ready');
        if (!automatic) notify('Localização atualizada.', 'success');

        if (!navigator.onLine) {
          setAddressStatus('offline');
          return;
        }

        setAddressStatus('loading');
        try {
          const address = await geocodingService.reverseLookup(capturedLocation.latitude, capturedLocation.longitude);
          if (!address) {
            setAddressStatus(navigator.onLine ? 'error' : 'offline');
            return;
          }
          setLocation((current) => current ? {
            ...current,
            address,
            addressCapturedAt: new Date().toISOString(),
            addressProvider: 'OpenStreetMap'
          } : current);
          setAddressStatus('ready');
        } catch (error) {
          console.warn('Não foi possível descobrir o endereço aproximado:', error);
          setAddressStatus(navigator.onLine ? 'error' : 'offline');
        }
      },
      (error) => {
        const message = geolocationMessage(error);
        setLocationStatus('error');
        setLocationError(message);
        if (!automatic) notify(message, 'error');
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 120_000 }
    );
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      // Garante que mudanças de perfil feitas pelo administrador cheguem à OS
      // antes de montar a lista. Offline, mantém normalmente o cadastro local.
      await Promise.all([
        db.forceRefreshTable('employees'),
        db.forceRefreshTable('clients')
      ]);
      return Promise.all([
        db.getEmployees(),
        db.getClients(),
        sourceRecordId ? db.getAnomalyById(sourceRecordId) : Promise.resolve(null)
      ]);
    })().then(([items, clientItems, order]) => {
      if (!active) return;
      const sorted = items
        // Funcionários continuam disponíveis como responsáveis mesmo quando
        // também têm acesso administrativo. Exclui apenas o login genérico.
        .filter((employee) => String(employee.id) !== ADMIN_PROFILE.id)
        .filter((employee) => !employee.status || employee.status === 'active')
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setClients(clientItems.map((client) => client.name));
      if (sourceRecordId) {
        if (!order) {
          notify('Ordem de Serviço não encontrada.', 'error');
          navigate('/anomalies/list', { replace: true });
          return;
        }
        let selectedTechnician = sorted.find((employee) => String(employee.id) === String(order.technicianId))
          || sorted.find((employee) => employee.name === order.responsible);
        if (!selectedTechnician && order.responsible) {
          selectedTechnician = {
            id: String(order.technicianId || `legacy-${order.id}`),
            name: order.responsible,
            role: 'Técnico'
          };
          sorted.push(selectedTechnician);
          sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        }
        if (isEditing) setExistingOrder(order);
        setServiceDate(isCloning ? getLocalDate() : order.serviceDate || order.createdAt.slice(0, 10));
        setClientName(order.clientName || '');
        setTechnicianId(selectedTechnician?.id || '');
        setServiceOrderType(order.serviceOrderType || 'receita');
        setProjectValue(currencyInput(workOrderProjectValue(order)));
        setVisitValue(currencyInput(order.visitValue));
        setKmQuantity(order.kmQuantity ? String(order.kmQuantity).replace('.', ',') : '');
        setKmTotalValue(currencyInput(
          order.kmValue
          || ((order.kmQuantity || 0) * (order.kmUnitValue || 0))
        ));
        setAdditionalExpenseValue(currencyInput(order.additionalExpenseValue));
        setAdditionalExpenseDescription(order.additionalExpenseDescription || '');
        setPaymentStatus(order.paymentStatus === 'recebido' ? 'recebido' : 'a_receber');
        setNotes(order.description || '');
        // A clonagem reaproveita somente os dados estruturados da OS. Fotos,
        // documentos e assinatura pertencem ao atendimento original.
        mediaRef.current = isCloning ? [] : order.media || [];
        setMedia(mediaRef.current);
        setLocation(isCloning ? undefined : order.location);
        setLocationStatus(isCloning ? 'idle' : order.location ? 'ready' : 'idle');
        setAddressStatus(isCloning ? 'idle' : order.location?.address ? 'ready' : 'idle');
        if (isCloning) captureLocation(true);
        setLoadingRecord(false);
      } else {
        const context = farmContextService.getContext();
        const activeProfileIsAdmin = permissionsService.isAdmin(context);
        let current = sorted.find((employee) => String(employee.id) === String(context?.employee_id))
          || sorted.find((employee) => employee.name === context?.employee_name);
        if (!activeProfileIsAdmin && !current && context?.employee_id && context?.employee_name) {
          current = {
            id: String(context.employee_id),
            name: context.employee_name,
            role: 'Técnico',
            status: 'active'
          };
          sorted.push(current);
          sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        }
        // O administrador precisa indicar o técnico responsável. Nunca assumir o
        // primeiro nome da lista, pois isso atribui a OS à pessoa errada.
        setTechnicianId(activeProfileIsAdmin ? '' : current?.id || '');
        captureLocation(true);
      }
      setEmployees(sorted);
    });
    return () => { active = false; };
  }, [captureLocation, isCloning, isEditing, navigate, sourceRecordId]);

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  useEffect(() => {
    let active = true;
    const signature = media.find((item) => item.purpose === 'client_signature');
    if (!signature) {
      if (signaturePreviewUrlRef.current) {
        URL.revokeObjectURL(signaturePreviewUrlRef.current);
        signaturePreviewUrlRef.current = '';
      }
      setSignatureUrl('');
      return () => { active = false; };
    }
    void mediaService.loadMediaUrl(signature).then((url) => {
      if (!active || !url) return;
      if (signaturePreviewUrlRef.current && signaturePreviewUrlRef.current !== url) {
        URL.revokeObjectURL(signaturePreviewUrlRef.current);
        signaturePreviewUrlRef.current = '';
      }
      setSignatureUrl(url);
    });
    return () => { active = false; };
  }, [media]);

  useEffect(() => () => {
    if (signaturePreviewUrlRef.current) {
      URL.revokeObjectURL(signaturePreviewUrlRef.current);
      signaturePreviewUrlRef.current = '';
    }
  }, []);

  const regularMedia = regularWorkOrderMedia({ media } as Anomaly);
  const signature = clientSignature({ media } as Anomaly);
  const currentKmQuantity = Number(kmQuantity.replace(',', '.')) || 0;
  const currentKmTotal = parseCurrency(kmTotalValue);
  const currentKmUnitValue = currentKmQuantity > 0
    ? currentKmTotal / currentKmQuantity
    : 0;
  const currentAdditionalExpense = parseCurrency(additionalExpenseValue);
  const currentExpenseTotal = parseCurrency(visitValue) + currentKmTotal + currentAdditionalExpense;

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (regularMedia.length >= 5) {
      notify('Limite de 5 anexos por OS.', 'error');
      return;
    }
    if (!validateFileSize(file, 12)) {
      notify('O arquivo deve ter no máximo 12 MB.', 'error');
      return;
    }

    try {
      const item = await mediaService.saveMediaFile(file, mediaTypeFor(file));
      const nextMedia = [...mediaRef.current, item];
      mediaRef.current = nextMedia;
      setMedia(nextMedia);
      notify('Anexo adicionado.', 'success');
    } catch (error) {
      console.error('Erro ao anexar arquivo:', error);
      notify('Não foi possível anexar o arquivo.', 'error');
    }
  };

  const removeMedia = async (item: MediaItem) => {
    const nextMedia = mediaRef.current.filter((mediaItem) => mediaItem.id !== item.id);
    mediaRef.current = nextMedia;
    setMedia(nextMedia);
    if (existingOrder?.media?.some((mediaItem) => mediaItem.id === item.id)) {
      setRemovedMedia((current) => [...current, item]);
      return;
    }
    await mediaService.deleteMedia(item);
  };

  const saveSignature = async (blob: Blob): Promise<boolean> => {
    setSignatureSaving(true);
    try {
      if (signature) await removeMedia(signature);
      const saved = await mediaService.saveMediaBlob(blob, 'photo', 'Assinatura do cliente.png');
      if (signaturePreviewUrlRef.current) URL.revokeObjectURL(signaturePreviewUrlRef.current);
      signaturePreviewUrlRef.current = URL.createObjectURL(blob);
      setSignatureUrl(signaturePreviewUrlRef.current);
      const nextMedia: MediaItem[] = [...mediaRef.current.filter((item) => item.purpose !== 'client_signature'), {
        ...saved,
        name: 'Assinatura do cliente.png',
        purpose: 'client_signature'
      }];
      mediaRef.current = nextMedia;
      setMedia(nextMedia);
      notify('Assinatura registrada.', 'success');
      return true;
    } catch (error) {
      console.error('Erro ao salvar assinatura:', error);
      notify('Não foi possível registrar a assinatura.', 'error');
      return false;
    } finally {
      setSignatureSaving(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!serviceDate) return notify('Informe a data da OS.', 'error');
    if (!clientName) return notify('Selecione o cliente.', 'error');
    const technician = isAdminProfile
      ? employees.find((employee) => String(employee.id) === String(technicianId))
      : employees.find((employee) => String(employee.id) === String(currentContext?.employee_id))
        || employees.find((employee) => employee.name === currentContext?.employee_name)
        || (currentContext?.employee_id && currentContext?.employee_name
          ? {
              id: String(currentContext.employee_id),
              name: currentContext.employee_name,
              role: 'Técnico',
              status: 'active' as const
            }
          : undefined);
    if (!technician) return notify('Selecione o técnico.', 'error');

    const parsedProjectValue = parseCurrency(projectValue);
    const parsedVisitValue = parseCurrency(visitValue);
    const parsedKmQuantity = Number(kmQuantity.replace(',', '.')) || 0;
    const parsedKmValue = parseCurrency(kmTotalValue);
    const parsedAdditionalExpenseValue = parseCurrency(additionalExpenseValue);
    const parsedKmUnitValue = parsedKmQuantity > 0
      ? parsedKmValue / parsedKmQuantity
      : 0;
    if (serviceOrderType === 'receita' && parsedProjectValue <= 0) {
      return notify('Informe o valor do projeto.', 'error');
    }
    if (serviceOrderType === 'despesa' && parsedVisitValue <= 0 && parsedKmValue <= 0) {
      return notify('Informe o valor da visita ou o valor final dos KM.', 'error');
    }
    if (serviceOrderType === 'despesa' && ((parsedKmQuantity > 0) !== (parsedKmValue > 0))) {
      return notify('Preencha a quantidade de KM e o valor total dos KM.', 'error');
    }

    setSaving(true);
    try {
      // Se o cliente desenhou e foi direto ao botão final, a assinatura é
      // confirmada automaticamente antes de montar o registro da OS.
      const signatureReady = await signaturePadRef.current?.commit();
      if (signatureReady === false) return;

      const workOrder: Anomaly = {
        ...(existingOrder || {}),
        id: existingOrder?.id || createWorkOrderId(),
        recordType: 'service_order',
        createdAt: existingOrder?.createdAt || new Date().toISOString(),
        serviceDate,
        clientName,
        serviceOrderType,
        projectValue: serviceOrderType === 'receita' ? parsedProjectValue : 0,
        visitValue: serviceOrderType === 'despesa' ? parsedVisitValue : 0,
        kmQuantity: serviceOrderType === 'despesa' ? parsedKmQuantity : 0,
        kmUnitValue: serviceOrderType === 'despesa' ? parsedKmUnitValue : 0,
        kmValue: serviceOrderType === 'despesa' ? parsedKmValue : 0,
        additionalExpenseValue: serviceOrderType === 'despesa' ? parsedAdditionalExpenseValue : 0,
        additionalExpenseDescription: serviceOrderType === 'despesa' && parsedAdditionalExpenseValue > 0
          ? additionalExpenseDescription.trim()
          : '',
        paymentStatus: serviceOrderType === 'receita' ? paymentStatus : null,
        location,
        responsible: technician.name,
        technicianId: technician.id,
        createdByEmployeeId: existingOrder?.createdByEmployeeId || currentContext?.employee_id || technician.id,
        createdByEmployeeName: existingOrder?.createdByEmployeeName || currentContext?.employee_name || technician.name,
        employee_id: existingOrder?.employee_id || currentContext?.employee_id || technician.id,
        employee_name: existingOrder?.employee_name || currentContext?.employee_name || technician.name,
        sector: 'Ordem de Serviço',
        description: notes.trim(),
        immediateSolution: '',
        media: mediaRef.current
      };

      if (existingOrder) await db.updateAnomaly(workOrder);
      else await db.addAnomaly(workOrder);
      await Promise.all(removedMedia.map((item) => mediaService.deleteMedia(item)));
      notify(existingOrder ? 'Ordem de Serviço atualizada.' : isCloning ? 'Nova OS criada a partir da cópia.' : 'Ordem de Serviço salva neste aparelho.', 'success');
      navigate(existingOrder || isCloning ? `/anomalies/detail/${workOrder.id}` : '/anomalies/list');
    } catch (error) {
      console.error('Erro ao salvar OS:', error);
      notify('Não foi possível salvar a OS.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loadingRecord) {
    return (
      <Layout className="bg-[#f4f0e7]">
        <Header title={isCloning ? 'Clonar Ordem de Serviço' : 'Editar Ordem de Serviço'} targetRoute="/anomalies/list" />
        <div className="flex flex-1 items-center justify-center text-[#3f7457]"><Loader2 className="animate-spin" size={32} /></div>
      </Layout>
    );
  }

  return (
    <Layout className="bg-[#f4f0e7]">
      <Header
        title={isEditing ? 'Editar Ordem de Serviço' : isCloning ? 'Clonar Ordem de Serviço' : 'Nova Ordem de Serviço'}
        targetRoute={sourceRecordId ? `/anomalies/detail/${sourceRecordId}` : '/anomalies'}
      />

      <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-4 pb-10 pt-4">
        <div className="space-y-4">
          {isCloning && (
            <section className="overflow-hidden rounded-2xl border border-[#c9ad6c] bg-[#fffaf0] shadow-sm" aria-label="Orientação para clonar OS">
              <div className="flex items-start gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8a6722] text-white"><CopyPlus size={20} /></span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6b511d]">Cópia da OS</p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-[#665b43]">Os dados da OS foram reaproveitados para você revisar. Fotos, documentos, assinatura e localização começam como um novo atendimento.</p>
                </div>
              </div>
            </section>
          )}
          <section className="overflow-hidden rounded-2xl border border-[#d8d0c2] bg-white shadow-sm">
            <div className="border-b border-[#e5ded2] bg-[#173f32] px-5 py-4 text-white">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#caddb3]">Campo Legado Consultoria</p>
              <h2 className="campo-display mt-1 text-2xl">{isEditing ? 'Revisar dados da OS' : isCloning ? 'Revise a nova OS' : 'Dados da OS'}</h2>
            </div>

            <div className="space-y-5 p-4">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-[#476356]">
                  <CalendarDays size={16} /> Data
                </span>
                <input className={inputClass} type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} />
              </label>

              <div>
                <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-[#476356]">
                  <UsersRound size={16} /> Cliente
                </span>
                <SearchableSelect
                  value={clientName}
                  onChange={setClientName}
                  options={clients.map((client) => ({ value: client, label: client }))}
                  placeholder="Selecione o cliente"
                  searchPlaceholder="Digite o nome do cliente"
                  emptyMessage="Nenhum cliente corresponde à busca."
                />
              </div>

              <div>
                <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-[#476356]">
                  <UserRound size={16} /> Técnico
                </span>
                <SearchableSelect
                  value={technicianId}
                  onChange={setTechnicianId}
                  options={employees.map((employee) => ({ value: employee.id, label: employee.name, description: employee.role || 'Técnico' }))}
                  placeholder="Selecione o técnico"
                  searchPlaceholder="Digite o nome do técnico"
                  disabled={!isAdminProfile}
                />
                {isAdminProfile
                  ? <span className="mt-2 block text-xs font-semibold text-[#718078]">Selecione quem ficará responsável por esta OS.</span>
                  : <span className="mt-2 block text-xs font-semibold text-[#718078]">O técnico é definido pelo perfil ativo.</span>}
              </div>

              <fieldset>
                <legend className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-[#476356]">Tipo de OS</legend>
                <div className="grid grid-cols-2 gap-2">
                  {WORK_ORDER_TYPES.map((type) => {
                    const selected = serviceOrderType === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setServiceOrderType(type.value)}
                        className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3.5 font-black transition ${selected ? 'border-[#3f7457] bg-[#e2ecd9] text-[#173f32]' : 'border-[#ddd6ca] bg-white text-[#6a756f]'}`}
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? 'border-[#3f7457] bg-[#3f7457] text-white' : 'border-[#aaa89f]'}`}>
                          {selected && <Check size={13} strokeWidth={3} />}
                        </span>
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </section>

          <section className="rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-[#173f32]">
              <CircleDollarSign size={21} />
              <h2 className="campo-display text-xl">{serviceOrderType === 'receita' ? 'Valor do projeto' : 'Despesas da visita'}</h2>
            </div>
            {serviceOrderType === 'receita' ? (
              <div className="space-y-4">
                <label>
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.08em] text-[#476356]">Valor do projeto</span>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[#3f7457]">R$</span>
                    <input className={`${inputClass} pl-12`} inputMode="numeric" placeholder="0,00" value={projectValue} onChange={(event) => setProjectValue(formatAutomaticCents(event.target.value))} />
                  </div>
                  <span className="mt-2 block text-xs text-[#718078]">Digite os números; os centavos são preenchidos automaticamente.</span>
                </label>
                <fieldset>
                  <legend className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-[#476356]">Recebimento</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['a_receber', 'A receber'],
                      ['recebido', 'Recebido']
                    ] as const).map(([value, label]) => (
                      <button key={value} type="button" onClick={() => setPaymentStatus(value)} className={`rounded-xl border-2 px-3 py-3 text-sm font-black ${paymentStatus === value ? 'border-[#3f7457] bg-[#e6eee1] text-[#173f32]' : 'border-[#ddd6ca] bg-white text-[#68746d]'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.08em] text-[#476356]">Valor da visita</span>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[#3f7457]">R$</span>
                    <input aria-label="Valor da visita" className={`${inputClass} pl-12`} inputMode="numeric" placeholder="0,00" value={visitValue} onChange={(event) => setVisitValue(formatAutomaticCents(event.target.value))} />
                  </div>
                </label>
                <label>
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.08em] text-[#476356]">KM rodados</span>
                  <div className="relative">
                    <input aria-label="KM rodados" className={`${inputClass} pr-14`} inputMode="decimal" placeholder="0" value={kmQuantity} onChange={(event) => setKmQuantity(event.target.value.replace(/[^0-9,.]/g, '').replace('.', ','))} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-[#718078]">KM</span>
                  </div>
                </label>
                <label className="sm:col-span-2">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.08em] text-[#476356]">Valor total do deslocamento</span>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[#3f7457]">R$</span>
                    <input aria-label="Valor total do deslocamento" className={`${inputClass} pl-12`} inputMode="numeric" placeholder="0,00" value={kmTotalValue} onChange={(event) => setKmTotalValue(formatAutomaticCents(event.target.value))} />
                  </div>
                  <span className="mt-2 block text-xs text-[#718078]">Informe o valor total dos KM. A média por KM será calculada automaticamente.</span>
                </label>
                <div className="space-y-3 rounded-2xl border border-[#ded4bf] bg-[#f7f1e5] p-3 sm:col-span-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-[#6f5b38]">Outros valores a receber</p>
                    <p className="mt-1 text-xs leading-5 text-[#776d5d]">Opcional. Esse valor será acrescentado ao total da despesa.</p>
                  </div>
                  <label>
                    <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.08em] text-[#756646]">Valor adicional</span>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[#6f5b38]">R$</span>
                      <input aria-label="Outros valores a receber" className={`${inputClass} border-[#d8c9aa] bg-white pl-12`} inputMode="numeric" placeholder="0,00" value={additionalExpenseValue} onChange={(event) => setAdditionalExpenseValue(formatAutomaticCents(event.target.value))} />
                    </div>
                  </label>
                  <label>
                    <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.08em] text-[#756646]">Descrição do valor</span>
                    <input aria-label="Descrição dos outros valores" className={`${inputClass} border-[#d8c9aa] bg-white`} maxLength={100} placeholder="Ex.: pedágio, alimentação ou hospedagem" value={additionalExpenseDescription} onChange={(event) => setAdditionalExpenseDescription(event.target.value)} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:col-span-2" aria-live="polite">
                  <div className="rounded-xl border border-[#d9e3d4] bg-[#edf4e8] p-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.08em] text-[#5f7668]">Valor médio por KM</span>
                    <p className="mt-1 text-base font-black text-[#173f32]">{currentKmUnitValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<span className="ml-1 text-[10px] text-[#5f7668]">/ km</span></p>
                    <p className="mt-1 text-[10px] font-semibold text-[#718078]">{currentKmTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ÷ {currentKmQuantity.toLocaleString('pt-BR')} km</p>
                  </div>
                  <div className="rounded-xl bg-[#173f32] p-3 text-white">
                    <span className="text-[10px] font-black uppercase tracking-[0.08em] text-white/60">Total da despesa</span>
                    <p className="mt-1 text-base font-black">{currentExpenseTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    <p className="mt-1 text-[10px] font-semibold text-white/55">Visita + deslocamento + outros</p>
                  </div>
                </div>
                <p className="text-xs text-[#718078] sm:col-span-2">Nos valores, basta digitar os números: os centavos entram automaticamente.</p>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[#173f32]">
                  <MapPin size={21} />
                  <h2 className="campo-display text-xl">Localização automática</h2>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#68746d]">Coordenadas do aparelho no momento da visita.</p>
              </div>
              <button
                type="button"
                onClick={() => captureLocation(false)}
                disabled={locationStatus === 'loading'}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#173f32] text-white disabled:opacity-60"
                aria-label="Atualizar localização"
              >
                {locationStatus === 'loading' ? <Loader2 className="animate-spin" size={20} /> : <Crosshair size={20} />}
              </button>
            </div>

            {locationStatus === 'ready' && location && (
              <div className="mt-4 rounded-xl border border-[#bdd0b3] bg-[#edf4e8] p-3 text-sm text-[#173f32]">
                <p className="font-black">Localização capturada</p>
                <p className="mt-1 font-mono text-xs">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>
                {location.accuracy !== undefined && <p className="mt-1 text-xs">Precisão aproximada: {Math.round(location.accuracy)} m</p>}
                {location.address && (
                  <div className="mt-3 border-t border-[#c9d9c0] pt-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#557065]">Endereço aproximado</p>
                    <p className="mt-1 text-sm font-bold leading-5">{location.address}</p>
                    <p className="mt-2 text-[10px] font-semibold text-[#68746d]">© OpenStreetMap contributors</p>
                  </div>
                )}
                {addressStatus === 'loading' && <p className="mt-3 border-t border-[#c9d9c0] pt-3 text-xs font-semibold">Buscando o nome da rua…</p>}
                {addressStatus === 'offline' && <p className="mt-3 border-t border-[#c9d9c0] pt-3 text-xs font-semibold">GPS salvo. Para obter a rua, atualize a localização quando a internet voltar.</p>}
                {addressStatus === 'error' && <p className="mt-3 border-t border-[#c9d9c0] pt-3 text-xs font-semibold">Coordenadas salvas; o endereço não pôde ser consultado agora.</p>}
              </div>
            )}
            {locationStatus === 'loading' && <p className="mt-4 text-sm font-semibold text-[#476356]">Buscando sinal do GPS…</p>}
            {locationStatus === 'error' && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{locationError}</p>}
          </section>

          <section className="rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-[#173f32]">
              <Paperclip size={21} />
              <h2 className="campo-display text-xl">Anexos</h2>
              <span className="ml-auto text-xs font-bold text-[#68746d]">{regularMedia.length}/5</span>
            </div>
            {isCloning && (
              <p className="mb-3 rounded-xl border border-[#e0d4ba] bg-[#faf6eb] px-4 py-3 text-xs font-semibold leading-5 text-[#6c6048]">Nenhum anexo da OS original foi copiado. Adicione somente os arquivos deste novo atendimento.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#9eb195] bg-[#f2f6ed] text-[#315f45]">
                <Camera size={23} />
                <span className="mt-1 text-xs font-black uppercase">Foto do relatório</span>
                <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFile} />
              </label>
              <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#c9bba9] bg-[#faf7f0] text-[#6b4d3c]">
                <FileText size={23} />
                <span className="mt-1 text-xs font-black uppercase">Arquivo</span>
                <input type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.ppt,.pptx" onChange={handleFile} />
              </label>
            </div>

            {regularMedia.length > 0 && (
              <div className="mt-3 space-y-2">
                {regularMedia.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[#e5ded2] bg-[#faf8f3] p-3">
                    <Paperclip size={17} className="shrink-0 text-[#3f7457]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#33483f]">{item.name || 'Anexo'}</span>
                    <button type="button" onClick={() => void removeMedia(item)} className="rounded-lg p-2 text-red-600" aria-label="Remover anexo">
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="campo-display text-xl text-[#173f32]">Assinatura do cliente</h2>
              <p className="mt-1 text-xs leading-5 text-[#68746d]">{isCloning ? 'A assinatura anterior não foi copiada. Se necessário, registre uma nova para este atendimento.' : 'Opcional. Pode ser feita com o dedo e fica salva junto da OS, inclusive offline.'}</p>
            </div>
            <ClientSignaturePad
              ref={signaturePadRef}
              existingUrl={signatureUrl}
              saving={signatureSaving}
              onSave={saveSignature}
              onRemove={() => { if (signature) void removeMedia(signature); }}
              onError={() => notify('Não foi possível gerar a assinatura neste aparelho. Limpe e tente novamente.', 'error')}
            />
          </section>

          <section className="rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <label>
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.08em] text-[#476356]">Observações (opcional)</span>
              <textarea className={`${inputClass} min-h-24 resize-y`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Informações adicionais da visita" />
            </label>
          </section>

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#173f32] px-5 py-4 text-base font-black uppercase tracking-[0.08em] text-white shadow-lg transition active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? <Loader2 className="animate-spin" size={21} /> : <Save size={21} />}
            {saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : isCloning ? 'Criar OS clonada' : 'Salvar OS'}
          </button>
        </div>
      </form>
    </Layout>
  );
};
