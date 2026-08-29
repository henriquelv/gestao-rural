import { AppActivationContext, Employee, Farm, License } from '../types';
import { supabase } from './supabase';
import { farmContextService } from './farm-context.service';
import { licenseService } from './license.service';
import { deviceService } from './device.service';
import { normalizeEmployees } from '../utils/record-normalize';
import { resolveAdminPin } from '../utils/admin-pin';
import { localdb } from './localdb';

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
    if (!farm) throw new Error('Acesso não autorizado: código da fazenda inválido.');

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
    const validEmployees = normalizeEmployees(employees || []);
    if (validEmployees.length === 0) throw new Error('Nenhum funcionario ativo encontrado para esta fazenda.');

    return { farm: farm as Farm, employees: validEmployees, isOwner: false };
  },

  async activate(farm: Farm, employee: Employee, farmEmployees: Employee[] = []) {
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
      // O PIN pertence à administração da fazenda e precisa funcionar offline
      // mesmo quando o aparelho está vinculado a um funcionário comum.
      admin_pin: resolveAdminPin(employee, farmEmployees) || undefined,
    };
    farmContextService.saveContext(ctx);
    try { localStorage.removeItem('last_access_error_v1'); } catch { /* armazenamento opcional */ }
    window.dispatchEvent(new CustomEvent('app-access-status', { detail: { message: null } }));
    try {
      const now = new Date().toISOString();
      const employeesToCache = normalizeEmployees(farmEmployees.length > 0 ? farmEmployees : [employee]);
      await localdb.bulkPut('employees', employeesToCache.map((item) => ({
        id: String(item.id),
        data: { ...item, farm_id: item.farm_id || farm.id },
        updated_at: now,
        synced: true
      })));
    } catch (error) {
      // A ativação remota continua válida; o sync tentará hidratar este cache novamente.
      console.warn('Não foi possível guardar a lista de funcionários para uso offline.', error);
    }
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

  async switchEmployee(employee: Employee): Promise<AppActivationContext> {
    const ctx = farmContextService.getContext();
    if (!ctx || ctx.is_owner) {
      throw new Error('Acesso não autorizado: aplicativo não ativado para uma fazenda.');
    }
    if (employee.farm_id && String(employee.farm_id) !== String(ctx.farm_id)) {
      throw new Error('Acesso não autorizado: funcionário pertence a outra fazenda.');
    }
    if (employee.status && employee.status !== 'active') {
      throw new Error('Acesso não autorizado: funcionário está bloqueado.');
    }

    let selectedEmployee = employee;
    if (navigator.onLine) {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', String(employee.id))
        .eq('farm_id', ctx.farm_id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Acesso não autorizado: funcionário não encontrado nesta fazenda.');
      if (data.status && data.status !== 'active') {
        throw new Error('Acesso não autorizado: funcionário está bloqueado.');
      }
      selectedEmployee = data as Employee;
      await deviceService.assignCurrentEmployee(String(selectedEmployee.id));
    }

    return farmContextService.updateContext({
      employee_id: String(selectedEmployee.id),
      employee_name: selectedEmployee.name,
      admin_pin: resolveAdminPin(selectedEmployee, [], ctx.admin_pin) || ctx.admin_pin
    }) as AppActivationContext;
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
        message: ok ? undefined : 'Acesso não autorizado: prazo de uso offline expirado. Conecte o aparelho ou procure o administrador.'
      };
    }

    try {
      const [farmResult, licensesResult, device] = await Promise.all([
        supabase.from('farms').select('*').eq('id', ctx.farm_id).maybeSingle(),
        supabase.from('licenses').select('*').eq('farm_id', ctx.farm_id),
        deviceService.touchCurrentDevice()
      ]);

      const { data: farm, error: farmError } = farmResult;
      const { data: licenses, error: licenseError } = licensesResult;
      if (farmError) throw farmError;
      if (licenseError) throw licenseError;
      if (!farm) return { ok: false, message: 'Fazenda nao encontrada.' };
      if (!device) {
        return { ok: false, message: 'Acesso não autorizado: dispositivo não registrado. Reative o aplicativo.' };
      }
      if (device?.status && device.status !== 'active') {
        return { ok: false, message: 'Acesso não autorizado: este dispositivo está bloqueado. Procure o administrador.' };
      }

      const license = licenseService.evaluate(farm as Farm, (licenses || []) as License[]);
      if (!license.ok) return { ok: false, message: license.message };

      const [employeeResult, farmAdminsResult] = await Promise.all([
        supabase
          .from('employees')
          .select('*')
          .eq('id', String(ctx.employee_id))
          .eq('farm_id', ctx.farm_id)
          .maybeSingle(),
        supabase
          .from('employees')
          .select('*')
          .eq('farm_id', ctx.farm_id)
          .eq('is_admin', true)
          .or('status.is.null,status.eq.active')
          .not('admin_pin', 'is', null)
          .order('name', { ascending: true })
          .limit(5)
      ]);

      const { data: employee, error: employeeError } = employeeResult;

      if (employeeError) throw employeeError;
      if (!employee) {
        return { ok: false, message: 'Acesso não autorizado: funcionário não encontrado nesta fazenda. Reative o aplicativo.' };
      }
      if (employee?.status && employee.status !== 'active') {
        return { ok: false, message: 'Acesso não autorizado: este funcionário está bloqueado. Procure o administrador.' };
      }

      if (farmAdminsResult.error) {
        // Falha ao atualizar o PIN não pode bloquear licença, uso offline ou sync.
        console.warn('Nao foi possivel atualizar o PIN administrativo da fazenda.');
      }
      const farmAdmins = farmAdminsResult.error
        ? []
        : normalizeEmployees(farmAdminsResult.data || []);

      farmContextService.updateContext({
        farm_name: (farm as Farm).name,
        employee_id: String((employee as Employee).id || ctx.employee_id),
        employee_name: (employee as Employee).name || ctx.employee_name,
        admin_pin: resolveAdminPin(employee as Employee, farmAdmins, ctx.admin_pin) || undefined,
        last_license_check_at: new Date().toISOString(),
        license_status: license.status,
        device_status: device.status,
        grace_period_days: (farm as Farm).grace_period_days || 7
      });

      return { ok: true };
    } catch (e) {
      console.warn('Falha temporaria na validacao de acesso:', e);
      if (licenseService.isWithinOfflineGrace(ctx.last_license_check_at, ctx.grace_period_days || 7)) {
        return { ok: true, offline: true };
      }
      return {
        ok: false,
        message: 'Nao foi possivel validar o acesso. Verifique a conexao e tente novamente.'
      };
    }
  }
};
