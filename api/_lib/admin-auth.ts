import type { ApiRequest } from './http.js';
import { headerValue } from './http.js';

type EmployeeRow = {
  id: string | number;
  name?: string;
  role?: string | null;
  is_admin?: boolean | null;
  status?: string | null;
  admin_pin?: string | null;
  access_pin?: string | null;
};

const clean = (value: string) => value.trim();
const normalized = (value?: string | null) => (value || '').trim().toLocaleLowerCase('pt-BR');

export const requireAppUser = async (req: ApiRequest): Promise<{ isAdmin: boolean; farmId: string; employeeId: string; employeeName: string }> => {
  const farmId = clean(headerValue(req.headers['x-campo-farm-id']));
  const employeeId = clean(headerValue(req.headers['x-campo-employee-id']));
  const suppliedPin = headerValue(req.headers['x-campo-admin-pin']);
  const deviceId = clean(headerValue(req.headers['x-campo-device-id']));
  const supabaseUrl = clean(process.env.VITE_SUPABASE_URL || '');
  const anonKey = clean(process.env.VITE_SUPABASE_ANON_KEY || '');

  if (!farmId || !employeeId || (!suppliedPin && !deviceId)) throw new Error('UNAUTHORIZED');
  if (!supabaseUrl || !anonKey) throw new Error('AUTH_NOT_CONFIGURED');

  const params = new URLSearchParams({
    farm_id: `eq.${farmId}`,
    id: `eq.${employeeId}`,
    select: 'id,name,role,is_admin,status,admin_pin,access_pin',
    limit: '1'
  });
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/employees?${params}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
  });
  if (!response.ok) throw new Error('AUTH_UNAVAILABLE');

  const employee = ((await response.json()) as EmployeeRow[])[0];
  const isActive = !employee?.status || normalized(employee.status) === 'active';
  const isAdmin = normalized(employee?.role) === 'administrador'
    || (employee?.is_admin === true && !normalized(employee?.role));
  const expectedPin = String(employee?.access_pin || employee?.admin_pin || '');

  let validDevice = false;
  if (employee && isActive && deviceId) {
    const deviceParams = new URLSearchParams({
      farm_id: `eq.${farmId}`,
      employee_id: `eq.${employeeId}`,
      device_id: `eq.${deviceId}`,
      status: 'eq.active',
      select: 'device_id',
      limit: '1'
    });
    const deviceResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/devices?${deviceParams}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });
    if (!deviceResponse.ok) throw new Error('AUTH_UNAVAILABLE');
    validDevice = ((await deviceResponse.json()) as Array<{ device_id: string }>).length > 0;
  }

  const validPin = Boolean(expectedPin && suppliedPin && expectedPin === suppliedPin);
  if (!employee || !isActive || (!validPin && !validDevice)) {
    throw new Error('FORBIDDEN');
  }
  return { isAdmin, farmId, employeeId, employeeName: employee.name || '' };
};

export const requireAppAdministrator = async (req: ApiRequest): Promise<void> => {
  const user = await requireAppUser(req);
  if (!user.isAdmin) throw new Error('FORBIDDEN');
};
