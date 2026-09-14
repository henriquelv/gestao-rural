import { Anomaly } from '../types';
import { clientSignature, workOrderKm, workOrderReceivable, workOrderTotal } from './work-orders';

export interface MonthlyReportBreakdown {
  name: string;
  orders: number;
  revenue: number;
  expenses: number;
  receivable: number;
  km: number;
  averageKm: number;
}

export interface MonthlyReportWeek {
  label: string;
  orders: number;
}

export interface MonthlyReportSummary {
  monthKey: string;
  orders: Anomaly[];
  clients: number;
  revenue: number;
  expenses: number;
  balance: number;
  receivable: number;
  km: number;
  averageTicket: number;
  averageKm: number;
  signedOrders: number;
  signatureRate: number;
  byTechnician: MonthlyReportBreakdown[];
  byClient: MonthlyReportBreakdown[];
  byWeek: MonthlyReportWeek[];
}

export const workOrderDate = (item: Anomaly): string => item.serviceDate || item.createdAt.slice(0, 10);

export const monthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1))
    .replace(/^./, (letter) => letter.toUpperCase());
};

const groupRows = (orders: Anomaly[], keyFor: (item: Anomaly) => string): MonthlyReportBreakdown[] => {
  const grouped = new Map<string, MonthlyReportBreakdown & { kmOrders: number }>();
  orders.forEach((item) => {
    const name = keyFor(item) || 'Não informado';
    const current = grouped.get(name) || {
      name,
      orders: 0,
      revenue: 0,
      expenses: 0,
      receivable: 0,
      km: 0,
      averageKm: 0,
      kmOrders: 0
    };
    current.orders += 1;
    if (item.serviceOrderType === 'receita') current.revenue += workOrderTotal(item);
    if (item.serviceOrderType === 'despesa') current.expenses += workOrderTotal(item);
    current.receivable += workOrderReceivable(item);
    current.km += workOrderKm(item);
    if (workOrderKm(item) > 0) current.kmOrders += 1;
    grouped.set(name, current);
  });
  return Array.from(grouped.values())
    .map(({ kmOrders, ...row }) => {
      return { ...row, averageKm: kmOrders ? row.km / kmOrders : 0 };
    })
    .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name, 'pt-BR'));
};

export const summarizeMonthlyWorkOrders = (allOrders: Anomaly[], selectedMonth: string): MonthlyReportSummary => {
  const orders = allOrders
    .filter((item) => workOrderDate(item).slice(0, 7) === selectedMonth)
    .sort((a, b) => workOrderDate(a).localeCompare(workOrderDate(b)) || a.createdAt.localeCompare(b.createdAt));
  const revenueOrders = orders.filter((item) => item.serviceOrderType === 'receita');
  const expenseOrdersWithKm = orders.filter((item) => workOrderKm(item) > 0);
  const revenue = revenueOrders.reduce((sum, item) => sum + workOrderTotal(item), 0);
  const expenses = orders
    .filter((item) => item.serviceOrderType === 'despesa')
    .reduce((sum, item) => sum + workOrderTotal(item), 0);
  const km = orders.reduce((sum, item) => sum + workOrderKm(item), 0);
  const signedOrders = orders.filter((item) => Boolean(clientSignature(item))).length;
  const weekCounts = [0, 0, 0, 0, 0];
  orders.forEach((item) => {
    const day = Number(workOrderDate(item).slice(8, 10)) || 1;
    weekCounts[Math.min(4, Math.floor((day - 1) / 7))] += 1;
  });

  return {
    monthKey: selectedMonth,
    orders,
    clients: new Set(orders.map((item) => item.clientName?.trim()).filter(Boolean)).size,
    revenue,
    expenses,
    balance: revenue - expenses,
    receivable: orders.reduce((sum, item) => sum + workOrderReceivable(item), 0),
    km,
    averageTicket: revenueOrders.length ? revenue / revenueOrders.length : 0,
    averageKm: expenseOrdersWithKm.length ? km / expenseOrdersWithKm.length : 0,
    signedOrders,
    signatureRate: orders.length ? signedOrders / orders.length : 0,
    byTechnician: groupRows(orders, (item) => item.responsible),
    byClient: groupRows(orders, (item) => item.clientName || ''),
    byWeek: weekCounts.map((count, index) => ({
      label: index === 4 ? '29–31' : `${index * 7 + 1}–${index * 7 + 7}`,
      orders: count
    }))
  };
};
