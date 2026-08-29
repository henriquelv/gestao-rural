import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Repeat2, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { PinRequestModal } from '../components/PinRequestModal';
import { db } from '../services/db.service';
import { activationService } from '../services/activation.service';
import { authService } from '../services/auth.service';
import { farmContextService } from '../services/farm-context.service';
import { notify } from '../services/notification.service';
import { Employee } from '../types';
import { getUserFacingError } from '../utils/user-error';
import { formatEmployeeSelectionLabel } from '../utils/employee-selection';

export const SwitchEmployeeScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = farmContextService.getContext();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState(context?.employee_id || '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadEmployees = async () => {
      if (navigator.onLine) await db.forceRefreshTable('employees');
      return db.getEmployees();
    };

    loadEmployees()
      .then((items) => {
        if (!mounted) return;
        const available = items.filter((employee) => {
          const sameFarm = String(employee.farm_id || '') === String(context?.farm_id || '');
          const isCurrentLegacyEmployee = !employee.farm_id
            && String(employee.id) === String(context?.employee_id);
          return (sameFarm || isCurrentLegacyEmployee) && (!employee.status || employee.status === 'active');
        });
        setEmployees(available);
        setSelectedId((current) => available.some((employee) => String(employee.id) === String(current))
          ? current
          : (available[0]?.id || ''));
        if (!navigator.onLine && !available.some((employee) => String(employee.id) !== String(context?.employee_id))) {
          setErrorMessage('Conecte-se à internet para carregar outros funcionários desta fazenda.');
        }
      })
      .catch(() => setErrorMessage('Não foi possível carregar os funcionários desta fazenda.'))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [context?.farm_id]);

  const selected = useMemo(
    () => employees.find((employee) => String(employee.id) === String(selectedId)),
    [employees, selectedId]
  );

  const requestSwitch = () => {
    setErrorMessage('');
    if (!selected) {
      setErrorMessage('Selecione um funcionário ativo.');
      return;
    }
    if (String(selected.id) === String(context?.employee_id)) {
      setErrorMessage('Este funcionário já está selecionado neste aparelho.');
      return;
    }
    setShowPin(true);
  };

  const confirmSwitch = async () => {
    if (!selected || busy) return;
    setShowPin(false);
    setBusy(true);
    setErrorMessage('');
    try {
      await activationService.switchEmployee(selected);
      authService.logout();
      notify(`Funcionário alterado para ${selected.name}.`, 'success');
      navigate('/', { replace: true });
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error: any) {
      const message = getUserFacingError(error, 'Não foi possível trocar o funcionário.');
      setErrorMessage(message);
      notify(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <Header title="Trocar funcionário" targetRoute="/" />
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        <div className="mx-auto max-w-sm space-y-4">
          <section className="border-b border-gray-200 bg-white px-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
                <UserRound size={24} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-gray-500">Funcionário atual</p>
                <p className="truncate text-lg font-black text-gray-900">{context?.employee_name || 'Não identificado'}</p>
                <p className="truncate text-xs font-semibold text-gray-500">{context?.farm_name}</p>
              </div>
            </div>
          </section>

          {errorMessage && (
            <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
              <AlertCircle size={21} className="shrink-0" />
              <p className="text-sm font-bold">{errorMessage}</p>
            </div>
          )}

          <section className="space-y-3 bg-white px-4 py-5">
            <div>
              <label htmlFor="switch-employee" className="mb-2 block text-xs font-black uppercase text-gray-600">
                Selecionar funcionário correto
              </label>
              <select
                id="switch-employee"
                value={selectedId}
                onChange={(event) => { setSelectedId(event.target.value); setErrorMessage(''); }}
                disabled={loading || busy}
                className="min-h-14 w-full rounded-lg border-2 border-gray-200 bg-gray-50 px-4 text-base font-bold text-gray-900 outline-none focus:border-green-600"
              >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {formatEmployeeSelectionLabel(employee, employees)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-blue-800">
              <ShieldCheck size={18} className="mt-0.5 shrink-0" />
              <p className="text-xs font-semibold">A troca exige o PIN do gestor e não apaga registros, imagens ou pendências deste aparelho.</p>
            </div>

            <button
              type="button"
              onClick={requestSwitch}
              disabled={loading || busy || employees.length === 0}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-green-700 px-4 text-sm font-black uppercase text-white disabled:opacity-50"
            >
              {loading || busy ? <Loader2 size={20} className="animate-spin" /> : <Repeat2 size={20} />}
              Confirmar troca
            </button>

            {selected && String(selected.id) !== String(context?.employee_id) && (
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-green-700">
                <CheckCircle2 size={16} /> Novo funcionário: {selected.name}
              </div>
            )}
          </section>
        </div>
      </div>

      {showPin && (
        <PinRequestModal
          title="Autorizar troca de funcionário"
          description={`Digite o PIN do gestor para usar o app como ${selected?.name || 'outro funcionário'}.`}
          onSuccess={() => { void confirmSwitch(); }}
          onClose={() => setShowPin(false)}
        />
      )}
    </Layout>
  );
};
