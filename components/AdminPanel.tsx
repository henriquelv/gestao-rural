import React, { useEffect, useState } from 'react';
import { Ban, CheckCircle, Edit2, KeyRound, Loader2, Plus, Save, Smartphone, UserRound, X } from 'lucide-react';
import { DeviceRegistration, Employee, Farm, License } from '../types';
import { adminService } from '../services/admin.service';
import { notify } from '../services/notification.service';

const emptyFarm = (): Partial<Farm> => ({
  name: '',
  status: 'active',
  activation_code: '',
  max_devices: 10,
  grace_period_days: 7,
  expires_at: ''
});

export const AdminPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [farmForm, setFarmForm] = useState<Partial<Farm>>(emptyFarm());
  const [licenses, setLicenses] = useState<License[]>([]);
  const [devices, setDevices] = useState<DeviceRegistration[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeForm, setEmployeeForm] = useState<Partial<Employee>>({ name: '', role: 'Colaborador', status: 'active' });
  const [employeeBusyId, setEmployeeBusyId] = useState('');

  const selectedFarm = farms.find((f) => f.id === selectedFarmId) || null;

  const loadFarms = async () => {
    setLoading(true);
    try {
      const next = await adminService.listFarms();
      setFarms(next);
      const selected = selectedFarmId || next[0]?.id || '';
      setSelectedFarmId(selected);
      if (selected) setFarmForm(next.find((f) => f.id === selected) || emptyFarm());
    } catch (e: any) {
      notify(e?.message || 'Erro ao carregar fazendas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadFarmDetails = async (farmId: string) => {
    if (!farmId) return;
    try {
      const [nextLicenses, nextDevices, nextEmployees] = await Promise.all([
        adminService.listLicenses(farmId),
        adminService.listDevices(farmId),
        adminService.listEmployees(farmId)
      ]);
      setLicenses(nextLicenses);
      setDevices(nextDevices);
      setEmployees(nextEmployees);
      const farm = farms.find((f) => f.id === farmId);
      if (farm) setFarmForm(farm);
    } catch (e: any) {
      notify(e?.message || 'Erro ao carregar dados administrativos.', 'error');
    }
  };

  useEffect(() => {
    loadFarms();
  }, []);

  useEffect(() => {
    if (selectedFarmId) loadFarmDetails(selectedFarmId);
  }, [selectedFarmId]);

  const saveFarm = async () => {
    if (!farmForm.name?.trim()) {
      notify('Informe o nome da fazenda.', 'error');
      return;
    }
    setLoading(true);
    try {
      const saved = await adminService.saveFarm(farmForm);
      notify('Fazenda salva.', 'success');
      setSelectedFarmId(saved.id);
      await loadFarms();
    } catch (e: any) {
      notify(e?.message || 'Erro ao salvar fazenda.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const savePrimaryLicense = async (patch: Partial<License>) => {
    if (!selectedFarmId) return;
    try {
      const current = licenses[0];
      await adminService.saveLicense({
        id: current?.id,
        farm_id: selectedFarmId,
        status: patch.status || current?.status || 'active',
        expires_at: patch.expires_at ?? current?.expires_at ?? null,
        notes: patch.notes ?? current?.notes ?? ''
      });
      notify('Licenca salva.', 'success');
      await loadFarmDetails(selectedFarmId);
    } catch (e: any) {
      notify(e?.message || 'Erro ao salvar licenca.', 'error');
    }
  };

  const clearEmployeeForm = () => {
    setEmployeeForm({ name: '', role: 'Colaborador', status: 'active' });
  };

  const saveEmployee = async () => {
    if (!selectedFarmId) return;
    if (!employeeForm.name?.trim()) {
      notify('Informe o nome do funcionário.', 'error');
      return;
    }

    setEmployeeBusyId('save');
    try {
      await adminService.saveEmployee(selectedFarmId, employeeForm);
      notify('Funcionário salvo na fazenda.', 'success');
      clearEmployeeForm();
      await loadFarmDetails(selectedFarmId);
    } catch (e: any) {
      notify(e?.message || 'Erro ao salvar funcionário.', 'error');
    } finally {
      setEmployeeBusyId('');
    }
  };

  const editEmployee = (employee: Employee) => {
    setEmployeeForm({
      id: employee.id,
      farm_id: employee.farm_id,
      name: employee.name,
      role: employee.role || 'Colaborador',
      status: employee.status || 'active',
      created_at: employee.created_at,
      is_admin: employee.is_admin,
      admin_pin: employee.admin_pin
    });
  };

  const toggleEmployee = async (employee: Employee) => {
    if (!selectedFarmId || !employee.id) return;
    const nextStatus = employee.status === 'active' ? 'blocked' : 'active';
    setEmployeeBusyId(employee.id);
    try {
      await adminService.setEmployeeStatus(selectedFarmId, employee.id, nextStatus);
      notify(`Funcionário ${nextStatus === 'active' ? 'ativado' : 'bloqueado'}.`, 'success');
      await loadFarmDetails(selectedFarmId);
    } catch (e: any) {
      notify(e?.message || 'Erro ao alterar funcionário.', 'error');
    } finally {
      setEmployeeBusyId('');
    }
  };

  const toggleDevice = async (device: DeviceRegistration) => {
    if (!device.id) return;
    try {
      await adminService.setDeviceStatus(device.id, device.status === 'active' ? 'blocked' : 'active');
      notify('Dispositivo atualizado.', 'success');
      await loadFarmDetails(selectedFarmId);
    } catch (e: any) {
      notify(e?.message || 'Erro ao atualizar dispositivo.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-black text-gray-800 uppercase flex items-center gap-2">
            <KeyRound size={18} className="text-green-700" /> Fazendas
          </h2>
          <button onClick={() => { setSelectedFarmId(''); setFarmForm(emptyFarm()); setLicenses([]); setDevices([]); setEmployees([]); clearEmployeeForm(); }} className="px-3 py-2 rounded-lg bg-green-100 text-green-700 font-black text-xs uppercase flex items-center gap-1">
            <Plus size={14} /> Nova
          </button>
        </div>

        {farms.length > 0 && (
          <select value={selectedFarmId} onChange={(e) => setSelectedFarmId(e.target.value)} className="w-full p-3 rounded-lg border-2 border-gray-200 font-bold mb-4">
            {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
        )}

        <div className="grid gap-3">
          <input value={farmForm.name || ''} onChange={(e) => setFarmForm({ ...farmForm, name: e.target.value })} className="p-3 rounded-lg border-2 border-gray-200 font-bold" placeholder="Nome da fazenda" />
          <input value={farmForm.activation_code || ''} onChange={(e) => setFarmForm({ ...farmForm, activation_code: e.target.value.toUpperCase() })} className="p-3 rounded-lg border-2 border-gray-200 font-bold uppercase" placeholder="Codigo de ativacao" />
          <div className="grid grid-cols-2 gap-2">
            <select value={farmForm.status || 'active'} onChange={(e) => setFarmForm({ ...farmForm, status: e.target.value })} className="p-3 rounded-lg border-2 border-gray-200 font-bold">
              <option value="active">active</option>
              <option value="blocked">blocked</option>
              <option value="expired">expired</option>
            </select>
            <input type="number" value={farmForm.max_devices || 0} onChange={(e) => setFarmForm({ ...farmForm, max_devices: Number(e.target.value) })} className="p-3 rounded-lg border-2 border-gray-200 font-bold" placeholder="Dispositivos" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={farmForm.grace_period_days || 0} onChange={(e) => setFarmForm({ ...farmForm, grace_period_days: Number(e.target.value) })} className="p-3 rounded-lg border-2 border-gray-200 font-bold" placeholder="Dias offline" />
            <input type="datetime-local" value={(farmForm.expires_at || '').slice(0, 16)} onChange={(e) => setFarmForm({ ...farmForm, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="p-3 rounded-lg border-2 border-gray-200 font-bold" />
          </div>
          <button disabled={loading} onClick={saveFarm} className="w-full py-3 rounded-lg bg-green-700 text-white font-black uppercase flex items-center justify-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Salvar fazenda
          </button>
        </div>
      </div>

      {selectedFarm && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h2 className="font-black text-gray-800 uppercase mb-4 flex items-center gap-2">
              <CheckCircle size={18} className="text-blue-700" /> Licenca
            </h2>
            <div className="grid gap-3">
              <select value={licenses[0]?.status || 'active'} onChange={(e) => savePrimaryLicense({ status: e.target.value })} className="p-3 rounded-lg border-2 border-gray-200 font-bold">
                <option value="active">active</option>
                <option value="blocked">blocked</option>
                <option value="expired">expired</option>
              </select>
              <input type="datetime-local" value={(licenses[0]?.expires_at || '').slice(0, 16)} onChange={(e) => savePrimaryLicense({ expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="p-3 rounded-lg border-2 border-gray-200 font-bold" />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h2 className="font-black text-gray-800 uppercase mb-4 flex items-center gap-2">
              <UserRound size={18} className="text-green-700" /> Funcionários
            </h2>

            <div className="grid gap-2 mb-4">
              <input
                value={employeeForm.name || ''}
                onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                className="p-3 rounded-lg border-2 border-gray-200 font-bold"
                placeholder="Nome do funcionário"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={employeeForm.role || 'Colaborador'}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })}
                  className="p-3 rounded-lg border-2 border-gray-200 font-bold"
                  placeholder="Função"
                />
                <select
                  value={employeeForm.status || 'active'}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, status: e.target.value })}
                  className="p-3 rounded-lg border-2 border-gray-200 font-bold"
                >
                  <option value="active">active</option>
                  <option value="blocked">blocked</option>
                </select>
              </div>
              <div className="flex gap-2">
                {employeeForm.id && (
                  <button onClick={clearEmployeeForm} className="px-4 py-3 rounded-lg bg-gray-100 text-gray-700 font-black uppercase flex items-center gap-1">
                    <X size={14} /> Cancelar
                  </button>
                )}
                <button disabled={employeeBusyId === 'save'} onClick={saveEmployee} className="flex-1 py-3 rounded-lg bg-green-700 text-white font-black uppercase flex items-center justify-center gap-2">
                  {employeeBusyId === 'save' ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  {employeeForm.id ? 'Atualizar funcionário' : 'Adicionar funcionário'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {employees.map((employee) => (
                <div key={employee.id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-gray-800 truncate">{employee.name}</p>
                    <p className="text-xs text-gray-500">{employee.role || 'Colaborador'} · {employee.status || 'active'}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => editEmployee(employee)} className="p-2 rounded-lg bg-blue-50 text-blue-700" title="Editar funcionário">
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => toggleEmployee(employee)}
                      disabled={employeeBusyId === employee.id}
                      className={`p-2 rounded-lg ${employee.status === 'active' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}
                      title={employee.status === 'active' ? 'Bloquear' : 'Ativar'}
                    >
                      {employeeBusyId === employee.id ? <Loader2 size={14} className="animate-spin" /> : employee.status === 'active' ? <Ban size={14} /> : <CheckCircle size={14} />}
                    </button>
                  </div>
                </div>
              ))}
              {employees.length === 0 && <p className="text-center text-gray-400 font-bold py-6">Nenhum funcionário cadastrado.</p>}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h2 className="font-black text-gray-800 uppercase mb-4 flex items-center gap-2">
              <Smartphone size={18} className="text-gray-700" /> Dispositivos
            </h2>
            <div className="space-y-2">
              {devices.map((device) => (
                <div key={device.id || device.device_id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-gray-800 truncate">{device.device_name || device.device_id}</p>
                    <p className="text-xs text-gray-500">{device.status} · {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('pt-BR') : '-'}</p>
                  </div>
                  <button onClick={() => toggleDevice(device)} className={`px-3 py-2 rounded-lg text-xs font-black uppercase flex items-center gap-1 ${device.status === 'active' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {device.status === 'active' ? <Ban size={14} /> : <CheckCircle size={14} />}
                    {device.status === 'active' ? 'Bloquear' : 'Ativar'}
                  </button>
                </div>
              ))}
              {devices.length === 0 && <p className="text-center text-gray-400 font-bold py-6">Nenhum dispositivo registrado.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
