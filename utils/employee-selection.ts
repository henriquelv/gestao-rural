export interface EmployeeSelectionOption {
  id: string;
  name: string;
  role?: string;
}

const normalizeName = (value: unknown): string => String(value || '').trim().toLocaleLowerCase('pt-BR');

/** Resolve por ID; nome so e aceito quando nao existe ambiguidade. */
export function resolveEmployeeSelection<T extends EmployeeSelectionOption>(
  employees: T[],
  employeeId?: string,
  employeeName?: string
): T | null {
  const id = String(employeeId || '').trim();
  if (id) {
    const byId = employees.find((employee) => String(employee.id) === id);
    if (byId) return byId;
  }

  const name = normalizeName(employeeName);
  if (!name) return null;
  const matches = employees.filter((employee) => normalizeName(employee.name) === name);
  return matches.length === 1 ? matches[0] : null;
}

/** Exibe cargo/ID somente quando o nome sozinho nao identifica o cadastro. */
export function formatEmployeeSelectionLabel<T extends EmployeeSelectionOption>(
  employee: T,
  employees: T[]
): string {
  const duplicates = employees.filter((item) => normalizeName(item.name) === normalizeName(employee.name));
  if (duplicates.length <= 1) return employee.name;
  const suffix = String(employee.id).slice(-6);
  return `${employee.name} (${employee.role || 'cadastro'} - ${suffix})`;
}
