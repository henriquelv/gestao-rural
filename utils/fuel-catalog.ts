export const normalizePlate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
export const normalizeCatalogName = (value: string) => value.trim().replace(/\s+/g, ' ');

export const ownsFuelCatalog = (
  item: { farm_id?: string; employee_id?: string },
  context: { farm_id?: string; employee_id?: string } | null
) => Boolean(context?.farm_id && context?.employee_id
  && item.farm_id === context.farm_id
  && String(item.employee_id) === String(context.employee_id));

export const validateFuelCatalog = (kind: 'vehicle' | 'station', name: string, detail: string) => {
  if (!normalizeCatalogName(name) || name.length > 100) return 'Informe um nome de até 100 caracteres.';
  if (kind === 'vehicle' && detail && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(detail)) return 'Confira a placa. Use o formato ABC1234 ou ABC1D23.';
  if (kind === 'station' && detail.length > 200) return 'O endereço deve ter até 200 caracteres.';
  return '';
};
