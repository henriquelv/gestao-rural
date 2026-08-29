import { supabase } from './supabase';
import { DeviceRegistration, Employee, Farm } from '../types';
import { farmContextService } from './farm-context.service';

export const deviceService = {
  getDeviceId() {
    return farmContextService.getDeviceId();
  },

  getDeviceName() {
    try {
      const ua = navigator.userAgent || 'Dispositivo';
      return ua.length > 80 ? ua.slice(0, 80) : ua;
    } catch {
      return 'Dispositivo';
    }
  },

  getPlatform() {
    try {
      return (navigator as any).userAgentData?.platform || navigator.platform || 'web';
    } catch {
      return 'web';
    }
  },

  async ensureDevice(farm: Farm, employee: Employee): Promise<DeviceRegistration> {
    const deviceId = this.getDeviceId();

    const { count, error: countError } = await supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('farm_id', farm.id)
      .eq('status', 'active');

    if (countError) throw countError;

    const { data: existing, error: existingError } = await supabase
      .from('devices')
      .select('*')
      .eq('farm_id', farm.id)
      .eq('device_id', deviceId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing && typeof count === 'number' && farm.max_devices && count >= farm.max_devices) {
      throw new Error('Limite de dispositivos atingido para esta fazenda.');
    }

    if (existing?.status && existing.status !== 'active') {
      throw new Error('Acesso não autorizado: este dispositivo está bloqueado. Procure o administrador.');
    }

    const payload = {
      farm_id: farm.id,
      employee_id: String(employee.id),
      device_id: deviceId,
      device_name: this.getDeviceName(),
      platform: this.getPlatform(),
      status: 'active',
      last_seen_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('devices')
      .upsert(payload, { onConflict: 'farm_id,device_id' })
      .select('*')
      .single();

    if (error) throw error;
    return data as DeviceRegistration;
  },

  async touchCurrentDevice(): Promise<DeviceRegistration | null> {
    const ctx = farmContextService.getContext();
    if (!ctx) return null;
    if (ctx.is_owner) return null;
    const { data, error } = await supabase
      .from('devices')
      .update({ last_seen_at: new Date().toISOString(), employee_id: String(ctx.employee_id) })
      .eq('farm_id', ctx.farm_id)
      .eq('device_id', ctx.device_id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data as DeviceRegistration | null;
  },

  async assignCurrentEmployee(employeeId: string): Promise<DeviceRegistration> {
    const ctx = farmContextService.getContext();
    if (!ctx || ctx.is_owner) {
      throw new Error('Acesso não autorizado: aplicativo não ativado para uma fazenda.');
    }

    const { data, error } = await supabase
      .from('devices')
      .update({ employee_id: String(employeeId), last_seen_at: new Date().toISOString() })
      .eq('farm_id', ctx.farm_id)
      .eq('device_id', ctx.device_id)
      .eq('status', 'active')
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new Error('Acesso não autorizado: dispositivo não encontrado ou bloqueado.');
    }
    return data as DeviceRegistration;
  }
};
