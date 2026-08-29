import { Employee } from '../types';

const validPin = (value?: string): string => {
  const pin = String(value || '').trim();
  return /^\d{4}$/.test(pin) ? pin : '';
};

export function resolveAdminPin(
  selectedEmployee?: Employee | null,
  farmEmployees: Employee[] = [],
  fallback = ''
): string {
  const selectedPin = validPin(selectedEmployee?.admin_pin);
  if (selectedPin) return selectedPin;

  const farmAdmin = farmEmployees.find((employee) => {
    const isActive = !employee.status || employee.status === 'active';
    return employee.is_admin === true && isActive && Boolean(validPin(employee.admin_pin));
  });

  return validPin(farmAdmin?.admin_pin) || validPin(fallback);
}
