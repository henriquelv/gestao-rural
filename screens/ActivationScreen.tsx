import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { Employee, Farm } from '../types';
import { activationService } from '../services/activation.service';
import { notify } from '../services/notification.service';
import { authService } from '../services/auth.service';
import { SearchableSelect } from '../components/SearchableSelect';
import { permissionsService } from '../services/permissions.service';

interface Props {
  onActivated: () => void;
}

export const ActivationScreen: React.FC<Props> = ({ onActivated }) => {
  const [code, setCode] = useState('');
  const [farm, setFarm] = useState<Farm | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [accessPin, setAccessPin] = useState('');
  const [loading, setLoading] = useState(false);

  const validateCode = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await activationService.validateActivationCode(code);
      if (result.isOwner) {
        setIsOwner(true);
        notify('Código de dono reconhecido.', 'success');
      } else {
        setFarm(result.farm);
        setEmployees(result.employees);
        setSelectedEmployeeId('');
        notify('Fazenda validada.', 'success');
      }
    } catch (e: any) {
      notify(e?.message || 'Erro ao validar código.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const activate = async () => {
    if (!farm) return;
    const employee = employees.find((e) => e.id === selectedEmployeeId);
    if (!employee) {
      notify('Selecione um técnico.', 'error');
      return;
    }
    const expectedPin = employee.access_pin || employee.admin_pin || '1234';
    if (accessPin !== expectedPin) {
      notify('Senha do perfil incorreta.', 'error');
      setAccessPin('');
      return;
    }

    setLoading(true);
    try {
      await activationService.activate(farm, employee);
      if (permissionsService.isPrivilegedEmployee(employee) && accessPin) authService.login(accessPin);
      notify('Aplicativo ativado.', 'success');
      onActivated();
    } catch (e: any) {
      notify(e?.message || 'Erro ao ativar dispositivo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId);

  const activateOwner = async () => {
    setLoading(true);
    try {
      await activationService.activateAsOwner();
      notify('Modo dono ativado.', 'success');
      onActivated();
    } catch (e: any) {
      notify(e?.message || 'Erro ao ativar modo dono.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[100dvh] min-h-0 items-stretch justify-center overflow-hidden bg-[#e9e7e1]">
      <div className="flex h-full min-h-0 w-full max-w-md flex-col border-x border-[#d8d0c2] bg-[#f8f4eb] pt-[env(safe-area-inset-top)]">
        <div className="shrink-0 bg-[#173f32] px-6 py-6 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/15">
              <KeyRound size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-wide">Gestão Rural</h1>
              <p className="text-green-100 text-sm font-semibold">Campo Legado Consultoria</p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-6 pb-28">
          <div className="rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <label className="text-xs font-black text-gray-500 uppercase block mb-2">Código da fazenda</label>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
                disabled={loading || !!farm || isOwner}
                className="min-w-0 flex-1 rounded-xl border-2 border-[#d8d0c2] bg-white p-4 font-black uppercase text-[#173f32] outline-none focus:border-[#3f7457] focus-visible:ring-2 focus-visible:ring-[#3f7457]/20"
                placeholder="TESTE"
              />
              <button
                onClick={validateCode}
                disabled={loading || !!farm || isOwner || !code.trim()}
                className="flex w-14 items-center justify-center rounded-xl bg-[#3f7457] text-white disabled:opacity-50"
                title="Validar código"
              >
                {loading && !farm && !isOwner ? <Loader2 className="animate-spin" size={22} /> : <CheckCircle2 size={22} />}
              </button>
            </div>
          </div>

          {isOwner && (
            <div className="space-y-4">
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="text-yellow-700" size={22} />
                  <div>
                    <p className="text-xs font-black uppercase text-yellow-700">Acesso de Dono</p>
                    <p className="font-black text-gray-900">Painel completo de fazendas</p>
                  </div>
                </div>
              </div>
              <button
                onClick={activateOwner}
                disabled={loading}
                className="w-full py-4 rounded-xl bg-yellow-600 text-white font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
                Entrar como Dono
              </button>
            </div>
          )}

          {farm && !isOwner && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#bdd0b3] bg-[#edf4e8] p-4">
                <div className="flex items-center gap-3">
                  <Smartphone className="text-green-700" size={22} />
                  <div>
                    <p className="text-xs font-black uppercase text-green-700">Fazenda</p>
                    <p className="font-black text-gray-900">{farm.name}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase text-[#5f6d66]">Perfil</label>
                <SearchableSelect
                  value={selectedEmployeeId}
                  onChange={(value) => { setSelectedEmployeeId(value); setAccessPin(''); }}
                  options={employees.map((employee) => ({
                    value: employee.id,
                    label: employee.name,
                    description: employee.role || (employee.is_admin ? 'Administrador' : 'Técnico')
                  }))}
                  placeholder="Selecione o perfil"
                  searchPlaceholder="Buscar perfil pelo nome"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase text-[#5f6d66]">Senha do perfil</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  name="campo-legado-access-code"
                  enterKeyHint="done"
                  spellCheck={false}
                  maxLength={4}
                  value={accessPin}
                  onChange={(event) => setAccessPin(event.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border-2 border-[#d8d0c2] bg-white p-4 text-center text-2xl font-black tracking-[0.35em] text-[#173f32] outline-none focus:border-[#3f7457] focus-visible:ring-2 focus-visible:ring-[#3f7457]/20"
                  placeholder="••••"
                  aria-label={`Senha do perfil ${selectedEmployee?.name || ''}`}
                  style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
                />
              </div>
            </div>
          )}
        </div>

        {farm && !isOwner && (
          <div className="shrink-0 border-t border-[#d8d0c2] bg-[#f8f4eb]/95 px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_24px_rgba(23,63,50,0.08)] backdrop-blur">
            <button
              onClick={activate}
              disabled={loading || !selectedEmployeeId || accessPin.length !== 4}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#173f32] py-4 font-black uppercase text-white shadow-lg disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <UserRound size={20} />}
              Concluir ativação
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
