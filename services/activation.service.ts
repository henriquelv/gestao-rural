import { AppActivationContext, Employee, Farm, License } from '../types';
import { supabase } from './supabase';
import { farmContextService } from './farm-context.service';
import { licenseService } from './license.service';
import { deviceService } from './device.service';

export const activationService = {
  async validateActivationCode(
    code: string
  ): Promise<{ farm: Farm | null; employees: Employee[]; isOwner: boolean }> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) throw new Error('Informe o codigo da fazenda.');

    // Verificar código dono ANTES de ir ao Supabase
    const ownerCode = ((import.meta.env.VITE_OWNER_CODE as string) || '').trim().toUpperCase();
    if (ownerCode && normalized === ownerCode) {
      return { farm: null, employees: [], isOwner: true };
    }

    const { data: farm, error } = await supabase
      .from('farms')
      .select('*')
      .eq('activation_code', normalized)
      .maybeSingle();

    if (error) throw error;
    if (!farm) throw new Error('Codigo da fazenda invalido.');

    const { data: licenses, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('farm_id', farm.id);

    if (licenseError) throw licenseError;
    const license = licenseService.evaluate(farm as Farm, (licenses || []) as License[]);
    if (!license.ok) throw new Error(license.message);

    const { data: employees, error: employeesError } = await supabase
      .from('employees')
      .select('*')
      .eq('farm_id', farm.id)
      .or('status.is.null,status.eq.active')
      .order('name', { ascending: true });

    if (employeesError) throw employeesError;
    if (!employees || employees.length === 0) throw new Error('Nenhum funcionario ativo encontrado para esta fazenda.');

    return { farm: farm as Farm, employees: employees as Employee[], isOwner: false };
  },

  async activate(farm: Farm, employee: Employee) {
    const device = await deviceService.ensureDevice(farm, employee);
    const ctx: AppActivationContext = {
      farm_id: farm.id,
      farm_name: farm.name,
      employee_id: String(employee.id),
      employee_name: employee.name,
      device_id: device.device_id,
      last_license_check_at: new Date().toISOString(),
      license_status: 'active',
      device_status: device.status,
      grace_period_days: farm.grace_period_days || 7,
      is_owner: false,
      admin_pin: employee.admin_pin || undefined,
    };
    farmContextService.saveContext(ctx);
    return ctx;
  },

  async activateAsOwner(): Promise<AppActivationContext> {
    const deviceId = farmContextService.getDeviceId();
    const ctx: AppActivationContext = {
      farm_id: 'owner',
      farm_name: 'Dono do App',
      employee_id: 'owner',
      employee_name: 'Dono',
      device_id: deviceId,
      is_owner: true,
      last_license_check_at: new Date().toISOString(),
      license_status: 'active',
      device_status: 'active',
    };
    farmContextService.saveContext(ctx);
    return ctx;
  },

  async validateCurrentAccess(): Promise<{ ok: boolean; offline?: boolean; message?: string }> {
    const ctx = farmContextService.getContext();
    if (!ctx) return { ok: false, message: 'Aplicativo nao ativado.' };
    if (ctx.is_owner) return { ok: true };

    if (!navigator.onLine) {
      const ok = licenseService.isWithinOfflineGrace(ctx.last_license_check_at, ctx.grace_period_days || 7);
      return {
        ok,
        offline: true,
        message: ok ? undefined : 'Acesso temporariamente bloqueado. Entre em contato com o administrador.'
      };
    }

    let farmResult;
    let licensesResult;
    let device = null;

    try {
      [farmResult, licensesResult, device] = await Promise.all([
        supabase.from('farms').select('*').eq('id', ctx.farm_id).maybeSingle(),
        supabase.from('licenses').select('*').eq('farm_id', ctx.farm_id),
        deviceService.touchCurrentDevice()
      ]);
    } catch (e) {
      console.warn('Falha temporaria na validacao de acesso:', e);
      if (licenseService.isWithinOfflineGrace(ctx.last_license_check_at, ctx.grace_period_days || 7)) {
        return { ok: true, offline: true };
      }
      throw e;
    }

    const { data: farm, error: farmError } = farmResult;
    const { data: licenses, error: licenseError } = licensesResult;

    if (farmError) throw farmError;
    if (licenseError) throw licenseError;
    if (!farm) return { ok: false, message: 'Fazenda nao encontrada.' };
    if (device?.status && device.status !== 'active') return { ok: false, message: 'Acesso temporariamente bloqueado. Entre em contato com o administrador.' };

    const license = licenseService.evaluate(farm as Farm, (licenses || []) as License[]);
    if (!license.ok) return { ok: false, message: license.message };

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('*')
      .eq('id', String(ctx.employee_id))
      .eq('farm_id', ctx.farm_id)
      .maybeSingle();

    if (employeeError) throw employeeError;
    if (!employee) {
      return { ok: false, message: 'Funcionario nao encontrado nesta fazenda. Reative o aplicativo.' };
    }
    if (employee?.status && employee.status !== 'active') {
      return { ok: false, message: 'Acesso temporariamente bloqueado. Entre em contato com o administrador.' };
    }

    farmContextService.updateContext({
      farm_name: (farm as Farm).name,
      employee_id: String((employee as Employee).id || ctx.employee_id),
      employee_name: (employee as Employee).name || ctx.employee_name,
      admin_pin: (employee as Employee).admin_pin || ctx.admin_pin,
      last_license_check_at: new Date().toISOString(),
      license_status: license.status,
      device_status: device?.status || 'active',
      grace_period_days: (farm as Farm).grace_period_days || 7
    });

    return { ok: true };
  }
};
