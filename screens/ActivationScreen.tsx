import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { Employee, Farm } from '../types';
import { activationService } from '../services/activation.service';
import { notify } from '../services/notification.service';

interface Props {
  onActivated: () => void;
}

export const ActivationScreen: React.FC<Props> = ({ onActivated }) => {
  const [code, setCode] = useState('');
  const [farm, setFarm] = useState<Farm | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(false);

  const validateCode = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await activationService.validateActivationCode(code);
      if (result.isOwner) {
        setIsOwner(true);
        notify('Codigo de dono reconhecido.', 'success');
      } else {
        setFarm(result.farm);
        setEmployees(result.employees);
        setSelectedEmployeeId(result.employees[0]?.id || '');
        notify('Fazenda validada.', 'success');
      }
    } catch (e: any) {
      notify(e?.message || 'Erro ao validar codigo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const activate = async () => {
    if (!farm) return;
    const employee = employees.find((e) => e.id === selectedEmployeeId);
    if (!employee) {
      notify('Selecione um funcionario.', 'error');
      return;
    }

    setLoading(true);
    try {
      await activationService.activate(farm, employee);
      notify('Aplicativo ativado.', 'success');
      onActivated();
    } catch (e: any) {
      notify(e?.message || 'Erro ao ativar dispositivo.', 'error');
    } finally {
      setLoading(false);
    }
  };

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
    <div className="min-h-screen bg-gray-100 flex items-stretch justify-center">
      <div className="w-full max-w-md bg-white border-x border-gray-200 flex flex-col">
        <div className="bg-green-800 text-white px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/15">
              <KeyRound size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-wide">Ativar Fazenda</h1>
              <p className="text-green-100 text-sm font-semibold">Gestao Rural</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <label className="text-xs font-black text-gray-500 uppercase block mb-2">Codigo da fazenda</label>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
                disabled={loading || !!farm || isOwner}
                className="flex-1 min-w-0 p-4 rounded-xl border-2 border-gray-200 bg-white font-black text-gray-800 outline-none focus:border-green-600 uppercase"
                placeholder="STARMILK"
                autoFocus
              />
              <button
                onClick={validateCode}
                disabled={loading || !!farm || isOwner || !code.trim()}
                className="w-14 rounded-xl bg-green-700 text-white flex items-center justify-center disabled:opacity-50"
                title="Validar codigo"
              >
                {loading && !farm && !isOwner ? <Loader2 className="animate-spin" size={22} /> : <CheckCircle2 size={22} />}
              </button>
            </div>
          </div>

          {/* Fluxo do Dono */}
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

          {/* Fluxo normal de fazenda */}
          {farm && !isOwner && (
            <div className="space-y-4">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-3">
                  <Smartphone className="text-green-700" size={22} />
                  <div>
                    <p className="text-xs font-black uppercase text-green-700">Fazenda</p>
                    <p className="font-black text-gray-900">{farm.name}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-gray-500 uppercase block mb-2">Funcionario</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full p-4 rounded-xl border-2 border-gray-200 bg-white font-bold text-gray-800 outline-none focus:border-green-600"
                >
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={activate}
                disabled={loading || !selectedEmployeeId}
                className="w-full py-4 rounded-xl bg-green-700 text-white font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <UserRound size={20} />}
                Concluir ativacao
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
