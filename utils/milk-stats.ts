import { DailyMilk } from '../types';

export const MILK_MONTH_LABELS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
] as const;

export interface MilkPeriodStats {
  total: number;
  average: number;
  days: number;
}

export interface MilkMonthStats extends MilkPeriodStats {
  month: number;
  label: string;
}

export interface MilkSummary {
  year: number;
  months: MilkMonthStats[];
  yearStats: MilkPeriodStats;
  allTimeStats: MilkPeriodStats;
}

const parseDateKey = (value: unknown): { year: number; month: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return { year, month };
};
const emptyStats = (): MilkPeriodStats => ({ total: 0, average: 0, days: 0 });

const finalizeStats = (stats: MilkPeriodStats): MilkPeriodStats => ({
  ...stats,
  average: stats.days > 0 ? stats.total / stats.days : 0
});

export const buildMilkSummary = (entries: DailyMilk[], year: number): MilkSummary => {
  const months: MilkMonthStats[] = MILK_MONTH_LABELS.map((label, index) => ({
    month: index + 1,
    label,
    ...emptyStats()
  }));
  const yearStats = emptyStats();
  const allTimeStats = emptyStats();

  for (const entry of entries) {
    const date = parseDateKey(entry?.date);
    const liters = Number(entry?.liters);
    if (!date || !Number.isFinite(liters) || liters < 0) continue;

    allTimeStats.total += liters;
    allTimeStats.days += 1;

    if (date.year !== year) continue;
    const month = months[date.month - 1];
    month.total += liters;
    month.days += 1;
    yearStats.total += liters;
    yearStats.days += 1;
  }

  return {
    year,
    months: months.map((month) => ({ ...month, average: month.days > 0 ? month.total / month.days : 0 })),
    yearStats: finalizeStats(yearStats),
    allTimeStats: finalizeStats(allTimeStats)
  };
};
