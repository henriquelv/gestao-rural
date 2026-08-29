import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, CheckCircle, ChevronDown, ChevronUp, KeyRound,
  Loader2, LogOut, RefreshCw, Shield, ShieldOff, User, XCircle
} from 'lucide-react';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { adminService } from '../services/admin.service';
import { farmContextService } from '../services/farm-context.service';
import { notify } from '../services/notification.service';
import { supabase } from '../services/supabase';
import { DeviceRegistration, Employee, Farm, License } from '../types';

interface FarmDetail {
  farm: Farm;
  license: License | null;
  admin: Employee | null;
  devices: DeviceRegistration[];
  expanded: boolean;
}

const statusBadge = (status?: string) => {
  const s = status || 'unknown';
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    blocked: 'bg-red-100 text-red-700',
    expired: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${map[s] || 'bg-gray-100 text-gray-500'}`}>
      {s}
    </span>
  );
};

export const OwnerDashboardScreen: React.FC = () => {
  const navigate = useNavigate();
  const [farms, setFarms] = useState<FarmDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const farmList = await adminService.listFarms();

      const details = await Promise.all(
        farmList.map(async (farm): Promise<FarmDetail> => {
          const [licenses, devicesResult, adminResult] = await Promise.all([
            adminService.listLicenses(farm.id),
            adminService.listDevices(farm.id),
            supabase
              .from('employees')
              .select('*')
              .eq('farm_id', farm.id)
              .eq('is_admin', true)
              .maybeSingle()
          ]);

          const sortedLicenses = [...licenses].sort(
            (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          );

          return {
            farm,
            license: sortedLicenses[0] || null,
            admin: (adminResult.data as Employee | null),
            devices: devicesResult,
            expanded: false,
          };
        })
      );

      setFarms(details);
    } catch (e: any) {
      notify(e?.message || 'Erro ao carregar fazendas.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleExpand = (farmId: string) => {
    setFarms(prev => prev.map(f => f.farm.id === farmId ? { ...f, expanded: !f.expanded } : f));
  };

  const setFarmStatus = async (farm: Farm, status: 'active' | 'blocked') => {
    setBusy(farm.id);
    try {
      await adminService.saveFarm({ ...farm, status });
      notify(`Fazenda ${status === 'active' ? 'ativada' : 'bloqueada'}.`, 'success');
      await load();
    } catch (e: any) {
      notify(e?.message || 'Erro ao alterar status.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const setDeviceStatus = async (deviceId: string, status: 'active' | 'blocked') => {
    setBusy(deviceId);
    try {
      await adminService.setDeviceStatus(deviceId, status);
      notify(`Dispositivo ${status === 'active' ? 'ativado' : 'bloqueado'}.`, 'success');
      await load();
    } catch (e: any) {
      notify(e?.message || 'Erro ao alterar dispositivo.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const updateAdminPin = async (farmId: string, adminId: string, newPin: string) => {
    if (!/^\d{4}$/.test(newPin.trim())) { notify('O PIN deve ter exatamente 4 números.', 'error'); return; }
    setBusy(`pin_${adminId}`);
    try {
      const { error } = await supabase
        .from('employees')
        .update({ admin_pin: newPin.trim() })
        .eq('id', adminId)
        .eq('farm_id', farmId);
      if (error) throw error;
      notify('PIN do admin atualizado.', 'success');
    } catch (e: any) {
      notify(e?.message || 'Erro ao atualizar PIN.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const logout = () => {
    farmContextService.clearContext();
    window.location.reload();
  };

  return (
    <Layout>
      <Header title="Painel do Dono" showBack={false} />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Barra de ações */}
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-black uppercase"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-700 text-xs font-black uppercase ml-auto"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 size={32} className="animate-spin text-gray-400" />
          </div>
        )}

        {!loading && farms.length === 0 && (
          <p className="text-center text-gray-500 font-bold py-12">Nenhuma fazenda encontrada.</p>
        )}

        {!loading && farms.map(({ farm, license, admin, devices, expanded }) => (
          <div key={farm.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Cabeçalho do card */}
            <button
              className="w-full p-4 flex items-center gap-3 text-left"
              onClick={() => toggleExpand(farm.id)}
            >
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <Building2 size={20} className="text-green-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-gray-900 truncate">{farm.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {statusBadge(farm.status)}
                  {farm.activation_code && (
                    <span className="text-[10px] font-mono font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {farm.activation_code}
                    </span>
                  )}
                  {admin && (
                    <span className="text-[10px] text-gray-500 font-bold">
                      Admin: {admin.name}
                    </span>
                  )}
                </div>
              </div>
              {expanded ? <ChevronUp size={18} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />}
            </button>

            {/* Detalhes expandidos */}
            {expanded && (
              <div className="border-t border-gray-100 p-4 space-y-4">

                {/* Licença */}
                <div>
                  <p className="text-[10px] font-black uppercase text-gray-500 mb-2">Licença</p>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-bold">Status</span>
                      {statusBadge(license?.status || 'sem licença')}
                    </div>
                    {license?.expires_at && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 font-bold">Expira</span>
                        <span className="font-bold text-gray-800">
                          {new Date(license.expires_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin PIN */}
                {admin && (
                  <div>
                    <p className="text-[10px] font-black uppercase text-gray-500 mb-2">PIN do Admin ({admin.name})</p>
                    <AdminPinEditor
                      key={admin.id}
                      farmId={farm.id}
                      admin={admin}
                      busy={busy === `pin_${admin.id}`}
                      onSave={(newPin) => updateAdminPin(farm.id, admin.id, newPin)}
                    />
                  </div>
                )}

                {/* Status da fazenda */}
                <div className="flex gap-2">
                  {farm.status !== 'active' ? (
                    <button
                      onClick={() => void setFarmStatus(farm, 'active')}
                      disabled={busy === farm.id}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-600 text-white text-xs font-black uppercase disabled:opacity-50"
                    >
                      {busy === farm.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      Ativar fazenda
                    </button>
                  ) : (
                    <button
                      onClick={() => void setFarmStatus(farm, 'blocked')}
                      disabled={busy === farm.id}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-100 text-red-700 text-xs font-black uppercase disabled:opacity-50"
                    >
                      {busy === farm.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                      Bloquear fazenda
                    </button>
                  )}
                </div>

                {/* Dispositivos */}
                {devices.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase text-gray-500 mb-2">
                      Dispositivos ({devices.length})
                    </p>
                    <div className="space-y-2">
                      {devices.map(device => (
                        <div key={device.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-700 truncate">
                              {device.device_name || device.device_id}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {statusBadge(device.status)}
                              {device.last_seen_at && (
                                <span className="text-[10px] text-gray-400">
                                  {new Date(device.last_seen_at).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => void setDeviceStatus(device.id!, device.status === 'active' ? 'blocked' : 'active')}
                            disabled={busy === device.id}
                            className={`p-2 rounded-lg ${device.status === 'active' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}
                            title={device.status === 'active' ? 'Bloquear' : 'Ativar'}
                          >
                            {busy === device.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : device.status === 'active'
                                ? <ShieldOff size={14} />
                                : <Shield size={14} />
                            }
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
};

const AdminPinEditor: React.FC<{
  farmId: string;
  admin: Employee;
  busy: boolean;
  onSave: (pin: string) => void;
}> = ({ admin, busy, onSave }) => {
  const [pin, setPin] = useState(admin.admin_pin || '');
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 flex items-center gap-3">
        <User size={16} className="text-gray-400" />
        <span className="flex-1 text-sm font-bold text-gray-700">{admin.name}</span>
        <span className="font-mono text-sm text-gray-500">
          {admin.admin_pin ? '••••' : 'sem PIN'}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] font-black uppercase px-3 py-1 rounded-lg bg-gray-200 text-gray-700"
        >
          <KeyRound size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-center gap-2">
      <input
        type="tel"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
        placeholder="Novo PIN"
        className="flex-1 p-2 rounded-lg border border-blue-200 text-sm font-bold outline-none focus:border-blue-500 bg-white"
        autoFocus
      />
      <button
        onClick={() => { onSave(pin); setEditing(false); }}
        disabled={busy}
        className="p-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
      </button>
      <button onClick={() => { setPin(admin.admin_pin || ''); setEditing(false); }} className="p-2 rounded-lg bg-gray-200 text-gray-600">
        <XCircle size={14} />
      </button>
    </div>
  );
};
