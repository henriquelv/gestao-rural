import { Anomaly, MediaItem } from '../types';

const finiteNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const workOrderProjectValue = (item: Anomaly): number => {
  if (item.projectValue !== undefined && item.projectValue !== null) return finiteNumber(item.projectValue);
  return item.serviceOrderType === 'receita'
    ? finiteNumber(item.visitValue) + finiteNumber(item.kmValue)
    : 0;
};

export const workOrderTotal = (item: Anomaly): number => item.serviceOrderType === 'receita'
  ? workOrderProjectValue(item)
  : finiteNumber(item.visitValue) + finiteNumber(item.kmValue) + finiteNumber(item.additionalExpenseValue);

export const workOrderKm = (item: Anomaly): number => item.serviceOrderType === 'despesa'
  ? finiteNumber(item.kmQuantity)
  : 0;

export const workOrderKmUnitValue = (item: Anomaly): number => {
  const quantity = finiteNumber(item.kmQuantity);
  const total = finiteNumber(item.kmValue);
  if (quantity && total) {
    return total / quantity;
  }
  return finiteNumber(item.kmUnitValue);
};

export const workOrderReceivable = (item: Anomaly): number => item.serviceOrderType === 'receita'
  && item.paymentStatus !== 'recebido'
  ? workOrderTotal(item)
  : 0;

export const clientSignature = (item: Anomaly): MediaItem | undefined =>
  (Array.isArray(item.media) ? item.media : []).find((media) => media?.purpose === 'client_signature');

export const regularWorkOrderMedia = (item: Anomaly): MediaItem[] =>
  (Array.isArray(item.media) ? item.media : []).filter((media) => media?.purpose !== 'client_signature');

export const formatAutomaticCents = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export const parseCurrency = (value: string): number => {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const currencyInput = (value?: number): string => value
  ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '';
