import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Sun,
  Sunrise,
  Trash2,
  UserRound,
  UsersRound,
  X,
  XCircle
} from 'lucide-react';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { SearchableOption, SearchableSelect } from '../components/SearchableSelect';
import { db } from '../services/db.service';
import { farmContextService } from '../services/farm-context.service';
import { localdb } from '../services/localdb';
import { notify } from '../services/notification.service';
import { permissionsService } from '../services/permissions.service';
import { Appointment, AppointmentPeriod, AppointmentStatus, Client, Employee } from '../types';
import { createId } from '../utils/id';

const MONTH_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const DAY_FORMATTER = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const dateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
].join('-');

const parseDateKey = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const capitalize = (value: string) => value ? value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1) : value;

const periodLabel: Record<AppointmentPeriod, string> = {
  morning: 'Manhã',
  afternoon: 'Tarde',
  full_day: 'Dia todo'
};

const PERIOD_ORDER: AppointmentPeriod[] = ['full_day', 'morning', 'afternoon'];
const periodRank = (period: AppointmentPeriod) => PERIOD_ORDER.indexOf(period);
const periodsOverlap = (first: AppointmentPeriod, second: AppointmentPeriod) => (
  first === 'full_day' || second === 'full_day' || first === second
);

const statusLabel: Record<AppointmentStatus, string> = {
  scheduled: 'Agendado',
  completed: 'Atendido',
  cancelled: 'Cancelado'
};

const statusClass: Record<AppointmentStatus, string> = {
  scheduled: 'border-[#ead59b] bg-[#f7edcf] text-[#70591e]',
  completed: 'border-[#bdd2b1] bg-[#e1edd9] text-[#28543a]',
  cancelled: 'border-[#ddd7cd] bg-[#eeeae3] text-[#746d64]'
};

type AppointmentForm = {
  id?: string;
  clientId: string;
  clientName: string;
  employeeId: string;
  date: string;
  period: AppointmentPeriod;
  status: AppointmentStatus;
  activity: string;
  locationNote: string;
  notes: string;
};

const formFor = (
  date: string,
  period: AppointmentPeriod,
  employeeId: string,
  appointment?: Appointment
): AppointmentForm => appointment ? {
  id: appointment.id,
  clientId: appointment.clientId || appointment.clientName,
  clientName: appointment.clientName,
  employeeId: appointment.employee_id,
  date: appointment.date,
  period: appointment.period,
  status: appointment.status,
  activity: appointment.activity || 'Visita técnica',
  locationNote: appointment.locationNote || '',
  notes: appointment.notes || ''
} : {
  clientId: '',
  clientName: '',
  employeeId,
  date,
  period,
  status: 'scheduled',
  activity: 'Visita técnica',
  locationNote: '',
  notes: ''
};

