const asString = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

/** Mantem a mesma identidade local no IndexedDB, SQLite e outbox. */
export function getLocalRecordId(tableName: string, row: unknown): string {
  if (typeof row === 'string' || typeof row === 'number') return asString(row);
  if (!row || typeof row !== 'object') return '';

  const value = row as Record<string, unknown>;
  const farmId = asString(value.farm_id);
  const scoped = (identity: string) => farmId && identity ? `${farmId}_${identity}` : identity;

  if (tableName === 'ui_config' || tableName === 'farm_settings' || tableName === 'settings') {
    return scoped(asString(value.id ?? '1'));
  }

  if (tableName === 'sectors') {
    return scoped(asString(value.name ?? value.id));
  }

  if (tableName === 'milk_daily') {
    return scoped(asString(value.date ?? value.id));
  }

  if (tableName === 'daily_metrics') {
    const date = asString(value.date);
    const type = asString(value.type);
    return date && type ? scoped(`${date}_${type}`) : '';
  }

  if (tableName === 'farm_monthly_stats') {
    return scoped(asString(value.monthKey ?? value.id));
  }

  return asString(value.id ?? value.date ?? value.name);
}

export function getProtectedLocalRecordIds(
  tableName: string,
  unsyncedRecords: Array<{ id: unknown }>,
  outboxItems: Array<{ tableName?: string; op?: string; payload?: unknown }>
): Set<string> {
  const protectedIds = new Set(
    unsyncedRecords.map((record) => asString(record.id)).filter(Boolean)
  );

  for (const item of outboxItems) {
    if (item?.tableName !== tableName || item?.op !== 'delete') continue;
    const deletedId = getLocalRecordId(tableName, item.payload);
    if (deletedId) protectedIds.add(deletedId);
  }

  return protectedIds;
}
