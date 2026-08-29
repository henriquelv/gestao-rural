export const isRecoverableSyncError = (error: any): boolean => {
  const message = String(error?.errorMessage || error?.message || error || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || error?.statusCode || 0);

  return message.includes('[media_pending]')
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('connection')
    || message.includes('load failed')
    || message.includes('gateway')
    || message.includes('temporarily unavailable')
    || message.includes('schema cache')
    || message.includes('employee_id')
    || message.includes('employee_name')
    || message.includes('device_id')
    || message.includes('invalid input syntax')
    || message.includes('bigint')
    || message.includes('settings')
    || message.includes('sectors')
    || code === '42703'
    || code === '42P10'
    || code === '40001'
    || code === '40P01'
    || code.startsWith('08')
    || status === 408
    || status === 429
    || status >= 500;
};
