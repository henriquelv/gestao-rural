import { Anomaly } from '../types';
import { SectorType, SECTORS_LIST } from '../constants/sectors';

export interface AnomalyMonthData {
  month: string;
  label: string;
  bySetor: Record<SectorType, number>;
}

const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export interface AnomalyDateParts {
  year: number;
  monthIndex: number;
  day: number;
  time: number;
}

export function getAnomalyDate(value: string): Date | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const hour = Number(iso[4] || 0);
    const minute = Number(iso[5] || 0);
    const second = Number(iso[6] || 0);
    const millisecond = Number((iso[7] || '').padEnd(3, '0') || 0);
    const date = new Date(year, month - 1, day, hour, minute, second, millisecond);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  const legacyUs = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (legacyUs) {
    const month = Number(legacyUs[1]);
    const day = Number(legacyUs[2]);
    const year = Number(legacyUs[3]);
    const date = new Date(year, month - 1, day, Number(legacyUs[4] || 0), Number(legacyUs[5] || 0), Number(legacyUs[6] || 0));
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getAnomalyDateParts(value: string): AnomalyDateParts | null {
  const date = getAnomalyDate(value);
  if (!date) return null;

  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    day: date.getDate(),
    time: date.getTime()
  };
}

export function getAnomalyTime(value: string): number {
  return getAnomalyDate(value)?.getTime() ?? 0;
}

export function isAnomalyInDateRange(value: string, startDate: string, endDate: string): boolean {
  const date = getAnomalyDate(value);
  const start = getAnomalyDate(startDate);
  const end = getAnomalyDate(endDate);
  if (!date || !start || !end) return false;
  end.setHours(23, 59, 59, 999);
  return date >= start && date <= end;
}

export function groupAnomaliesByMonth(anomalies: Anomaly[], year: number): AnomalyMonthData[] {
  const months: AnomalyMonthData[] = Array.from({ length: 12 }, (_, monthIndex) => {
    const bySetor = {} as Record<SectorType, number>;
    SECTORS_LIST.forEach((sector) => {
      bySetor[sector] = 0;
    });

    return {
      month: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
      label: `${MONTH_LABELS[monthIndex]} ${String(year).slice(-2)}`,
      bySetor
    };
  });

  anomalies.forEach((anomaly) => {
    const parts = getAnomalyDateParts(anomaly.createdAt);
    if (!parts || parts.year !== year) return;

    const sector = SECTORS_LIST.includes(anomaly.sector as SectorType)
      ? (anomaly.sector as SectorType)
      : 'Ordenha';
    months[parts.monthIndex].bySetor[sector]++;
  });

  return months;
}
