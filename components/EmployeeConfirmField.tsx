import React, { useMemo, useState } from 'react';
import { Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { PinRequestModal } from './PinRequestModal';

interface EmployeeOption {
  id: string;
  name: string;
}

interface EmployeeConfirmFieldProps {
  label?: string;
  value: string;
  employees: EmployeeOption[];
  onChange: (name: string) => void;
  helpText?: string;
}

export const EmployeeConfirmField: React.FC<EmployeeConfirmFieldProps> = ({
  label = 'Funcionário',
  value,
  employees,
  onChange,
  helpText = 'Confira se o nome está correto antes de salvar.'
}) => {
  const [editing, setEditing] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const selected = useMemo(
    () => employees.find((employee) => employee.name === value),
    [employees, value]
  );

  const hasValue = Boolean(value);
  const canShowLocked = hasValue && !editing;

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-black uppercase text-gray-500">{label}</p>
          <p className="text-xs text-gray-400 font-semibold mt-0.5">{helpText}</p>
        </div>
        {canShowLocked && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[10px] font-black uppercase text-green-700 border border-green-100">
            <ShieldCheck size={13} />
            Fixo
          </span>
        )}
      </div>

      {canShowLocked ? (
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center text-green-700 shrink-0">
            <UserCheck size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-black text-gray-900 truncate">{value}</p>
            <p className="text-xs font-semibold text-gray-400 truncate">
              {selected?.id ? `ID ${selected.id}` : 'Selecionado na ativação'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPin(true)}
            className="min-h-11 px-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 font-black text-xs uppercase inline-flex items-center gap-1 active:scale-95"
          >
            <Lock size={14} />
            Corrigir
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full p-4 text-base bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Selecione...</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.name}>{employee.name}</option>
            ))}
          </select>
          {hasValue && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="w-full min-h-11 rounded-lg bg-gray-100 text-gray-700 text-xs font-black uppercase"
            >
              Confirmar nome
            </button>
          )}
        </div>
      )}

      {showPin && (
        <PinRequestModal
          title="Corrigir funcionário?"
          description="Digite o PIN para trocar o responsável deste registro."
          onSuccess={() => {
            setShowPin(false);
            setEditing(true);
          }}
          onClose={() => setShowPin(false)}
        />
      )}
    </div>
  );
};
