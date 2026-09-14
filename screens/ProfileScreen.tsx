import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  CheckCircle2,
  KeyRound,
  Loader2,
  LockKeyhole,
  MapPinned,
  HandCoins,
  ReceiptText,
  ShieldCheck,
  UserRound,
  WalletCards
} from 'lucide-react';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { db } from '../services/db.service';
import { authService } from '../services/auth.service';
import { farmContextService } from '../services/farm-context.service';
import { localdb } from '../services/localdb';
import { notify } from '../services/notification.service';
import { permissionsService } from '../services/permissions.service';
import { Anomaly, Employee } from '../types';
import { workOrderKm, workOrderReceivable, workOrderTotal } from '../utils/work-orders';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const orderDate = (item: Anomaly) => item.serviceDate || item.createdAt.slice(0, 10);

const pinInputClass = 'w-full rounded-xl border-2 border-[#d8d0c2] bg-[#fcfaf6] p-3.5 text-center text-xl font-black tracking-[0.35em] text-[#173f32] outline-none transition focus:border-[#3f7457] focus:ring-2 focus:ring-[#3f7457]/10';
const maskedPinStyle = { WebkitTextSecurity: 'disc' } as React.CSSProperties;

export const ProfileScreen: React.FC = () => {
  const context = farmContextService.getContext();
  const isAdmin = permissionsService.isAdmin(context);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [orders, setOrders] = useState<Anomaly[]>([]);
  const [pendingSync, setPendingSync] = useState(0);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [employees, allOrders, syncStatus] = await Promise.all([
        db.getEmployees(),
        db.getAnomalies(),
        db.getSyncStatus()
      ]);
      if (!active) return;
      setEmployee(employees.find((item) => String(item.id) === String(context?.employee_id))
        || employees.find((item) => item.name === context?.employee_name)
        || null);
      setOrders(allOrders.filter((item) => item.recordType === 'service_order' || Boolean(item.clientName)));
      setPendingSync(syncStatus.pendingCount + syncStatus.errorCount);
    };
    void load();
    const unsubscribeOrders = localdb.subscribe('anomalies', () => { void load(); });
    const unsubscribeEmployees = localdb.subscribe('employees', () => { void load(); });
    return () => {
      active = false;
      unsubscribeOrders?.();
      unsubscribeEmployees?.();
    };
  }, [context?.employee_id, context?.employee_name]);

  const personalOrders = useMemo(
    () => orders.filter((item) => permissionsService.isWorkOrderCreator(item, context)),
    [context, orders]
  );
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthOrders = useMemo(
    () => personalOrders.filter((item) => orderDate(item).startsWith(currentMonth)),
    [currentMonth, personalOrders]
  );
  const totals = useMemo(() => personalOrders.reduce((result, item) => {
    result[item.serviceOrderType === 'despesa' ? 'expenses' : 'revenue'] += workOrderTotal(item);
    result.receivable += workOrderReceivable(item);
    result.km += workOrderKm(item);
    if (workOrderKm(item) > 0) result.kmOrders += 1;
    return result;
  }, { revenue: 0, expenses: 0, receivable: 0, km: 0, kmOrders: 0 }), [personalOrders]);
  const averageTicket = personalOrders.length
    ? (totals.revenue + totals.expenses) / personalOrders.length
    : 0;
  const averageKm = totals.kmOrders ? totals.km / totals.kmOrders : 0;

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!employee) return notify('Perfil ativo não encontrado.', 'error');
    const expectedPin = employee.access_pin || employee.admin_pin || '';
    if (currentPin !== expectedPin) return notify('A senha atual está incorreta.', 'error');
    if (!/^\d{4}$/.test(newPin)) return notify('A nova senha deve ter quatro números.', 'error');
    if (newPin !== confirmPin) return notify('A confirmação da nova senha não confere.', 'error');

    setSavingPin(true);
    try {
      const updatedEmployee: Employee = {
        ...employee,
        access_pin: newPin,
        ...(permissionsService.isPrivilegedEmployee(employee) ? { admin_pin: newPin } : {}),
        updated_at: new Date().toISOString()
      };
      await db.updateEmployee(updatedEmployee);
      setEmployee(updatedEmployee);
      if (permissionsService.isPrivilegedEmployee(employee)) {
        farmContextService.updateContext({ admin_pin: newPin });
        authService.logout();
        authService.login(newPin);
      }
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      notify('Senha atualizada.', 'success');
    } catch (error) {
      console.error('Erro ao atualizar senha:', error);
      notify('Não foi possível atualizar a senha.', 'error');
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <Layout className="bg-[#f4f0e7]">
      <Header title="Suas informações" targetRoute="/" />

      <main className="flex-1 overflow-y-auto px-4 pb-10 pt-4">
        <section className="overflow-hidden rounded-[24px] bg-[#173f32] text-white shadow-[0_16px_34px_rgba(23,63,50,0.18)]">
          <div className="border-b border-white/10 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#c9b77d] text-[#173f32]">
                {isAdmin ? <ShieldCheck size={23} /> : <UserRound size={23} />}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#caddb3]">Área pessoal e privada</p>
                <h1 className="campo-display mt-1 truncate text-2xl">{context?.employee_name || 'Perfil ativo'}</h1>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] text-white/55">{employee?.role || context?.employee_role || (isAdmin ? 'Gestão' : 'Técnico')}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-5 py-3 text-xs font-semibold text-white/70">
            <LockKeyhole size={15} className="shrink-0" /> Estes valores consideram somente as OS criadas por você.
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3" aria-label="Seus indicadores">
          <div className="rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <CalendarCheck2 size={19} className="text-[#3f7457]" />
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#718078]">Suas OS</p>
            <p className="mt-1 text-3xl font-black text-[#173f32]">{personalOrders.length}</p>
            <p className="mt-1 text-[11px] font-semibold text-[#718078]">{monthOrders.length} neste mês</p>
          </div>
          <div className="rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <ReceiptText size={19} className="text-[#765f25]" />
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#718078]">Ticket médio</p>
            <p className="mt-1 text-xl font-black text-[#173f32]">{money.format(averageTicket)}</p>
            <p className="mt-1 text-[11px] font-semibold text-[#718078]">por OS criada</p>
          </div>
          <div className="rounded-2xl border border-[#bdd0b3] bg-[#edf4e8] p-4">
            <WalletCards size={19} className="text-[#3f7457]" />
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#5f7668]">Suas receitas</p>
            <p className="mt-1 text-xl font-black text-[#173f32]">{money.format(totals.revenue)}</p>
          </div>
          <div className="rounded-2xl border border-[#e4c7bc] bg-[#fbebe5] p-4">
            <WalletCards size={19} className="text-[#9f3f2d]" />
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#8a594e]">Suas despesas</p>
            <p className="mt-1 text-xl font-black text-[#752f22]">{money.format(totals.expenses)}</p>
          </div>
          <div className="rounded-2xl border border-[#ddcfaa] bg-[#f8f0d9] p-4">
            <HandCoins size={19} className="text-[#765f25]" />
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#76672f]">A receber</p>
            <p className="mt-1 text-xl font-black text-[#5f501d]">{money.format(totals.receivable)}</p>
          </div>
          <div className="rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <MapPinned size={19} className="text-[#3f7457]" />
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#718078]">Média de KM</p>
            <p className="mt-1 text-xl font-black text-[#173f32]">{averageKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</p>
            <p className="mt-1 text-[11px] font-semibold text-[#718078]">{totals.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km no total</p>
          </div>
        </section>

        {pendingSync > 0 && (
          <div className="mt-4 rounded-2xl border border-[#ddcfaa] bg-[#f8f0d9] px-4 py-3 text-xs font-bold leading-5 text-[#6f5a22]">
            {pendingSync} alteração{pendingSync === 1 ? '' : 'ões'} aguardando sincronização. Os dados continuam salvos neste aparelho.
          </div>
        )}

        <section className="mt-4 rounded-[24px] border border-[#d8d0c2] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf2e8] text-[#3f7457]"><KeyRound size={21} /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#718078]">Segurança</p>
              <h2 className="campo-display text-xl text-[#173f32]">Alterar sua senha</h2>
            </div>
          </div>

          <form onSubmit={updatePassword} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#64736b]">Senha atual</span>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, ''))} className={pinInputClass} style={maskedPinStyle} aria-label="Senha atual" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#64736b]">Nova senha</span>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ''))} className={pinInputClass} style={maskedPinStyle} aria-label="Nova senha" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#64736b]">Confirmar</span>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="done" maxLength={4} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ''))} className={pinInputClass} style={maskedPinStyle} aria-label="Confirmar nova senha" />
              </label>
            </div>
            <button type="submit" disabled={savingPin || currentPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173f32] px-4 text-xs font-black uppercase tracking-[0.08em] text-white shadow-sm transition active:scale-[0.99] disabled:opacity-45">
              {savingPin ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
              {savingPin ? 'Salvando…' : 'Atualizar senha'}
            </button>
          </form>
        </section>
      </main>
    </Layout>
  );
};