export const AgendaScreen: React.FC = () => {
  const context = farmContextService.getContext();
  const isAdmin = permissionsService.isAdmin(context);
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);

  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1, 12));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [viewEmployeeId, setViewEmployeeId] = useState(isAdmin ? 'all' : (context?.employee_id || ''));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<AppointmentForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);

  const loadData = useCallback(async () => {
    const [nextAppointments, nextClients, nextEmployees] = await Promise.all([
      db.getAppointments(),
      db.getClients(),
      db.getEmployees()
    ]);
    setAppointments(nextAppointments.sort((a, b) => a.date.localeCompare(b.date) || periodRank(a.period) - periodRank(b.period)));
    setClients(nextClients);
    setEmployees(nextEmployees
      .filter((employee) => !employee.status || employee.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    const unsubscribeAppointments = localdb.subscribe('appointments', () => { void loadData(); });
    const unsubscribeClients = localdb.subscribe('clients', () => { void loadData(); });
    const unsubscribeEmployees = localdb.subscribe('employees', () => { void loadData(); });
    return () => {
      unsubscribeAppointments?.();
      unsubscribeClients?.();
      unsubscribeEmployees?.();
    };
  }, [loadData]);

  const scopedAppointments = useMemo(() => appointments.filter((appointment) => (
    viewEmployeeId === 'all' || appointment.employee_id === viewEmployeeId
  )), [appointments, viewEmployeeId]);

  const currentMonth = monthKey(cursor);
  const monthlyAppointments = useMemo(() => scopedAppointments.filter((appointment) => (
    appointment.date.startsWith(currentMonth) && appointment.status !== 'cancelled'
  )), [currentMonth, scopedAppointments]);

  const monthStats = useMemo(() => ({
    completed: monthlyAppointments.filter((appointment) => appointment.status === 'completed').length,
    scheduled: monthlyAppointments.filter((appointment) => appointment.status === 'scheduled').length,
    clients: new Set(monthlyAppointments.map((appointment) => appointment.clientName)).size
  }), [monthlyAppointments]);

  const appointmentsByDate = useMemo(() => {
    const grouped = new Map<string, Appointment[]>();
    for (const appointment of scopedAppointments) {
      const list = grouped.get(appointment.date) || [];
      list.push(appointment);
      grouped.set(appointment.date, list);
    }
    return grouped;
  }, [scopedAppointments]);

  const selectedAppointments = useMemo(() => (
    (appointmentsByDate.get(selectedDate) || []).sort((a, b) => periodRank(a.period) - periodRank(b.period) || a.clientName.localeCompare(b.clientName, 'pt-BR'))
  ), [appointmentsByDate, selectedDate]);

  const calendarCells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const leading = new Date(year, month, 1, 12).getDay();
    const totalDays = new Date(year, month + 1, 0, 12).getDate();
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: totalDays }, (_, index) => new Date(year, month, index + 1, 12))
    ];
  }, [cursor]);

  const clientOptions: SearchableOption[] = useMemo(() => clients.map((client) => ({
    value: client.id,
    label: client.name
  })), [clients]);

  const employeeOptions: SearchableOption[] = useMemo(() => employees.map((employee) => ({
    value: employee.id,
    label: employee.name,
    description: permissionsService.isPrivilegedEmployee(employee) ? 'Administrador' : 'Técnico'
  })), [employees]);

  const viewOptions: SearchableOption[] = useMemo(() => [
    { value: 'all', label: 'Toda a equipe', description: 'Agenda do administrador e dos técnicos' },
    ...employeeOptions
  ], [employeeOptions]);

  const moveMonth = (direction: number) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1, 12);
    setCursor(next);
    const selected = dateKey(next);
    setSelectedDate(selected);
  };

  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1, 12));
    setSelectedDate(todayKey);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await db.syncPendingData();
      await db.forceRefreshTable('appointments');
      await loadData();
      notify('Agenda atualizada.', 'success');
    } catch (error) {
      console.error('Erro ao atualizar agenda:', error);
      notify('A agenda local continua disponível.', 'info');
    } finally {
      setRefreshing(false);
    }
  };

  const defaultEmployeeId = viewEmployeeId !== 'all'
    ? viewEmployeeId
    : (context?.employee_id || employees[0]?.id || '');

  const openCreate = (period: AppointmentPeriod) => {
    setForm(formFor(selectedDate, period, defaultEmployeeId));
  };

  const openEdit = (appointment: Appointment) => {
    setForm(formFor(appointment.date, appointment.period, appointment.employee_id, appointment));
  };

  const saveAppointment = async () => {
    if (!form || saving) return;
    const selectedClient = clients.find((client) => client.id === form.clientId);
    const selectedEmployee = employees.find((employee) => employee.id === form.employeeId);
    const employeeId = isAdmin ? form.employeeId : (context?.employee_id || '');
    const employeeName = isAdmin ? selectedEmployee?.name : context?.employee_name;

    if (!selectedClient) return notify('Selecione o cliente.', 'error');
    if (!employeeId || !employeeName) return notify('Selecione o funcionário responsável.', 'error');
    if (!form.date) return notify('Informe a data da visita.', 'error');
    if (!form.activity.trim()) return notify('Informe o objetivo da visita.', 'error');

    const conflicting = appointments.find((appointment) => (
      appointment.id !== form.id
      && appointment.employee_id === employeeId
      && appointment.date === form.date
      && periodsOverlap(appointment.period, form.period)
      && appointment.status !== 'cancelled'
    ));
    if (conflicting) {
      return notify(`${employeeName} já possui ${conflicting.clientName} em um período que se sobrepõe.`, 'error');
    }

    setSaving(true);
    try {
      const previous = form.id ? appointments.find((appointment) => appointment.id === form.id) : undefined;
      const next: Appointment = {
        id: form.id || createId('agenda'),
        farm_id: context?.farm_id,
        employee_id: employeeId,
        employee_name: employeeName,
        device_id: context?.device_id,
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        date: form.date,
        period: form.period,
        status: form.status,
        activity: form.activity.trim(),
        locationNote: form.locationNote.trim() || undefined,
        notes: form.notes.trim() || undefined,
        createdByEmployeeId: previous?.createdByEmployeeId || context?.employee_id,
        createdByEmployeeName: previous?.createdByEmployeeName || context?.employee_name,
        createdAt: previous?.createdAt || new Date().toISOString()
      };
      if (previous) await db.updateAppointment(next);
      else await db.addAppointment(next);
      setSelectedDate(next.date);
      setCursor(new Date(parseDateKey(next.date).getFullYear(), parseDateKey(next.date).getMonth(), 1, 12));
      setForm(null);
      await loadData();
      notify(previous ? 'Agendamento atualizado.' : 'Visita agendada.', 'success');
    } catch (error) {
      console.error('Erro ao salvar agendamento:', error);
      notify('Não foi possível salvar o agendamento.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (appointment: Appointment, status: AppointmentStatus) => {
    try {
      await db.updateAppointment({ ...appointment, status });
      await loadData();
      notify(status === 'completed' ? 'Visita marcada como atendida.' : 'Situação da visita atualizada.', 'success');
    } catch (error) {
      console.error('Erro ao alterar situação da agenda:', error);
      notify('Não foi possível atualizar a visita.', 'error');
    }
  };

  const deleteAppointment = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await db.deleteAppointment(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
      notify(navigator.onLine ? 'Agendamento excluído.' : 'Exclusão salva e aguardando internet.', 'success');
    } catch (error) {
      console.error('Erro ao excluir agendamento:', error);
      notify('Não foi possível excluir o agendamento.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout className="bg-[#eef3ed]">
      <Header title="Agenda de visitas" targetRoute="/" />

      <main className="flex-1 overflow-y-auto pb-28 no-scrollbar">
        <section className="bg-[#173f32] px-4 pb-5 pt-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#c9b77d]">Planejamento de campo</p>
              <h2 className="campo-display mt-1 text-2xl">Quem estará onde</h2>
            </div>
            <button type="button" onClick={() => void refresh()} disabled={refreshing} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-[#dce8d2] disabled:opacity-50" aria-label="Atualizar agenda">
              <RefreshCw size={19} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>

          {isAdmin ? (
            <div className="mt-4 rounded-2xl bg-white p-1 text-[#173f32]">
              <SearchableSelect value={viewEmployeeId} options={viewOptions} onChange={setViewEmployeeId} placeholder="Escolha a agenda" searchPlaceholder="Buscar funcionário" />
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#c9b77d] text-[#173f32]"><UserRound size={19} /></span>
              <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/50">Minha agenda</p><p className="truncate text-sm font-black">{context?.employee_name}</p></div>
            </div>
          )}
        </section>

        <div className="space-y-4 px-3.5 py-4">
          <section className="overflow-hidden rounded-[24px] border border-[#d3ddd1] bg-white shadow-sm">
            <div className="flex items-center justify-between p-3">
              <button type="button" onClick={() => moveMonth(-1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf2e8] text-[#173f32]" aria-label="Mês anterior"><ChevronLeft size={22} /></button>
              <button type="button" onClick={goToday} className="px-2 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#78847d]">Toque para voltar a hoje</p>
                <h2 className="mt-1 text-sm font-black uppercase tracking-[0.08em] text-[#173f32]">{MONTH_FORMATTER.format(cursor)}</h2>
              </button>
              <button type="button" onClick={() => moveMonth(1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf2e8] text-[#173f32]" aria-label="Próximo mês"><ChevronRight size={22} /></button>
            </div>

            <div className="grid grid-cols-3 border-t border-[#e0e6dd] bg-[#fbfcf9]">
              <div className="border-r border-[#e0e6dd] px-2 py-3 text-center"><p className="text-xl font-black text-[#315f45]">{monthStats.completed}</p><p className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-[#6e7973]">Atendidos</p></div>
              <div className="border-r border-[#e0e6dd] px-2 py-3 text-center"><p className="text-xl font-black text-[#b47705]">{monthStats.scheduled}</p><p className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-[#6e7973]">A fazer</p></div>
              <div className="px-2 py-3 text-center"><p className="text-xl font-black text-[#173f32]">{monthStats.clients}</p><p className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-[#6e7973]">Clientes</p></div>
            </div>
          </section>

          <section className="rounded-[24px] border border-[#d3ddd1] bg-white p-3 shadow-sm" aria-label="Calendário mensal">
            <div className="mb-2 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((weekday) => <div key={weekday} className="py-1 text-center text-[9px] font-black tracking-wide text-[#77827c]">{weekday}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((day, index) => {
                if (!day) return <div key={`blank-${index}`} className="h-[49px]" />;
                const key = dateKey(day);
                const dayAppointments = appointmentsByDate.get(key) || [];
                const activeAppointments = dayAppointments.filter((appointment) => appointment.status !== 'cancelled');
                const morning = activeAppointments.filter((appointment) => appointment.period === 'morning' || appointment.period === 'full_day');
                const afternoon = activeAppointments.filter((appointment) => appointment.period === 'afternoon' || appointment.period === 'full_day');
                const isSelected = key === selectedDate;
                const isToday = key === todayKey;
                const hasCompleted = activeAppointments.some((appointment) => appointment.status === 'completed');
                const hasScheduled = activeAppointments.some((appointment) => appointment.status === 'scheduled');
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(key)}
                    className={`relative flex h-[49px] flex-col items-center justify-center rounded-xl border transition active:scale-95 ${isSelected ? 'border-[#173f32] bg-[#173f32] text-white shadow-md' : isToday ? 'border-[#8aa17f] bg-[#edf3e8] text-[#173f32]' : 'border-transparent bg-[#f5f7f2] text-[#243a31]'}`}
                    aria-label={`${day.getDate()} de ${MONTH_FORMATTER.format(cursor)}, ${activeAppointments.length} agendamento(s)`}
                  >
                    <span className="text-xs font-black">{day.getDate()}</span>
                    <span className="mt-1 grid h-1.5 w-7 grid-cols-2 gap-0.5">
                      <span className={`rounded-full ${morning.length ? (hasCompleted && !hasScheduled ? 'bg-[#62a36d]' : 'bg-[#e9a912]') : (isSelected ? 'bg-white/15' : 'bg-[#dde3dc]')}`} />
                      <span className={`rounded-full ${afternoon.length ? (hasCompleted && !hasScheduled ? 'bg-[#62a36d]' : 'bg-[#e9a912]') : (isSelected ? 'bg-white/15' : 'bg-[#dde3dc]')}`} />
                    </span>
                    {activeAppointments.length > 1 && <span className={`absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-black ${isSelected ? 'bg-white text-[#173f32]' : 'bg-[#315f45] text-white'}`}>{activeAppointments.length}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-center gap-4 border-t border-[#e6ebe3] pt-3 text-[9px] font-black uppercase tracking-wide text-[#69766f]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#62a36d]" /> Atendido</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#e9a912]" /> A fazer</span>
              <span className="flex items-center gap-1.5"><span className="grid grid-cols-2 gap-px"><i className="h-1.5 w-2 rounded-sm bg-[#9dad9f]" /><i className="h-1.5 w-2 rounded-sm bg-[#9dad9f]" /></span> Manhã · tarde</span>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-3 px-1">
              <div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#718078]">Agenda do dia</p><h2 className="campo-display mt-1 text-xl text-[#173f32]">{capitalize(DAY_FORMATTER.format(parseDateKey(selectedDate)))}</h2></div>
              <span className="rounded-full border border-[#d3ddd1] bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-[#607067]">{selectedAppointments.filter((item) => item.status !== 'cancelled').length} visita(s)</span>
            </div>

            <div className="space-y-3">
              {PERIOD_ORDER.map((period) => {
                const periodAppointments = selectedAppointments.filter((appointment) => appointment.period === period);
                const PeriodIcon = period === 'full_day' ? CalendarRange : period === 'morning' ? Sunrise : Sun;
                const periodTone = period === 'full_day'
                  ? 'bg-[#dfead9] text-[#315f45]'
                  : period === 'morning'
                    ? 'bg-[#f6e8bd] text-[#9a6800]'
                    : 'bg-[#f1d8c8] text-[#8b3e2f]';
                return (
                  <article key={period} className="overflow-hidden rounded-[22px] border border-[#d3ddd1] bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#e1e7df] bg-[#f8faf6] px-4 py-3">
                      <div className="flex items-center gap-2.5"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${periodTone}`}><PeriodIcon size={18} /></span><div><h3 className="text-sm font-black text-[#173f32]">{periodLabel[period]}</h3><p className="text-[9px] font-bold uppercase tracking-wide text-[#7b8680]">{period === 'full_day' ? 'Reserva manhã e tarde' : 'Período de meio dia'}</p></div></div>
                      <button type="button" onClick={() => openCreate(period)} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-[#173f32] px-3 text-[10px] font-black uppercase tracking-wide text-white"><Plus size={15} /> Marcar</button>
                    </div>

                    <div className="p-3">
                      {periodAppointments.length === 0 ? (
                        <button type="button" onClick={() => openCreate(period)} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#cbd6c8] bg-[#fbfcf9] text-xs font-bold text-[#748079]"><CalendarDays size={17} /> Período livre</button>
                      ) : (
                        <div className="space-y-2.5">
                          {periodAppointments.map((appointment) => (
                            <div key={appointment.id} className={`rounded-2xl border p-3.5 ${appointment.status === 'cancelled' ? 'border-[#ddd7cd] bg-[#f3f0eb] opacity-75' : 'border-[#d8e1d5] bg-white shadow-[0_6px_18px_rgba(31,63,50,0.06)]'}`}>
                              <div className="flex items-start gap-3">
                                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${appointment.status === 'completed' ? 'bg-[#dcebd5] text-[#315f45]' : appointment.status === 'cancelled' ? 'bg-[#e4e0d9] text-[#746d64]' : 'bg-[#f7edcf] text-[#8a6506]'}`}>
                                  {appointment.status === 'completed' ? <Check size={18} strokeWidth={3} /> : appointment.status === 'cancelled' ? <XCircle size={18} /> : <Clock3 size={18} />}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="min-w-0 flex-1 text-sm font-black leading-5 text-[#173f32]">{appointment.clientName}</h4><span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wide ${statusClass[appointment.status]}`}>{statusLabel[appointment.status]}</span></div>
                                  <p className="mt-1.5 text-xs font-bold text-[#53675d]">{appointment.activity}</p>
                                  {(isAdmin || viewEmployeeId === 'all') && <p className="mt-2 flex items-center gap-1.5 truncate text-[10px] font-bold text-[#718078]"><UserRound size={13} /> {appointment.employee_name}</p>}
                                  {appointment.locationNote && <p className="mt-1 flex items-start gap-1.5 text-[10px] font-semibold leading-4 text-[#718078]"><MapPin size={13} className="mt-0.5 shrink-0" /> {appointment.locationNote}</p>}
                                  {appointment.notes && <p className="mt-2 rounded-lg bg-[#f3f5f0] px-2.5 py-2 text-[10px] font-semibold leading-4 text-[#607067]">{appointment.notes}</p>}
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-1.5 border-t border-[#e5eae2] pt-3">
                                <button type="button" onClick={() => void changeStatus(appointment, appointment.status === 'completed' ? 'scheduled' : 'completed')} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#edf3e8] px-2 text-[9px] font-black uppercase tracking-wide text-[#315f45]">
                                  {appointment.status === 'completed' ? <RefreshCw size={14} /> : <CheckCircle2 size={14} />} {appointment.status === 'completed' ? 'Reabrir' : 'Atendido'}
                                </button>
                                <button type="button" onClick={() => openEdit(appointment)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d8e1d5] bg-white text-[#315f45]" aria-label={`Editar visita de ${appointment.clientName}`}><Pencil size={16} /></button>
                                <button type="button" onClick={() => setDeleteTarget(appointment)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#ead2cb] bg-[#fbefec] text-[#9b4939]" aria-label={`Excluir visita de ${appointment.clientName}`}><Trash2 size={16} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      <div className="absolute bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3.5 right-3.5 z-30">
        <button type="button" onClick={() => openCreate('morning')} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#173f32] px-5 text-sm font-black uppercase tracking-[0.08em] text-white shadow-[0_12px_28px_rgba(23,63,50,0.3)]"><Plus size={20} /> Marcar nova visita</button>
      </div>

      {loading && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-[#eef3ed]/85 backdrop-blur-sm"><div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 font-bold text-[#173f32] shadow-xl"><Loader2 className="animate-spin" size={21} /> Carregando agenda</div></div>
      )}

      {form && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#10231d]/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={() => !saving && setForm(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="appointment-form-title" className="flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-[#f8f4eb] shadow-2xl sm:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#ded7ca] bg-[#173f32] px-5 py-4 text-white">
              <div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#c9b77d]">{form.id ? 'Alterar compromisso' : 'Novo compromisso'}</p><h2 id="appointment-form-title" className="campo-display mt-1 text-2xl">{form.id ? 'Editar visita' : 'Marcar visita'}</h2></div>
              <button type="button" onClick={() => setForm(null)} disabled={saving} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 disabled:opacity-50" aria-label="Fechar"><X size={21} /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 pb-8">
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#617068]">Cliente</label>
                <SearchableSelect value={form.clientId} options={clientOptions} onChange={(clientId) => { const client = clients.find((item) => item.id === clientId); setForm((current) => current ? { ...current, clientId, clientName: client?.name || '' } : current); }} placeholder="Selecione o cliente" searchPlaceholder="Digite o nome do cliente" emptyMessage="Cliente não encontrado." />
              </div>

              {isAdmin ? (
                <div><label className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#617068]">Funcionário responsável</label><SearchableSelect value={form.employeeId} options={employeeOptions} onChange={(employeeId) => setForm((current) => current ? { ...current, employeeId } : current)} placeholder="Selecione o funcionário" searchPlaceholder="Buscar funcionário" /></div>
              ) : (
                <div className="rounded-2xl border border-[#d5dfd2] bg-[#edf3e8] p-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#718078]">Responsável</p><p className="mt-1 text-sm font-black text-[#173f32]">{context?.employee_name}</p></div>
              )}

              <div className="space-y-3">
                <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#617068]">Data</span><input type="date" value={form.date} onChange={(event) => setForm((current) => current ? { ...current, date: event.target.value } : current)} className="min-h-[54px] w-full rounded-xl border-2 border-[#d8d0c2] bg-white px-3 text-sm font-black text-[#173f32] outline-none focus:border-[#3f7457]" /></label>
                <div><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#617068]">Período</span><div className="grid grid-cols-3 gap-1 rounded-xl border-2 border-[#d8d0c2] bg-white p-1">{(['morning', 'afternoon', 'full_day'] as AppointmentPeriod[]).map((period) => <button key={period} type="button" onClick={() => setForm((current) => current ? { ...current, period } : current)} className={`min-h-11 rounded-lg px-1 text-[9px] font-black uppercase leading-tight ${form.period === period ? 'bg-[#173f32] text-white' : 'text-[#617068]'}`}>{periodLabel[period]}</button>)}</div></div>
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#617068]">Objetivo da visita</label>
                <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">{['Visita técnica', 'Reunião', 'Retorno'].map((activity) => <button key={activity} type="button" onClick={() => setForm((current) => current ? { ...current, activity } : current)} className={`shrink-0 rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-wide ${form.activity === activity ? 'border-[#173f32] bg-[#173f32] text-white' : 'border-[#d8d0c2] bg-white text-[#617068]'}`}>{activity}</button>)}</div>
                <input value={form.activity} onChange={(event) => setForm((current) => current ? { ...current, activity: event.target.value } : current)} placeholder="Ex.: acompanhamento do projeto" className="min-h-[52px] w-full rounded-xl border-2 border-[#d8d0c2] bg-white px-4 text-sm font-bold text-[#173f32] outline-none placeholder:text-[#939b96] focus:border-[#3f7457]" />
              </div>

              <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#617068]">Local ou referência <small className="normal-case tracking-normal text-[#929b95]">(opcional)</small></span><div className="relative"><MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#718078]" size={18} /><input value={form.locationNote} onChange={(event) => setForm((current) => current ? { ...current, locationNote: event.target.value } : current)} placeholder="Fazenda, unidade ou endereço" className="min-h-[52px] w-full rounded-xl border-2 border-[#d8d0c2] bg-white py-3 pl-10 pr-4 text-sm font-bold text-[#173f32] outline-none placeholder:text-[#939b96] focus:border-[#3f7457]" /></div></label>

              <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#617068]">Observações <small className="normal-case tracking-normal text-[#929b95]">(opcional)</small></span><textarea value={form.notes} onChange={(event) => setForm((current) => current ? { ...current, notes: event.target.value } : current)} rows={3} placeholder="O que precisa ser levado ou lembrado?" className="w-full resize-none rounded-xl border-2 border-[#d8d0c2] bg-white p-4 text-sm font-semibold leading-5 text-[#173f32] outline-none placeholder:text-[#939b96] focus:border-[#3f7457]" /></label>

              {form.id && (
                <div><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#617068]">Situação</span><div className="grid grid-cols-3 gap-1.5">{(['scheduled', 'completed', 'cancelled'] as AppointmentStatus[]).map((status) => <button key={status} type="button" onClick={() => setForm((current) => current ? { ...current, status } : current)} className={`min-h-11 rounded-xl border text-[9px] font-black uppercase tracking-wide ${form.status === status ? statusClass[status] : 'border-[#d8d0c2] bg-white text-[#718078]'}`}>{statusLabel[status]}</button>)}</div></div>
              )}
            </div>

            <div className="border-t border-[#ded7ca] bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"><button type="button" onClick={() => void saveAppointment()} disabled={saving} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#173f32] px-5 text-sm font-black uppercase tracking-[0.08em] text-white shadow-sm disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={19} /> : <CalendarDays size={19} />} {form.id ? 'Salvar alterações' : 'Confirmar visita'}</button></div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-[#10231d]/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="delete-appointment-title" className="w-full max-w-md rounded-t-[28px] bg-[#fbf8f1] p-5 shadow-2xl sm:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fbebe5] text-[#9b4939]"><Trash2 size={22} /></span><div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#9b4939]">Confirmar exclusão</p><h2 id="delete-appointment-title" className="campo-display mt-1 text-2xl text-[#173f32]">Excluir esta visita?</h2></div></div>
            <div className="mt-5 rounded-2xl border border-[#ded7ca] bg-white p-4"><p className="font-black text-[#173f32]">{deleteTarget.clientName}</p><p className="mt-1 text-xs font-semibold text-[#68736d]">{capitalize(DAY_FORMATTER.format(parseDateKey(deleteTarget.date)))} · {periodLabel[deleteTarget.period]}</p><p className="mt-1 truncate text-xs font-semibold text-[#68736d]">{deleteTarget.employee_name}</p></div>
            <p className="mt-4 text-sm font-semibold leading-6 text-[#68736d]">A exclusão também será sincronizada com os outros aparelhos. Se estiver offline, ficará pendente até a conexão voltar.</p>
            <div className="mt-6 grid grid-cols-2 gap-2"><button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="min-h-12 rounded-xl border-2 border-[#d9d1c4] bg-white text-xs font-black uppercase text-[#52655b] disabled:opacity-50">Cancelar</button><button type="button" onClick={() => void deleteAppointment()} disabled={deleting} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#9b4939] text-xs font-black uppercase text-white disabled:opacity-50">{deleting ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />} Excluir</button></div>
          </section>
        </div>
      )}
    </Layout>
  );
};

export default AgendaScreen;
