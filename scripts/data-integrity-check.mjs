import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^\w+=/.test(line))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const headers = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`
};
const get = async (table, query) => {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${table}?${query}`, { headers });
  if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
  return response.json();
};

const [orders, clients, devices, employees, appointments, fuelings] = await Promise.all([
  get('anomalies', 'select=id,clientName,serviceDate,createdAt,serviceOrderType,projectValue,visitValue,kmValue,additionalExpenseValue,kmQuantity,employee_id,createdByEmployeeId,media'),
  get('clients', 'select=id,name,status'),
  get('devices', 'select=device_id,employee_id,status'),
  get('employees', 'select=id,name,role,is_admin,status'),
  get('appointments', 'select=id,employee_id,clientId,clientName,date,period,status'),
  get('fuelings', 'select=id,employee_id,driverId,date,odometer,pricePerLiter,totalValue,liters')
]);
const numericFields = ['projectValue', 'visitValue', 'kmValue', 'additionalExpenseValue', 'kmQuantity'];
const nameCounts = clients
  .filter((item) => !item.status || item.status === 'active')
  .reduce((counts, item) => {
    const key = String(item.name || '').trim().toLocaleLowerCase('pt-BR');
    if (key) counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
const activeEmployeeIds = new Set(employees
  .filter((item) => !item.status || item.status === 'active')
  .map((item) => String(item.id)));
const activeClientIds = new Set(clients
  .filter((item) => !item.status || item.status === 'active')
  .map((item) => String(item.id)));
const unknownEmployee = (value) => Boolean(value) && !activeEmployeeIds.has(String(value));
const signatureItems = orders.flatMap((item) => Array.isArray(item.media)
  ? item.media.filter((media) => media?.purpose === 'client_signature')
  : []);

console.log(JSON.stringify({
  orders: orders.length,
  clients: clients.length,
  activeDevices: devices.filter((item) => item.status === 'active').length,
  ordersWithoutClient: orders.filter((item) => !String(item?.clientName || '').trim()).length,
  ordersWithoutDate: orders.filter((item) => !String(item?.serviceDate || item?.createdAt || '').trim()).length,
  numericStrings: orders.reduce((total, item) => total + numericFields.filter((field) => typeof item?.[field] === 'string').length, 0),
  malformedRows: orders.filter((item) => !item || typeof item !== 'object').length,
  duplicateActiveClientNames: Object.values(nameCounts).filter((count) => count > 1).length,
  activeEmployees: activeEmployeeIds.size,
  administrators: employees.filter((item) => (!item.status || item.status === 'active') && (item.role === 'Administrador' || item.is_admin === true)).length,
  workOrdersWithUnknownEmployee: orders.filter((item) => unknownEmployee(item.createdByEmployeeId || item.employee_id)).length,
  appointmentsWithUnknownEmployee: appointments.filter((item) => unknownEmployee(item.employee_id)).length,
  appointmentsWithUnknownClient: appointments.filter((item) => item.clientId && !activeClientIds.has(String(item.clientId))).length,
  appointmentsWithInvalidPeriod: appointments.filter((item) => !['morning', 'afternoon', 'full_day'].includes(item.period)).length,
  fuelingsWithUnknownEmployee: fuelings.filter((item) => unknownEmployee(item.driverId || item.employee_id)).length,
  malformedFuelingValues: fuelings.filter((item) => ['odometer', 'pricePerLiter', 'totalValue', 'liters'].some((field) => !Number.isFinite(Number(item[field])) || Number(item[field]) <= 0)).length,
  signatures: signatureItems.length,
  signaturesWithoutContent: signatureItems.filter((item) => !item.remotePath && !item.remoteUrl && !item.uri && !item.localPath).length
}));
