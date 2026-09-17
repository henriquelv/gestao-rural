import type { Fueling } from '../types';

export type FuelingMileage = { km: number; efficiencyKm: number; efficiencyLiters: number };

export const fuelingEmployeeKey = (item: Fueling) => String(item.driverId || item.employee_id || item.driverName);

const fuelingVehicleKey = (item: Fueling) => item.vehicleId || `${item.employee_id || ''}:${item.vehicle.trim().toLocaleLowerCase('pt-BR')}`;

export const buildFuelingMileage = (rows: Fueling[]) => {
  const byVehicle = new Map<string, Fueling[]>();
  rows.forEach(item => {
    const key = fuelingVehicleKey(item);
    byVehicle.set(key, [...(byVehicle.get(key) || []), item]);
  });
  const result = new Map<string, FuelingMileage>();
  byVehicle.forEach(items => {
    const ordered = [...items].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    ordered.forEach((item, index) => {
      const previous = ordered[index - 1];
      const km = previous ? Number(item.odometer) - Number(previous.odometer) : 0;
      const validKm = Number.isFinite(km) && km > 0 ? km : 0;
      const validEfficiency = validKm > 0 && Boolean(item.fullTank && previous?.fullTank) && Number(item.liters) > 0;
      result.set(item.id, { km: validKm, efficiencyKm: validEfficiency ? validKm : 0, efficiencyLiters: validEfficiency ? Number(item.liters) : 0 });
    });
  });
  return result;
};

export const summarizeFuelings = (allRows: Fueling[], rows: Fueling[]) => {
  const mileage = buildFuelingMileage(allRows);
  const total = rows.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);
  const liters = rows.reduce((sum, item) => sum + Number(item.liters || 0), 0);
  const km = rows.reduce((sum, item) => sum + (mileage.get(item.id)?.km || 0), 0);
  const efficiencyKm = rows.reduce((sum, item) => sum + (mileage.get(item.id)?.efficiencyKm || 0), 0);
  const efficiencyLiters = rows.reduce((sum, item) => sum + (mileage.get(item.id)?.efficiencyLiters || 0), 0);
  return {
    total,
    liters,
    km,
    price: liters > 0 ? total / liters : 0,
    efficiency: efficiencyLiters > 0 ? efficiencyKm / efficiencyLiters : 0,
    ticket: rows.length > 0 ? total / rows.length : 0,
    count: rows.length,
    validEfficiencyCount: rows.filter(item => (mileage.get(item.id)?.efficiencyLiters || 0) > 0).length
  };
};

